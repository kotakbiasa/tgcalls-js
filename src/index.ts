/**
 * tgcalls-js — pytgcalls-style Telegram group call wrapper for Node.js.
 *
 * Built on the official `ntgcalls` native binding (C++ WebRTC core by the
 * pytgcalls team) and any supported MTProto client (GramJS / teleproto / mtcute).
 *
 * Join flow:
 *   1. channels.getFullChannel(chat)          → full_chat.call (InputGroupCall)
 *   2. ntgcalls.createCall(chatId)            → native join params (JSON w/ ssrc)
 *   3. ntgcalls.setStreamSources(...)         → ffmpeg/yt-dlp PCM source
 *   4. phone.joinGroupCall(params=DataJSON)   → updates contain
 *      UpdateGroupCallConnection with native connect params
 *   5. ntgcalls.connect(chatId, connParams)   → media starts flowing
 */

import { NTgCalls, ConnectionState, StreamMode, StreamType } from 'ntgcalls';
import type {
  ActiveCall,
  AudioSource,
  ChatRef,
  JoinOptions,
  JoinResult,
  MTProtoAdapter,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
import { createAdapter, extractSsrc, sleep } from './adapters/index.js';
import { audioDescription, videoDescription, resolveYouTube, resolveYouTubeStreams, probeVideo } from './media.js';

export interface TgCallsEvents {
  /** Fired when the native audio stream ends (e.g. file finished). */
  streamEnd: (info: StreamEndInfo) => void | Promise<void>;
  /** Fired on native connection state changes. */
  connectionChange: (chatId: bigint, state: ConnectionState) => void | Promise<void>;
  /** Raw TL updates related to group calls (pass-through). */
  update: (update: unknown) => void | Promise<void>;
}

/** Run a user event handler without letting a throw/reject crash the process. */
function fireAndForget(fn: () => unknown): void {
  try {
    Promise.resolve(fn()).catch((err: unknown) => {
      console.error('[tgcalls-js] event handler error:', err);
    });
  } catch (err) {
    console.error('[tgcalls-js] event handler error:', err);
  }
}

export class TgCallsClient {
  /** Direct access to the underlying native instance (advanced use). */
  readonly ntg: NTgCalls;

  private readonly adapter: MTProtoAdapter;
  private readonly opts: TgCallsOptions;
  private readonly calls = new Map<bigint, ActiveCall>();
  /** Chats with a join operation in progress; prevents duplicate parallel joins. */
  private readonly joining = new Set<bigint>();
  private readonly eventHandlers: Partial<TgCallsEvents> = {};
  private updateUninstall: (() => void) | null = null;
  private pendingConnectionParams: string | null = null;
  /** Connection updates have no reliable chat correlation, so consume them serially. */
  private connectionParamsQueue: Promise<void> = Promise.resolve();
  private nativeWired = false;
  /**
   * Per-chat video channel (camera OR screen) with the caller's requested
   * VideoOptions, so setSource() can rebuild it. ntgcalls' setStreamSources
   * REPLACES all devices: any device left out of the description is removed.
   */
  private readonly videoState = new Map<bigint, { device: 'camera' | 'screen'; target: VideoOptions }>();
  /** Per-chat native stream types that already ended (audio/video aware streamEnd). */
  private readonly ended = new Map<bigint, Set<StreamType>>();

  constructor(opts: TgCallsOptions) {
    this.opts = opts;
    this.adapter = createAdapter(opts.client, { Api: opts.Api });
    this.ntg = new NTgCalls();
  }

  /** Register an event handler (last registration wins per event). */
  on<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): void {
    this.eventHandlers[event] = handler;
    if (event !== 'update') {
      this.wireNative();
    }
  }

  /** Marked chat ids of all active calls. */
  activeCalls(): bigint[] {
    return [...this.calls.keys()];
  }

  /** Info about one active call, or null. */
  getCall(chatId: ChatRef): ActiveCall | null {
    return this.calls.get(BigInt(chatId)) ?? null;
  }

  /** True when streaming audio into this chat right now. */
  isActive(chatId: ChatRef): boolean {
    return this.calls.has(BigInt(chatId));
  }

  // ------------------------------------------------------------------ join

  /**
   * Join the voice chat of `chat` and start streaming `source`.
   * Optionally share video from the same source via options.video.
   */
  async join(chat: ChatRef, source: AudioSource, options: JoinOptions = {}): Promise<JoinResult> {
    const chatId = await this.resolveChatId(chat);
    if (this.calls.has(chatId) || this.joining.has(chatId)) {
      throw new Error(`Already in a call in chat ${chatId} — leave() first`);
    }
    this.joining.add(chatId);

    let inputCall: unknown;
    let joinParams: string | undefined;
    try {
      inputCall = await this.adapter.getGroupCall(chatId, options.allowCreate === true);

      // Native join params — created exactly once; the SAME params string must
      // be sent in JoinGroupCall and its ssrc later reused for LeaveGroupCall.
      joinParams = await this.ntg.createCall(chatId);
      return await this.joinInner(chatId, inputCall, joinParams, source, options);
    } catch (err) {
      // Don't leave a half-open native call or a zombie participant behind.
      this.calls.delete(chatId);
      this.videoState.delete(chatId);
      this.ended.delete(chatId);
      await this.ntg.stop(chatId).catch(() => { /* already stopped */ });
      if (inputCall !== undefined && joinParams !== undefined) {
        await this.adapter.leaveGroupCall(inputCall, extractSsrc(joinParams)).catch(() => {
          /* never joined / already gone */
        });
      }
      throw err;
    } finally {
      this.joining.delete(chatId);
    }
  }

  private async joinInner(
    chatId: bigint,
    inputCall: unknown,
    joinParams: string,
    source: AudioSource,
    options: JoinOptions,
  ): Promise<JoinResult> {
    // Media sources set before the MTProto join so media flows immediately.
    const media: Record<string, unknown> = {
      microphone: audioDescription(source, this.opts),
    };
    const cameraVideo = options.presentation !== true
      && options.video !== false
      && options.video !== undefined
      && source.kind !== 'shell';
    if (cameraVideo) {
      const srcPath = source.kind === 'file' ? source.path : source.url;
      const targetOpts = typeof options.video === 'object' ? options.video : {};
      const probed = await probeVideo(srcPath, this.opts, targetOpts);
      media.camera = videoDescription(
        source as Exclude<AudioSource, { kind: 'shell' }>,
        { ...probed, ...targetOpts, width: probed.width, height: probed.height, fps: probed.fps },
        this.opts,
      );
      this.videoState.set(chatId, { device: 'camera', target: targetOpts });
    }
    await this.ntg.setStreamSources(chatId, StreamMode.CAPTURE, media);

    const connParams = await this.joinGroupCall(chatId, inputCall, joinParams, {
      ...options,
      // videoStopped=false only when we actually share camera video.
      muted: options.muted === true,
      videoStopped: !cameraVideo,
    });
    await this.ntg.connect(chatId, connParams, false);

    let presentationActive = false;
    if (options.presentation === true && source.kind !== 'shell') {
      try {
        const srcPath = source.kind === 'file' ? source.path : source.url;
        const targetOpts = typeof options.video === 'object' ? options.video : {};
        const probed = await probeVideo(srcPath, this.opts, targetOpts);
        const videoOpts: VideoOptions = {
          ...probed,
          ...targetOpts,
          width: probed.width,
          height: probed.height,
          fps: probed.fps,
        };
        const presParamsPayload = await this.ntg.initPresentation(chatId);
        // Camera and screen can't be mixed in ntgcalls: this call replaces the
        // camera with the screen channel (audio restarts together with it).
        await this.ntg.setStreamSources(chatId, StreamMode.CAPTURE, {
          microphone: audioDescription(source, this.opts),
          screen: videoDescription(source as Exclude<AudioSource, { kind: 'shell' }>, videoOpts, this.opts),
        });
        this.ended.delete(chatId);
        const presConnParams = await this.joinPresentationCall(inputCall, presParamsPayload);
        await this.ntg.connect(chatId, presConnParams, true);
        presentationActive = true;
        this.videoState.set(chatId, { device: 'screen', target: targetOpts });
      } catch {
        /* Presentation fallback */
      }
    }

    const ssrc = extractSsrc(joinParams);
    this.calls.set(chatId, {
      chatId,
      call: inputCall,
      ssrc,
      source,
      videoActive: !presentationActive && options.video !== false && options.video !== undefined && source.kind !== 'shell',
      presentationActive,
      muted: options.muted === true,
      autoLeave: options.autoLeave !== false,
      joinedAt: Date.now(),
    });
    this.wireNative();
    return { chatId, call: inputCall, ssrc };
  }

  /** join() with a YouTube/any yt-dlp-supported page URL. */
  async joinYouTube(chat: ChatRef, url: string, options: JoinOptions = {}): Promise<JoinResult> {
    const isVideo = Boolean(options.video || options.presentation);
    if (isVideo) {
      // Separate video + audio streams: avoids the low-res pre-merged format.
      const vOpts = typeof options.video === 'object' ? options.video : {};
      const maxHeight = Math.min(vOpts.width ?? 1280, vOpts.height ?? 720);
      const streams = await resolveYouTubeStreams(url, this.opts, maxHeight);
      if (streams === null) {
        throw new Error(`yt-dlp failed to resolve: ${url}`);
      }
      return this.join(chat, {
        kind: 'url',
        url: streams.url,
        ...(streams.audioUrl !== undefined ? { audioUrl: streams.audioUrl } : {}),
      }, options);
    }
    const direct = await resolveYouTube(url, this.opts, false);
    if (direct === null) {
      throw new Error(`yt-dlp failed to resolve: ${url}`);
    }
    return this.join(chat, { kind: 'url', url: direct }, options);
  }

  /** Resolve a YouTube/any yt-dlp-supported page URL to a direct media URL. */
  async resolveYouTube(url: string, video = false): Promise<string | null> {
    return resolveYouTube(url, this.opts, video);
  }

  /**
   * Join a voice chat WITHOUT streaming audio (idle presence).
   *
   * On UDP-restricted hosts the regular RTC join gets ICE-timeout-kicked by
   * Telegram after ~25s. Proven-stable alternative: ensure the call exists as
   * an RTMP-stream call (CreateGroupCall rtmpStream) and join muted with no
   * local sources — the server keeps a broadcaster in the call indefinitely.
   */
  async joinIdle(chat: ChatRef, options: JoinOptions = {}): Promise<JoinResult> {
    const chatId = await this.resolveChatId(chat);
    if (this.calls.has(chatId) || this.joining.has(chatId)) {
      throw new Error(`Already in a call in chat ${chatId} — leave() first`);
    }
    this.joining.add(chatId);

    let inputCall: unknown;
    let joinParams: string | undefined;
    let joinAttempted = false;
    try {
      inputCall = await this.adapter.getGroupCall(chatId, false).catch(() => null);
      if (inputCall === null) {
        if (options.allowCreate !== true) {
          throw new Error('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
        }
        await this.adapter.getGroupCall(chatId, true); // creates (rtmpStream) and returns it
        inputCall = await this.adapter.getGroupCall(chatId, false);
      }

      joinParams = await this.ntg.createCall(chatId);
      const params = await this.withConnectionParams(async () => {
        joinAttempted = true;
        return this.adapter.joinGroupCall(inputCall, joinParams!, {
          ...options,
          muted: true,
          videoStopped: true,
        });
      }, 'JoinGroupCall succeeded but no UpdateGroupCallConnection was received');
      await this.ntg.connect(chatId, params, false);

      const ssrc = extractSsrc(joinParams);
      this.calls.set(chatId, {
        chatId,
        call: inputCall,
        ssrc,
        source: { kind: 'shell', command: '' }, // idle: no media source
        videoActive: false,
        presentationActive: false,
        muted: true,
        autoLeave: false,
        joinedAt: Date.now(),
      });
      this.wireNative();
      return { chatId, call: inputCall, ssrc };
    } catch (err) {
      this.calls.delete(chatId);
      this.videoState.delete(chatId);
      this.ended.delete(chatId);
      await this.ntg.stop(chatId).catch(() => { /* already stopped */ });
      if (joinAttempted && inputCall !== undefined && joinParams !== undefined) {
        await this.adapter.leaveGroupCall(inputCall, extractSsrc(joinParams)).catch(() => {
          /* join failed or participant already gone */
        });
      }
      throw err;
    } finally {
      this.joining.delete(chatId);
    }
  }

  // ---------------------------------------------------------------- control

  /**
   * Leave the call: native stop + phone.leaveGroupCall.
   * Both steps are best-effort so a half-dead call still cleans up.
   */
  async leave(chatId: ChatRef): Promise<void> {
    const id = BigInt(chatId);
    const active = this.calls.get(id);
    this.calls.delete(id);
    this.videoState.delete(id);
    this.ended.delete(id);
    try {
      await this.ntg.stop(id);
    } catch { /* already stopped */ }
    if (active) {
      try {
        await this.adapter.leaveGroupCall(active.call, active.ssrc);
      } catch { /* call may already be gone */ }
    }
  }

  async pause(chatId: ChatRef): Promise<boolean> {
    return this.ntg.pause(BigInt(chatId));
  }

  async resume(chatId: ChatRef): Promise<boolean> {
    return this.ntg.resume(BigInt(chatId));
  }

  async mute(chatId: ChatRef): Promise<boolean> {
    const ok = await this.ntg.mute(BigInt(chatId));
    const active = this.calls.get(BigInt(chatId));
    if (active) {active.muted = true;}
    return ok;
  }

  async unmute(chatId: ChatRef): Promise<boolean> {
    const ok = await this.ntg.unmute(BigInt(chatId));
    const active = this.calls.get(BigInt(chatId));
    if (active) {active.muted = false;}
    return ok;
  }

  /** Seconds streamed so far. */
  async time(chatId: ChatRef): Promise<number> {
    const t = await this.ntg.time(BigInt(chatId), StreamMode.CAPTURE);
    return Number(t);
  }

  /**
   * Swap the audio source of an active call without leaving (queue support).
   * Use on streamEnd to start the next track in the same call.
   */
  async setSource(chatId: ChatRef, source: AudioSource): Promise<void> {
    const id = BigInt(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    const media: Record<string, unknown> = {
      microphone: audioDescription(source, this.opts),
    };
    // ntgcalls removes any device missing from the description, so rebuild the
    // video channel (camera/screen) from the new source or it would vanish.
    const vs = this.videoState.get(id);
    if (vs !== undefined) {
      if (source.kind === 'shell') {
        this.videoState.delete(id); // shell = audio-only, video channel ends
      } else {
        const srcPath = source.kind === 'file' ? source.path : source.url;
        const probed = await probeVideo(srcPath, this.opts, vs.target);
        media[vs.device] = videoDescription(source, probed, this.opts);
      }
    }
    this.ended.delete(id);
    await this.ntg.setStreamSources(id, StreamMode.CAPTURE, media);
    const active = this.calls.get(id);
    if (active) {active.source = source;}
  }

  /**
   * Start screen/video presentation (screen share channel) for an active call.
   * `source` must be file/url (ffmpeg-readable). RTC connection required —
   * not available in STREAM/RTMP connection modes.
   */
  async startPresentation(chatId: ChatRef, source: Exclude<AudioSource, { kind: 'shell' }>, video: VideoOptions = {}): Promise<void> {
    const id = BigInt(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    // 1) native presentation join params — the returned payload goes in the
    //    JoinGroupCallPresentation request itself.
    const params = await this.ntg.initPresentation(id);
    const active = this.calls.get(id);
    const srcPath = source.kind === 'file' ? source.path : source.url;
    const probed = await probeVideo(srcPath, this.opts, video);
    const videoOpts: VideoOptions = {
      ...probed,
      ...video,
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
    };
    // Idle calls (joinIdle) carry an empty shell source: don't start it as audio.
    const hasAudio = active?.source !== undefined
      && !(active.source.kind === 'shell' && active.source.command === '');
    // Camera and screen can't be mixed in ntgcalls, so the screen replaces the
    // camera. Audio is re-sent so it restarts in sync with the screen video.
    await this.ntg.setStreamSources(id, StreamMode.CAPTURE, {
      ...(hasAudio && active ? { microphone: audioDescription(active.source, this.opts) } : {}),
      screen: videoDescription(source, videoOpts, this.opts),
    });
    this.ended.delete(id);
    // 3) MTProto presentation join; connect on the presentation channel
    const connParams = await this.joinPresentationCall(this.calls.get(id)?.call, params);
    await this.ntg.connect(id, connParams, true);
    this.videoState.set(id, { device: 'screen', target: video });
    if (active) {
      active.presentationActive = true;
      active.videoActive = false;
    }
  }

  /** Stop the presentation channel (screen share off, main call stays). */
  async stopPresentation(chatId: ChatRef): Promise<void> {
    const id = BigInt(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    try {
      await this.ntg.stopPresentation(id);
    } catch { /* may not be active */ }
    try {
      await this.adapter.leavePresentationCall(this.calls.get(id)?.call);
    } catch { /* best-effort */ }
    this.videoState.delete(id);
    this.ended.delete(id);
    const active = this.calls.get(id);
    if (active) {active.presentationActive = false;}
  }

  // -------------------------------------------------------------- internals

  private wireNative(): void {
    if (this.nativeWired) {return;}
    this.nativeWired = true;

    this.ntg.onStreamEnd((chatId: bigint, type: StreamType) => {
      // ntgcalls fires once per stream type. Audio-only: react to AUDIO.
      // With a video channel: wait until BOTH audio and video have ended, so
      // a single playback doesn't emit streamEnd twice or auto-leave early.
      const seen = this.ended.get(chatId) ?? new Set<StreamType>();
      seen.add(type);
      this.ended.set(chatId, seen);
      const done = this.videoState.has(chatId)
        ? seen.has(StreamType.AUDIO) && seen.has(StreamType.VIDEO)
        : type === StreamType.AUDIO;
      if (!done) {return;}
      this.ended.delete(chatId);

      const active = this.calls.get(chatId);
      const claimed = this.eventHandlers.streamEnd !== undefined;
      if (active?.autoLeave && !claimed) {
        this.leave(chatId).catch(() => { /* best-effort */ });
      }
      fireAndForget(() => this.eventHandlers.streamEnd?.({
        chatId,
        source: active?.source ?? null,
        willAutoLeave: active?.autoLeave === true && !claimed,
      }));
    });

    this.ntg.onConnectionChange((chatId: bigint, info: { state: ConnectionState }) => {
      if (info.state === ConnectionState.CLOSED || info.state === ConnectionState.FAILED) {
        this.calls.delete(chatId);
        this.videoState.delete(chatId);
        this.ended.delete(chatId);
      }
      fireAndForget(() => this.eventHandlers.connectionChange?.(chatId, info.state));
    });
  }

  /** Resolve any chat ref to a marked id (-100... for channels/supergroups). */
  async resolveChatId(chat: ChatRef): Promise<bigint> {
    return this.adapter.resolveChatId(chat);
  }

  private async joinGroupCall(
    chatId: bigint,
    inputCall: unknown,
    joinParams: string,
    options: JoinOptions,
  ): Promise<string> {
    return this.withConnectionParams(() => this.adapter.joinGroupCall(inputCall, joinParams, options),
      'JoinGroupCall succeeded but no UpdateGroupCallConnection was received');
  }

  private installUpdateHandler(): void {
    if (this.updateUninstall !== null) {return;}
    this.updateUninstall = this.adapter.installUpdateHandler(
      (u) => fireAndForget(() => this.eventHandlers.update?.(u)),
      (params) => { this.pendingConnectionParams = params; },
    );
  }

  private async joinPresentationCall(inputCall: unknown, presentationParams: string): Promise<string> {
    return this.withConnectionParams(() => this.adapter.joinPresentationCall(inputCall, presentationParams),
      'JoinGroupCallPresentation succeeded but no UpdateGroupCallConnection was received');
  }

  /**
   * MTProto connection updates are not reliably correlated to the chat that
   * requested them. Serialize the request and its update wait so parallel
   * joins or presentation changes cannot consume each other's parameters.
   */
  private async withConnectionParams(request: () => Promise<unknown>, errorMessage: string): Promise<string> {
    let release!: () => void;
    const previous = this.connectionParamsQueue;
    this.connectionParamsQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      this.installUpdateHandler();
      this.pendingConnectionParams = null;
      const result = await request();
      const inline = this.adapter.extractConnectionParams(result);
      if (inline !== null) {return inline;}
      for (let i = 0; i < 15; i++) {
        await sleep(200);
        if (this.pendingConnectionParams !== null) {
          const params = this.pendingConnectionParams;
          this.pendingConnectionParams = null;
          return params;
        }
      }
      throw new Error(errorMessage);
    } finally {
      this.pendingConnectionParams = null;
      release();
    }
  }

  /** Cleanup for consumers disposing the MTProto client. */
  dispose(): void {
    if (this.updateUninstall !== null) {
      this.updateUninstall();
      this.updateUninstall = null;
    }
    this.adapter.dispose?.();
    this.calls.clear();
    this.videoState.clear();
    this.ended.clear();
  }
}

export * from './adapters/index.js';
export { loadTl, resetTlCache, loadEvents } from './tl.js';
export { resolveYouTube, resolveYouTubeStreams, pcmCommand, audioDescription, videoDescription, probeVideo } from './media.js';
export { VideoQuality } from './types.js';
export type {
  ActiveCall,
  AudioSource,
  ChatRef,
  JoinOptions,
  JoinResult,
  MTProtoLike,
  MtcuteLike,
  MTProtoAdapter,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
