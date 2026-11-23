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

import { NTgCalls, ConnectionState, ConnectionMode, MediaSource, StreamMode, StreamType, StreamDevice, StreamStatus } from 'ntgcalls';
import type {
  ActiveCall,
  AudioSource,
  ChatRef,
  EditParticipantOptions,
  JoinOptions,
  JoinResult,
  LoopMode,
  MTProtoAdapter,
  PlaybackControls,
  PlaybackFilterOptions,
  RecordOptions,
  RecordingInfo,
  FolderRecordingTarget,
  RecordingStoppedInfo,
  RemoteSourceInfo,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
import { createAdapter, extractSsrc, sleep } from './adapters/index.js';
import { AlreadyInCallError, NoVoiceChatError } from './errors.js';
import { audioDescription, videoDescription, recordingDescription, requireMediaExecutable, resolveYouTube, resolveYouTubeStreams, probeVideo } from './media.js';
import { P2PCallManager, type ListenCallsOptions, type OutgoingCallOptions } from './calls.js';
import { getCallDenialReason as checkCall, type CallCheckOptions, type CallDenialReason } from './eligibility.js';
import { NativeEventRouter } from './native-events.js';
import { FolderRecorder } from './folder-recording.js';
import { BroadcastController, type BroadcastAdapterPort } from './broadcast.js';
import {
  ConferenceController,
  type ConferenceAdapter,
  type ConferenceHandle,
  type ConferenceMessageEvent,
  type ConferenceMessageInput,
  type ConferenceMessageReceipt,
  type ConferenceRef,
  type ConferenceOptions,
  type NativeConferencePort,
} from './conference.js';
import { RtmpPublisher, type RtmpPublisherOptions } from './rtmp.js';
import { GroupParticipantController } from './group-participants.js';
import { type ParticipantInfo } from './participants.js';
import { asBigInt0 } from './adapters/utils.js';
import { StateStore, ResumeController, type SavedGroup, type ResumeOptions, type ResumeReport, type PersistenceError } from './persistence.js';
import {
  normalizeIncomingAudioFrames,
  pushExternalAudioFrame,
  pushExternalVideoFrame,
  type ExternalAudioFrame,
  type ExternalAudioSinkOptions,
  type PushAudioOptions,
  type PushVideoOptions,
} from './external-frames.js';

export interface TgCallsEvents {
  /** Fired when the native audio stream ends (e.g. file finished). */
  streamEnd: (info: StreamEndInfo) => void | Promise<void>;
  /** Fired on native connection state changes. */
  connectionChange: (chatId: bigint, state: ConnectionState) => void | Promise<void>;
  /** Raw TL updates related to group calls (pass-through). */
  update: (update: unknown) => void | Promise<void>;
  recordingStopped: (chatId: bigint, info: RecordingStoppedInfo) => void | Promise<void>;
  recordingError: (chatId: bigint, error: Error) => void | Promise<void>;
  broadcastError: (chatId: bigint, error: Error) => void | Promise<void>;
  conferenceMessage: (event: ConferenceMessageEvent) => void | Promise<void>;
  conferenceError: (error: unknown) => void | Promise<void>;
  persistenceError: (error: PersistenceError) => void | Promise<void>;
  /** A remote participant's stream (camera / microphone / screen) changed state. */
  remoteSourceChange: (chatId: bigint, source: RemoteSourceInfo) => void | Promise<void>;
}

interface ViewerSession {
  nativeId: bigint; call: unknown; dcId: number; source: number;
  mode: 'RTC' | 'STREAM' | 'RTMP'; controller?: BroadcastController;
  options: { requireStream?: boolean };
}

export class TgCallsClient {
  /** Direct access to the underlying native instance (advanced use). */
  readonly ntg: NTgCalls;
  private readonly nativeEvents: NativeEventRouter;

  /** Run a user event handler without letting a throw/reject crash the process. */
  private fireAndForget(fn: () => unknown): void {
    try {
      Promise.resolve(fn()).catch((err: unknown) => {
        this.opts.logger?.error('[tgcalls-js] event handler error:', err);
      });
    } catch (err) {
      this.opts.logger?.error('[tgcalls-js] event handler error:', err);
    }
  }

  private readonly adapter: MTProtoAdapter;
  private readonly opts: TgCallsOptions;
  private readonly calls = new Map<bigint, ActiveCall>();
  /** Previously resolved usernames/links, used by synchronous introspection. */
  private readonly chatAliases = new Map<string, bigint>();
  /** Chats with a join operation in progress; prevents duplicate parallel joins. */
  private readonly joining = new Set<bigint>();
  private readonly eventHandlers: { [K in keyof TgCallsEvents]?: Array<TgCallsEvents[K]> } = {};
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
  /** In-flight leave operations, including cleanup after native disconnection. */
  private readonly pendingLeave = new Map<bigint, Promise<void>>();
  /**
   * Per-chat playlist: queued tracks played in order on streamEnd, plus an
   * optional hold track looped while the queue is empty. The currently playing
   * track is ActiveCall.source (no separate field needed).
   */
  private readonly playlists = new Map<bigint, { queue: AudioSource[]; hold: AudioSource | null }>();
  private readonly playbackControls = new Map<bigint, PlaybackControls>();
  /** Per-chat active recording (incoming audio mixed by ntgcalls → ffmpeg). */
  private readonly recordings = new Map<bigint, RecordingInfo>();
  private static nextFeatureId = -8_000_000_000_000_000_000n;
  private readonly viewers = new Map<bigint, ViewerSession>();
  private readonly featureNativeIds = new Set<bigint>();
  private readonly publishers = new Map<bigint, RtmpPublisher>();
  private conferenceController?: ConferenceController;
  private readonly folderRecorders = new Map<bigint, FolderRecorder>();
  private readonly recordingOperations = new Map<bigint, Promise<unknown>>();
  private readonly groupParticipants = new Map<bigint, GroupParticipantController>();
  /** Active incoming-P2P-call listener, if any. */
  private callManager: P2PCallManager | null = null;
  private readonly stateStore?: StateStore;
  private readonly restoreController?: ResumeController;
  private readonly desiredGroups = new Map<string, SavedGroup>();
  private readonly pausedGroups = new Set<bigint>();
  private readonly groupJoinOptions = new Map<bigint, JoinOptions>();
  private readonly recordingSegments = new Map<bigint, number>();
  private stateInitialization?: Promise<void>;
  private stateWrites: Promise<void> = Promise.resolve();
  private persistenceSuspended = 0;

  constructor(opts: TgCallsOptions) {
    this.opts = { logger: { error: console.error.bind(console) }, ...opts };
    this.adapter = createAdapter(opts.client, { Api: opts.Api });
    this.ntg = new NTgCalls();
    this.nativeEvents = new NativeEventRouter(this.ntg, (error) => {
      this.opts.logger?.error('[tgcalls-js] native event consumer failed:', error);
    });
    if (opts.statePath) {
      this.stateStore = new StateStore(opts.statePath, {
        ...opts.persistence, onError: (error) => this.emit('persistenceError', error),
      });
      this.restoreController = new ResumeController(this.stateStore, {
        isActive: (id) => this.calls.has(id) || this.joining.has(id),
        joinGroup: async (id, source, flags) => {
          const join: JoinOptions = {
            allowCreate: false, muted: true, paused: true, autoLeave: false,
            inviteHash: flags.inviteHash,
            ...(flags.video ? { video: flags.video.options, presentation: flags.video.device === 'screen' } : {}),
          };
          if (source) {return this.join(id, source, join);}
          return this.joinIdle(id, join);
        },
        joinViewer: (id) => this.joinStreamMode(id),
        restorePlaylist: async (id, playlist) => {this.playlists.set(id, { queue: [...playlist.queue], hold: playlist.hold });},
        setPaused: async (id, paused) => {if (paused) {await this.pause(id);} else {await this.resume(id);}},
        setMuted: async (id, muted) => {if (muted) {await this.mute(id);} else {await this.unmute(id);}},
        setAutoLeave: async (id, autoLeave) => {const call = this.calls.get(id); if (!call) {throw new Error('Restored group is no longer active');} call.autoLeave = autoLeave;},
        startRecording: async (id, target, recordOptions) => {
          await this.startRecording(id, target);
          this.recordingSegments.set(id, recordOptions.segment);
        },
        rollback: (id) => this.leave(id),
      }, opts.restore);
    }
  }

  /**
   * Register an event handler. Multiple handlers per event are supported and all
   * run (in registration order). Returns an unsubscribe function. Registering any
   * `streamEnd` handler suppresses auto-leave.
   */
  on<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): () => void {
    const list = (this.eventHandlers[event] ??= []) as Array<TgCallsEvents[K]>;
    list.push(handler);
    if (event !== 'update') {
      this.wireNative();
    }
    return () => this.off(event, handler);
  }

  /** Remove a previously registered handler (no-op if not registered). */
  off<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): void {
    const list = this.eventHandlers[event] as Array<TgCallsEvents[K]> | undefined;
    if (!list) {return;}
    const i = list.indexOf(handler);
    if (i >= 0) {list.splice(i, 1);}
  }

  /** Register a handler that runs once, then removes itself. Returns unsubscribe. */
  once<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): () => void {
    const wrap = ((...args: Parameters<TgCallsEvents[K]>) => {
      this.off(event, wrap as TgCallsEvents[K]);
      return (handler as (...a: any[]) => unknown)(...args);
    }) as TgCallsEvents[K];
    return this.on(event, wrap);
  }

  /** Run every registered handler for an event; a throwing handler never crashes. */
  private emit<K extends keyof TgCallsEvents>(event: K, ...args: Parameters<TgCallsEvents[K]>): void {
    const list = this.eventHandlers[event];
    if (!list || list.length === 0) {return;}
    for (const h of [...list]) {
      this.fireAndForget(() => (h as (...a: any[]) => unknown)(...args));
    }
  }

  /** Marked chat ids of all active calls. */
  activeCalls(): bigint[] {
    return [...this.calls.keys()];
  }

  /** Info about one active call, or null. Resolve a username first for this sync lookup. */
  getCall(chatId: ChatRef): ActiveCall | null {
    const id = this.cachedChatId(chatId);
    return id === undefined ? null : (this.calls.get(id) ?? null);
  }

  /** True when streaming audio into this chat right now; resolve aliases first. */
  isActive(chatId: ChatRef): boolean {
    const id = this.cachedChatId(chatId);
    return id !== undefined && this.calls.has(id);
  }

  /** Wait for the latest desired group snapshot to reach the state file. */
  async flushState(): Promise<void> {
    if (!this.stateStore) {return;}
    await this.initializeState();
    for (const id of this.calls.keys()) {await this.persistGroup(id);}
    await this.stateWrites;
  }

  /** Explicitly rejoin saved groups; P2P/conference keys and native sockets are never restored. */
  async resumeFromState(options: ResumeOptions = {}): Promise<ResumeReport> {
    if (!this.restoreController) {throw new Error('resumeFromState requires statePath');}
    await this.initializeState();
    this.persistenceSuspended++;
    let report: ResumeReport;
    try {report = await this.restoreController.resume(options);}
    finally {this.persistenceSuspended--;}
    for (const id of report.restored) {await this.persistGroup(id);}
    return report;
  }

  private initializeState(): Promise<void> {
    if (!this.stateStore) {return Promise.resolve();}
    return this.stateInitialization ??= this.stateStore.load().then((saved) => {
      for (const group of saved.groups) {this.desiredGroups.set(group.chatId, group);}
    });
  }

  private persistGroup(id: bigint, remove = false): Promise<void> {
    if (!this.stateStore || this.persistenceSuspended) {return Promise.resolve();}
    const update = this.stateWrites.then(async () => {
      await this.initializeState();
      const active = this.calls.get(id);
      if (remove) {this.desiredGroups.delete(String(id));}
      else if (active) {
        const video = this.videoState.get(id);
        const queue = this.playlists.get(id);
        const recording = this.recordings.get(id);
        const join = this.groupJoinOptions.get(id);
        this.desiredGroups.set(String(id), {
          kind: this.viewers.has(id) ? 'group-viewer' : 'group-rtc', chatId: String(id),
          source: this.isIdleSource(active.source) ? null : { ...active.source },
          join: { muted: active.muted, autoLeave: active.autoLeave, ...(join?.inviteHash ? { inviteHash: join.inviteHash } : {}) },
          paused: this.pausedGroups.has(id),
          playlist: { queue: (queue?.queue ?? []).map((source) => ({ ...source })), hold: queue?.hold ? { ...queue.hold } : null },
          ...(video ? { video: { device: video.device, options: { ...video.target } } } : {}),
          ...(recording ? { recording: { target: recording.mode === 'folder'
            ? { dir: recording.path, video: recording.video } : recording.path, segment: this.recordingSegments.get(id) ?? 0 } } : {}),
        });
      }
      await this.stateStore!.save([...this.desiredGroups.values()]);
    });
    this.stateWrites = update.catch(() => {}); // returned promise/event retains the original error
    return update;
  }

  // ------------------------------------------------------------------ join

  /**
   * Join the voice chat of `chat` and start streaming `source`.
   * Optionally share video from the same source via options.video.
   */
  async join(chat: ChatRef, source: AudioSource, options: JoinOptions = {}): Promise<JoinResult> {
    const chatId = await this.resolveChatId(chat);
    if (this.calls.has(chatId) || this.joining.has(chatId)) {
      throw new AlreadyInCallError(chatId);
    }
    this.joining.add(chatId);

    let inputCall: unknown;
    let joinParams: string | undefined;
    try {
      await this.initializeState();
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
    const controls = this.playbackControls.get(chatId);
    const playback = controls ? { volume: controls.volume, speed: controls.speed } : undefined;
    const media: Record<string, unknown> = {
      microphone: audioDescription(source, this.opts, playback),
    };
    const cameraVideo = options.presentation !== true
      && options.video !== false
      && options.video !== undefined
      && source.kind !== 'shell'
      && source.kind !== 'external';
    if (cameraVideo) {
      const srcPath = source.kind === 'file' ? source.path : source.url;
      const targetOpts = typeof options.video === 'object' ? options.video : {};
      const probed = await probeVideo(srcPath, this.opts, targetOpts);
      media.camera = videoDescription(
        source as Exclude<AudioSource, { kind: 'shell' | 'external' }>,
        { ...probed, ...targetOpts, width: probed.width, height: probed.height, fps: probed.fps },
        this.opts,
        playback,
      );
      this.videoState.set(chatId, { device: 'camera', target: targetOpts });
    }
    await this.ntg.setStreamSources(chatId, StreamMode.CAPTURE, media);
    if (options.muted) {await this.ntg.mute(chatId);}
    if (options.paused) {await this.ntg.pause(chatId); this.pausedGroups.add(chatId);}
    this.wireNative();

    const connParams = await this.joinGroupCall(inputCall, joinParams, {
      ...options,
      // videoStopped=false only when we actually share camera video.
      muted: options.muted === true,
      videoStopped: !cameraVideo,
    });
    await this.ntg.connect(chatId, connParams, false);

    let presentationActive = false;
    if (options.presentation === true && source.kind !== 'shell' && source.kind !== 'external') {
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
          screen: videoDescription(source as Exclude<AudioSource, { kind: 'shell' | 'external' }>, videoOpts, this.opts),
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
      videoActive: !presentationActive && options.video !== false && options.video !== undefined && source.kind !== 'shell' && source.kind !== 'external',
      presentationActive,
      muted: options.muted === true,
      autoLeave: options.autoLeave !== false,
      joinedAt: Date.now(),
    });
    this.groupJoinOptions.set(chatId, { ...options });
    this.wireNative();
    await this.persistGroup(chatId);
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
   * Telegram after ~25s. When creating a missing call with allowCreate, this
   * creates it in RTMP-stream mode and joins muted with no local sources. An
   * already-existing call is not converted, so its connection mode is unchanged.
   */
  async joinIdle(chat: ChatRef, options: JoinOptions = {}): Promise<JoinResult> {
    const chatId = await this.resolveChatId(chat);
    if (this.calls.has(chatId) || this.joining.has(chatId)) {
      throw new AlreadyInCallError(chatId);
    }
    this.joining.add(chatId);

    let inputCall: unknown;
    let joinParams: string | undefined;
    let joinAttempted = false;
    try {
      await this.initializeState();
      inputCall = await this.adapter.getGroupCall(chatId, false).catch(() => null);
      if (inputCall === null) {
        if (options.allowCreate !== true) {
          throw new NoVoiceChatError();
        }
        // RTMP mode keeps idle presence alive on hosts that cannot establish
        // an RTC media path. Existing calls cannot be converted to RTMP.
        inputCall = await this.adapter.getGroupCall(chatId, true, true);
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
      await this.ntg.mute(chatId);
      if (options.paused) {await this.ntg.pause(chatId); this.pausedGroups.add(chatId);}
      this.wireNative();
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
      this.groupJoinOptions.set(chatId, { ...options });
      this.wireNative();
      await this.persistGroup(chatId);
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

  private allocateFeatureId(): bigint {
    const id = --TgCallsClient.nextFeatureId;
    this.featureNativeIds.add(id);
    return id;
  }
  private nativeGroupId(id: bigint): bigint { return this.viewers.get(id)?.nativeId ?? id; }
  private publicGroupId(nativeId: bigint): bigint {
    for (const [id, viewer] of this.viewers) if (viewer.nativeId === nativeId) return id;
    return nativeId;
  }

  /** Prepare an RTMP publisher; options.source starts the actual ffmpeg upload. */
  async joinRtmp(chat: ChatRef, url: string, key: string, options: RtmpPublisherOptions & {
    source?: AudioSource; video?: VideoOptions; allowCreate?: boolean;
  } = {}): Promise<RtmpPublisher> {
    const id = await this.resolveChatId(chat);
    const adapter = this.adapter as MTProtoAdapter & { getGroupCallInfo?: (call: unknown) => Promise<{ rtmpStream: boolean }> };
    if (!adapter.getGroupCallInfo) throw new Error('RTMP publishing needs group metadata adapter support');
    requireMediaExecutable(options.ffmpegPath ?? this.opts.ffmpegPath ?? 'ffmpeg', 'ffmpeg');
    const publisher = new RtmpPublisher(url, key, { ffmpegPath: this.opts.ffmpegPath, logger: this.opts.logger, ...options });
    const call = await adapter.getGroupCall(id, options.allowCreate === true, true);
    const info = await adapter.getGroupCallInfo(call);
    if (!info.rtmpStream) throw new Error('Existing voice chat is not an RTMP stream');
    const previous = this.publishers.get(id);
    if (previous) await previous.close();
    this.publishers.set(id, publisher);
    try { if (options.source) await publisher.play(options.source, options.video); }
    catch (error) { this.publishers.delete(id); await publisher.close(); throw error; }
    return publisher;
  }

  async getStreamRtmpUrl(chat: ChatRef): Promise<{ url: string; key: string }> {
    const adapter = this.adapter as MTProtoAdapter & { getStreamRtmpUrl?: (id: bigint, options: { revoke: false }) => Promise<{ url: string; key: string }> };
    if (!adapter.getStreamRtmpUrl) throw new Error('This adapter cannot fetch RTMP endpoints');
    return adapter.getStreamRtmpUrl(await this.resolveChatId(chat), { revoke: false });
  }

  /** Join with server-selected stream mode. RTC is refused unless explicitly allowed. */
  async joinStreamMode(chat: ChatRef, options: { requireStream?: boolean } = {}): Promise<JoinResult & { mode: 'RTC' | 'STREAM' | 'RTMP' }> {
    const id = await this.resolveChatId(chat);
    if (this.calls.has(id) || this.joining.has(id)) throw new AlreadyInCallError(id);
    const adapter = this.adapter as MTProtoAdapter & Partial<BroadcastAdapterPort> & {
      getGroupCallInfo?: (call: unknown) => Promise<{ streamDcId?: number }>;
    };
    if (!adapter.getGroupCallInfo || !adapter.getStreamChannels || !adapter.downloadStreamChunk) throw new Error('This adapter does not support broadcast viewing');
    this.wireBroadcast();
    this.joining.add(id);
    const viewer: ViewerSession = { nativeId: this.allocateFeatureId(), call: undefined, dcId: 0, source: 0, mode: 'RTC', options };
    this.viewers.set(id, viewer);
    try {
      await this.initializeState();
      this.wireNative();
      await this.prepareViewer(id, viewer);
      await this.persistGroup(id);
      return { chatId: id, call: viewer.call, ssrc: viewer.source, mode: viewer.mode };
    } catch (error) {
      await this.leaveResolved(id);
      throw error;
    } finally { this.joining.delete(id); }
  }

  private async prepareViewer(id: bigint, viewer: ViewerSession, signal?: AbortSignal): Promise<{ call: unknown; dcId: number }> {
    const adapter = this.adapter as MTProtoAdapter & BroadcastAdapterPort & {
      getGroupCallInfo(call: unknown): Promise<{ streamDcId?: number }>;
    };
    signal?.throwIfAborted();
    viewer.call = await adapter.getGroupCall(id, false);
    const info = await adapter.getGroupCallInfo(viewer.call);
    signal?.throwIfAborted();
    const payload = await this.ntg.createCall(viewer.nativeId);
    viewer.source = extractSsrc(payload);
    let joined = false;
    try {
      const params = await this.withConnectionParams(async () => {
        joined = true;
        return adapter.joinGroupCall(viewer.call, payload, { muted: true, videoStopped: true });
      }, 'Broadcast join returned no connection parameters');
      signal?.throwIfAborted();
      const connection = JSON.parse(params) as { stream?: boolean; rtmp?: boolean };
      viewer.mode = connection.stream === true ? connection.rtmp === true ? 'RTMP' : 'STREAM' : 'RTC';
      if (viewer.options.requireStream !== false && viewer.mode === 'RTC') throw new Error('Server selected RTC; stream mode is unavailable');
      viewer.dcId = info.streamDcId ?? 0;
      if (viewer.mode !== 'RTC') {
        if (!Number.isInteger(viewer.dcId) || viewer.dcId < 1) throw new Error('Broadcast stream has no valid media DC');
        if (!viewer.controller) viewer.controller = new BroadcastController({
          handle: viewer.nativeId, call: viewer.call, dcId: viewer.dcId,
          native: {
            sendBroadcastPart: (handle, segment, part, status, quality, bytes) => this.ntg.sendBroadcastPart(viewer.nativeId, segment, part, status, quality, bytes as unknown as Buffer),
            sendBroadcastTimestamp: (handle, timestamp) => this.ntg.sendBroadcastTimestamp(viewer.nativeId, timestamp),
          },
          adapter, logger: this.opts.logger,
          rejoin: async (abort) => {
            // Controller has drained native requests; never stop the controller from its own hook.
            const old = this.calls.get(id), oldNativeId = viewer.nativeId;
            await this.recordingOperation(id, () => this.stopRecordingInner(id, 'rejoin'));
            viewer.nativeId = this.allocateFeatureId();
            await this.ntg.stop(oldNativeId);
            if (old) await adapter.leaveGroupCall(old.call, old.ssrc).catch(() => {});
            return this.prepareViewer(id, viewer, abort);
          },
          onError: (error) => this.emit('broadcastError', id, error),
        });
      }
      await this.ntg.setStreamSources(viewer.nativeId, StreamMode.PLAYBACK, {
        microphone: { mediaSource: MediaSource.EXTERNAL, sampleRate: 48000, channelCount: 1, input: '', keepOpen: true },
        camera: { mediaSource: MediaSource.EXTERNAL, width: 1280, height: 720, fps: 25, input: '', keepOpen: true },
        screen: { mediaSource: MediaSource.EXTERNAL, width: 1280, height: 720, fps: 25, input: '', keepOpen: true },
      });
      await this.ntg.mute(viewer.nativeId);
      await this.ntg.connect(viewer.nativeId, params, false);
      signal?.throwIfAborted();
      this.calls.set(id, { chatId: id, call: viewer.call, ssrc: viewer.source, source: { kind: 'shell', command: '' },
        videoActive: false, presentationActive: false, muted: true, autoLeave: false, joinedAt: Date.now() });
      return { call: viewer.call, dcId: viewer.dcId };
    } catch (error) {
      if (joined) await adapter.leaveGroupCall(viewer.call, viewer.source).catch(() => {});
      await this.ntg.stop(viewer.nativeId).catch(() => {});
      throw error;
    }
  }

  // ---------------------------------------------------------------- control

  /**
   * Leave the call: native stop + phone.leaveGroupCall.
   * Both steps are best-effort so a half-dead call still cleans up.
   */
  async leave(chatId: ChatRef): Promise<void> {
    const id = await this.resolveChatId(chatId);
    const publisher = this.publishers.get(id);
    if (publisher) { await publisher.close(); this.publishers.delete(id); }
    await this.leaveResolved(id);
    this.pausedGroups.delete(id);
    this.groupJoinOptions.delete(id);
    this.recordingSegments.delete(id);
    await this.persistGroup(id, true);
  }

  /** Stop local media and leave MTProto using the call metadata captured before cleanup. */
  private leaveResolved(id: bigint): Promise<void> {
    const pending = this.pendingLeave.get(id);
    if (pending !== undefined) {return pending;}

    const active = this.calls.get(id);
    const viewer = this.viewers.get(id);
    this.calls.delete(id);
    this.videoState.delete(id);
    this.ended.delete(id);
    this.playlists.delete(id);
    this.playbackControls.delete(id);

    let finish!: () => void;
    const cleanup = new Promise<void>((resolve) => { finish = resolve; });
    this.pendingLeave.set(id, cleanup);
    void (async () => {
      try {
        try { await this.recordingOperation(id, () => this.stopRecordingInner(id, 'leave')); }
        catch (error) { this.emit('recordingError', id, error instanceof Error ? error : new Error(String(error))); }
        this.groupParticipants.get(id)?.close();
        this.groupParticipants.delete(id);
        try { await viewer?.controller?.stop(); } catch (error) { this.opts.logger?.error('[tgcalls-js] viewer stop failed:', error); }
        this.viewers.delete(id);
        try {
          await this.ntg.stop(viewer?.nativeId ?? id);
        } catch { /* already stopped */ }
        if (active?.presentationActive) {
          try {
            await this.adapter.leavePresentationCall(active.call);
          } catch { /* presentation may already be gone */ }
        }
        if (active) {
          try {
            await this.adapter.leaveGroupCall(active.call, active.ssrc);
          } catch { /* call may already be gone */ }
        }
      } finally {
        if (this.pendingLeave.get(id) === cleanup) {
          this.pendingLeave.delete(id);
        }
        finish();
      }
    })();
    return cleanup;
  }

  async pause(chatId: ChatRef): Promise<boolean> {
    const id = await this.resolveChatId(chatId);
    const ok = await this.ntg.pause(this.nativeGroupId(id));
    this.pausedGroups.add(id);
    await this.persistGroup(id);
    return ok;
  }

  async resume(chatId: ChatRef): Promise<boolean> {
    const id = await this.resolveChatId(chatId);
    const ok = await this.ntg.resume(this.nativeGroupId(id));
    this.pausedGroups.delete(id);
    await this.persistGroup(id);
    return ok;
  }

  async mute(chatId: ChatRef): Promise<boolean> {
    const id = await this.resolveChatId(chatId);
    const ok = await this.ntg.mute(this.nativeGroupId(id));
    const active = this.calls.get(id);
    if (active) {active.muted = true;}
    await this.persistGroup(id);
    return ok;
  }

  async unmute(chatId: ChatRef): Promise<boolean> {
    const id = await this.resolveChatId(chatId);
    const ok = await this.ntg.unmute(this.nativeGroupId(id));
    const active = this.calls.get(id);
    if (active) {active.muted = false;}
    await this.persistGroup(id);
    return ok;
  }

  /** Seconds streamed so far. */
  async time(chatId: ChatRef): Promise<number> {
    const id = await this.resolveChatId(chatId);
    const t = await this.ntg.time(this.nativeGroupId(id), StreamMode.CAPTURE);
    return Number(t);
  }

  /**
   * The four-emoji key fingerprint of the call (both sides must see the same
   * emojis — the out-of-band check against a man in the middle). Returns `null`
   * when we are not in that call or the native core has not computed it yet.
   */
  async getEmojiFingerprint(chat: ChatRef | ConferenceHandle): Promise<string | null> {
    if (typeof chat === 'object') return this.conferences().getEmojiFingerprint(chat);
    const id = await this.resolveChatId(chat);
    if (!this.calls.has(id) && !this.activeCallPeers().includes(id)) {return null;}
    try {
      const emojis = await this.ntg.getEmojisFingerprint(this.nativeGroupId(id));
      return emojis && emojis.length > 0 ? emojis : null;
    } catch {
      return null;
    }
  }

  /** How the native core is currently carrying the media: RTC, STREAM or RTMP. */
  async getConnectionMode(chat: ChatRef): Promise<string | null> {
    const id = await this.resolveChatId(chat);
    try {
      const mode = await this.ntg.getConnectionMode(this.nativeGroupId(id));
      return new Map<number, string>([[ConnectionMode.NONE, 'NONE'], [ConnectionMode.RTC, 'RTC'],
        [ConnectionMode.STREAM, 'STREAM'], [ConnectionMode.RTMP, 'RTMP']]).get(mode) ?? String(mode);
    } catch {
      return null;
    }
  }

  /**
   * Swap the audio source of an active call without leaving (queue support).
   * Use on streamEnd to start the next track in the same call.
   */
  async setSource(chatId: ChatRef, source: AudioSource, playback?: PlaybackFilterOptions): Promise<void> {
    const id = await this.resolveChatId(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    if (this.viewers.has(id) && this.viewers.get(id)!.mode !== 'RTC') throw new Error('Stream viewers cannot capture media; use joinRtmp for publishing');
    const controls = this.playbackControls.get(id);
    const effectivePlayback: PlaybackFilterOptions | undefined = playback || controls
      ? {
          volume: playback?.volume ?? controls?.volume ?? 100,
          speed: playback?.speed ?? controls?.speed ?? 1,
          ...(playback?.startSec !== undefined ? { startSec: playback.startSec } : {}),
        }
      : undefined;
    const media: Record<string, unknown> = {
      microphone: audioDescription(source, this.opts, effectivePlayback),
    };
    // ntgcalls removes any device missing from the description, so rebuild the
    // video channel (camera/screen) from the new source or it would vanish.
    const vs = this.videoState.get(id);
    if (vs !== undefined) {
      if (source.kind === 'shell' || source.kind === 'external') {
        this.videoState.delete(id); // shell/external = audio-only, video channel ends
      } else {
        const srcPath = source.kind === 'file' ? source.path : source.url;
        const probed = await probeVideo(srcPath, this.opts, vs.target);
        media[vs.device] = videoDescription(source, probed, this.opts, effectivePlayback);
      }
    }
    this.ended.delete(id);
    await this.ntg.setStreamSources(this.nativeGroupId(id), StreamMode.CAPTURE, media);
    const active = this.calls.get(id);
    if (active) {active.source = source;}
    await this.persistGroup(id);
  }

  private ensurePlaybackControls(id: bigint): PlaybackControls {
    let controls = this.playbackControls.get(id);
    if (!controls) {
      controls = { volume: 100, speed: 1, loop: 'off' };
      this.playbackControls.set(id, controls);
    }
    return controls;
  }

  /**
   * Seek the current file/url track to `seconds` (>= 0) by restarting the
   * ffmpeg pipeline at `-ss <seconds>` while preserving volume, speed, and video.
   */
  async seek(chat: ChatRef, seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('Seek position must be a non-negative finite number of seconds');
    }
    const id = await this.resolveChatId(chat);
    const active = this.calls.get(id);
    if (!active) {throw new Error(`No active call in chat ${id}`);}
    if (active.source.kind !== 'file' && active.source.kind !== 'url') {
      throw new Error(`Cannot seek a ${active.source.kind} source — seek requires a file or url source`);
    }
    await this.setSource(id, active.source, { startSec: seconds });
  }

  /**
   * Set playback volume percentage (0..200, default 100). If a file/url track is
   * active, reapplies the ffmpeg audio filter immediately from the current position.
   */
  async setVolume(chat: ChatRef, percent: number): Promise<void> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 200) {
      throw new Error('Volume must be a finite number between 0 and 200');
    }
    const id = await this.resolveChatId(chat);
    this.ensurePlaybackControls(id).volume = percent;
    const active = this.calls.get(id);
    if (active && (active.source.kind === 'file' || active.source.kind === 'url')) {
      const pos = await this.time(id).catch(() => 0);
      await this.setSource(id, active.source, pos > 0 ? { startSec: pos } : undefined);
    }
  }

  /**
   * Set playback speed multiplier (0.5..2.0, default 1.0). If a file/url track is
   * active, reapplies audio `atempo` (and video `setpts`) immediately.
   */
  async setSpeed(chat: ChatRef, rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2.0) {
      throw new Error('Speed must be a finite number between 0.5 and 2.0');
    }
    const id = await this.resolveChatId(chat);
    this.ensurePlaybackControls(id).speed = rate;
    const active = this.calls.get(id);
    if (active && (active.source.kind === 'file' || active.source.kind === 'url')) {
      const pos = await this.time(id).catch(() => 0);
      await this.setSource(id, active.source, pos > 0 ? { startSec: pos } : undefined);
    }
  }

  /** Set playlist loop mode: `'off'` (default), `'one'` (repeat current), or `'all'` (rotate queue). */
  async setLoop(chat: ChatRef, mode: LoopMode): Promise<void> {
    if (mode !== 'off' && mode !== 'one' && mode !== 'all') {
      throw new Error(`Invalid loop mode "${String(mode)}" — expected 'off', 'one', or 'all'`);
    }
    const id = await this.resolveChatId(chat);
    this.ensurePlaybackControls(id).loop = mode;
  }

  /** Current playlist loop mode for this chat (sync; resolved aliases only). */
  getLoop(chat: ChatRef): LoopMode {
    const id = this.cachedChatId(chat);
    return id === undefined ? 'off' : (this.playbackControls.get(id)?.loop ?? 'off');
  }

  /** Current volume/speed/loop settings for this chat (sync; resolved aliases only). */
  getPlaybackControls(chat: ChatRef): PlaybackControls {
    const id = this.cachedChatId(chat);
    const controls = id === undefined ? undefined : this.playbackControls.get(id);
    return controls ? { ...controls } : { volume: 100, speed: 1, loop: 'off' };
  }

  // ------------------------------------------------ group participant controls

  /** Fetch and return the current participant snapshot for an active group call. */
  async getParticipants(chat: ChatRef): Promise<ParticipantInfo[]> {
    const id = await this.resolveChatId(chat);
    const active = this.calls.get(id);
    if (!active) {throw new Error(`No active call in chat ${id}`);}
    const controller = await this.ensureParticipants(id, active.call);
    return controller.registry.snapshot();
  }

  /** Edit a participant's state in an active group call (mute, volume, raiseHand, video). */
  async editParticipant(
    chat: ChatRef,
    participant: ChatRef | 'self',
    options: EditParticipantOptions,
  ): Promise<void> {
    const id = await this.resolveChatId(chat);
    const active = this.calls.get(id);
    if (!active) {throw new Error(`No active call in chat ${id}`);}
    if (!this.adapter.editGroupCallParticipant) {
      throw new Error('This adapter does not support phone.editGroupCallParticipant');
    }
    await this.adapter.editGroupCallParticipant(active.call, participant, options);
  }

  /** Raise or lower our own hand in an active group voice chat. */
  async setRaiseHand(chat: ChatRef, raised: boolean): Promise<void> {
    await this.editParticipant(chat, 'self', { raiseHand: raised });
  }

  /** Mute or unmute a participant in an active group voice chat (requires admin rights). */
  async muteParticipant(chat: ChatRef, participant: ChatRef, muted = true): Promise<void> {
    await this.editParticipant(chat, participant, { muted });
  }

  /** Set a participant's volume in an active group voice chat (0..200%, where 100% = Telegram 10000). */
  async setParticipantVolume(chat: ChatRef, participant: ChatRef, percent: number): Promise<void> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 200) {
      throw new Error('Participant volume must be a finite number between 0 and 200');
    }
    await this.editParticipant(chat, participant, { volume: Math.round(percent * 100) });
  }

  // ------------------------------------------------------------- playlist

  /**
   * Join the voice chat (if not already in one) and start playing `source` now,
   * replacing any current track. The call is kept open (autoLeave off) so the
   * playlist controls when to leave; use enqueue()/then() to queue more tracks.
   */
  async play(chat: ChatRef, source: AudioSource, options: JoinOptions = {}): Promise<JoinResult> {
    const id = await this.resolveChatId(chat);
    if (!this.calls.has(id)) {
      const res = await this.join(id, source, { autoLeave: false, ...options });
      this.ensurePlaylist(id);
      return res;
    }
    this.ensurePlaylist(id);
    await this.setSource(id, source);
    const active = this.calls.get(id)!;
    return { chatId: id, call: active.call, ssrc: active.ssrc };
  }

  /**
   * Queue a track to play after the current one finishes. If no call is active,
   * joins and starts it; if the call is idle, starts it immediately; otherwise
   * appends to the queue. Alias: then().
   */
  async enqueue(chat: ChatRef, source: AudioSource): Promise<void> {
    const id = await this.resolveChatId(chat);
    const pl = this.ensurePlaylist(id);
    const active = this.calls.get(id);
    if (!active) {
      await this.join(id, source, { autoLeave: false });
      return;
    }
    if (this.isIdleSource(active.source)) {
      await this.setSource(id, source);
      return;
    }
    pl.queue.push(source);
    await this.persistGroup(id);
  }

  /** Alias of enqueue(): queue a track after the current one. */
  async then(chat: ChatRef, source: AudioSource): Promise<void> {
    return this.enqueue(chat, source);
  }

  /**
   * Skip to the next queued track (or the hold track). With nothing queued,
   * pauses playback (the call stays open).
   */
  async skip(chat: ChatRef): Promise<void> {
    const id = await this.resolveChatId(chat);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    const pl = this.ensurePlaylist(id);
    const next = pl.queue.shift() ?? pl.hold;
    if (next) {
      await this.setSource(id, next);
    } else {
      await this.ntg.pause(this.nativeGroupId(id));
    }
  }

  /** Set a track looped while the queue is empty (hold music). Pass null to clear. */
  async playOnHold(chat: ChatRef, source: AudioSource | null): Promise<void> {
    const id = await this.resolveChatId(chat);
    this.ensurePlaylist(id).hold = source;
    await this.persistGroup(id);
  }

  /** Clear the queue and the hold track (the current track keeps playing). */
  async clearQueue(chat: ChatRef): Promise<void> {
    const id = await this.resolveChatId(chat);
    const pl = this.playlists.get(id);
    if (pl) {pl.queue = []; pl.hold = null;}
    await this.persistGroup(id);
  }

  /** The source currently playing in this chat, or null. Sync (resolved aliases only). */
  getCurrent(chat: ChatRef): AudioSource | null {
    return this.getCall(chat)?.source ?? null;
  }

  /** A copy of the queued tracks for this chat. Sync (resolved aliases only). */
  getQueue(chat: ChatRef): AudioSource[] {
    const id = this.cachedChatId(chat);
    if (id === undefined) {return [];}
    return [...(this.playlists.get(id)?.queue ?? [])];
  }

  private ensurePlaylist(id: bigint): { queue: AudioSource[]; hold: AudioSource | null } {
    let pl = this.playlists.get(id);
    if (!pl) {
      pl = { queue: [], hold: null };
      this.playlists.set(id, pl);
    }
    return pl;
  }

  private isIdleSource(source: AudioSource | undefined): boolean {
    return source === undefined || (source.kind === 'shell' && source.command.trim() === '');
  }

  /**
   * Advance to the next queued track (or hold loop) when a playback ends.
   * Returns true if a new source was started (so the caller must not auto-leave).
   */
  private async advancePlaylist(id: bigint): Promise<boolean> {
    const loop = this.playbackControls.get(id)?.loop ?? 'off';
    const active = this.calls.get(id);
    if (loop === 'one' && active && !this.isIdleSource(active.source)) {
      await this.setSource(id, active.source);
      return true;
    }
    if (loop === 'all' && active && !this.isIdleSource(active.source)) {
      const pl = this.ensurePlaylist(id);
      pl.queue.push(active.source);
      const next = pl.queue.shift();
      if (next) {
        await this.setSource(id, next);
        return true;
      }
    }
    const pl = this.playlists.get(id);
    if (!pl) {return false;}
    const next = pl.queue.shift() ?? pl.hold;
    if (!next) {return false;}
    await this.setSource(id, next);
    return true;
  }

  // ------------------------------------------------------------- recording

  /**
   * Record incoming call audio to `path` (container inferred from the extension,
   * e.g. .wav / .mp3 / .opus). ntgcalls mixes all remote speakers and pipes PCM
   * to ffmpeg, which encodes the file. Requires an active call. One recording
   * per chat; calling again replaces it. Stop with stopRecording().
   */
  async startRecording(chat: ChatRef, target: string | FolderRecordingTarget, options: RecordOptions = {}): Promise<RecordingInfo> {
    const id = await this.resolveChatId(chat);
    return this.recordingOperation(id, async () => {
      const active = this.calls.get(id);
      if (!active) throw new Error(`No active call in chat ${id}`);
      if (typeof target !== 'string') {
        const adapter = this.adapter as MTProtoAdapter & Partial<import('./group-participants.js').GroupParticipantPort>;
        if (!adapter.getParticipants) throw new Error('This adapter does not support per-participant recording');
        const mode = await this.ntg.getConnectionMode(this.nativeGroupId(id));
        if (mode === ConnectionMode.RTMP) throw new Error('Per-participant recording unavailable for unified RTMP media');
        requireMediaExecutable(this.opts.ffprobePath ?? 'ffprobe', 'ffprobe');
        if (target.video) requireMediaExecutable(this.opts.ffmpegPath ?? 'ffmpeg', 'ffmpeg');
        await this.stopRecordingInner(id);
        const participants = await this.ensureParticipants(id, active.call);
        const recorder = new FolderRecorder({
          handle: this.nativeGroupId(id), dir: target.dir, video: target.video, registry: participants.registry,
          native: this.ntg, sampleRate: target.sampleRate, channels: target.channels,
          ffmpegPath: this.opts.ffmpegPath, ffprobePath: this.opts.ffprobePath,
          connectionMode: mode === ConnectionMode.STREAM ? 'STREAM' : 'RTC',
          lookupUnknown: (sources, signal) => participants.lookup(sources, signal),
          subscribeFrames: (consumer) => this.nativeEvents.on('frames', (handle, frameMode, device, frames) => {
            if (this.folderRecorders.get(id) === recorder && handle === this.nativeGroupId(id)) consumer(handle, frameMode, device, frames);
          }),
          onStopped: (info) => this.emit('recordingStopped', id, info),
          onError: (error) => this.emit('recordingError', id, error),
          onDiagnostic: (diagnostic) => this.opts.logger?.error('[tgcalls-js] folder recording:', id, diagnostic),
        });
        this.folderRecorders.set(id, recorder);
        try { await recorder.start(); }
        catch (error) { this.folderRecorders.delete(id); throw error; }
        const info: RecordingInfo = { path: recorder.path, dir: recorder.path, mode: 'folder', video: target.video,
          sampleRate: recorder.sampleRate, channels: recorder.channels, startedAt: recorder.startedAt };
        this.recordings.set(id, info);
        await this.persistGroup(id);
        return info;
      }
      const sampleRate = options.sampleRate ?? 48000, channels = options.channels ?? 1;
      const microphone = recordingDescription(target, sampleRate, channels, this.opts.ffmpegPath ?? 'ffmpeg');
      await this.stopRecordingInner(id);
      await this.ntg.setStreamSources(this.nativeGroupId(id), StreamMode.PLAYBACK, { microphone });
      const info: RecordingInfo = { path: target, mode: 'mixed', sampleRate, channels, startedAt: Date.now() };
      this.recordings.set(id, info);
      await this.persistGroup(id);
      return info;
    });
  }

  private recordingOperation<T>(id: bigint, work: () => Promise<T>): Promise<T> {
    const previous = this.recordingOperations.get(id) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(work);
    this.recordingOperations.set(id, result);
    void result.finally(() => { if (this.recordingOperations.get(id) === result) this.recordingOperations.delete(id); }).catch(() => {});
    return result;
  }

  private async stopRecordingInner(id: bigint, reason = 'stop'): Promise<string | null> {
    const info = this.recordings.get(id), folder = this.folderRecorders.get(id);
    if (!info && !folder) return null;
    try {
      if (folder) await folder.stop(reason);
      else await this.ntg.setStreamSources(this.nativeGroupId(id), StreamMode.PLAYBACK, {});
    } finally {
      this.folderRecorders.delete(id);
      this.recordings.delete(id);
    }
    return info?.path ?? folder!.path;
  }

  /** Drain and finalize the active folder recorder before returning its directory. */
  async stopRecording(chat: ChatRef): Promise<string | null> {
    const id = await this.resolveChatId(chat);
    return this.recordingOperation(id, async () => {
      const target = await this.stopRecordingInner(id);
      await this.persistGroup(id);
      return target;
    });
  }

  private async ensureParticipants(id: bigint, call: unknown): Promise<GroupParticipantController> {
    const current = this.groupParticipants.get(id);
    if (current) { await current.refresh(); return current; }
    const adapter = this.adapter as MTProtoAdapter & Partial<import('./group-participants.js').GroupParticipantPort>;
    if (!adapter.getParticipants) throw new Error('This adapter does not provide group participants');
    this.installUpdateHandler();
    const controller = new GroupParticipantController({
      call, adapter: { getParticipants: (input, options) => adapter.getParticipants!(input, options) },
      onError: (error) => this.opts.logger?.error('[tgcalls-js] participant refresh failed:', error),
      onChange: (change) => {
        for (const source of change.sourceChanges) this.emit('remoteSourceChange', id, {
          ssrc: source.ssrc, peer: source.peer, endpoint: source.endpoint, origin: 'mtproto',
          state: source.state === 'active' ? StreamStatus.ACTIVE : source.state === 'paused' ? StreamStatus.PAUSED : StreamStatus.IDLING,
          device: source.device === 'microphone' ? StreamDevice.MICROPHONE : source.device === 'camera' ? StreamDevice.CAMERA : StreamDevice.SCREEN,
        });
      },
    });
    this.groupParticipants.set(id, controller);
    try { await controller.refresh(); return controller; }
    catch (error) { controller.close(); this.groupParticipants.delete(id); throw error; }
  }

  private async handleGroupUpdate(value: unknown): Promise<void> {
    const update = value as any;
    if (Array.isArray(update?.updates)) { for (const item of update.updates) await this.handleGroupUpdate(item); return; }
    if (update?.update) { await this.handleGroupUpdate(update.update); return; }
    const kind = String(update?.className ?? update?._ ?? '').toLowerCase();
    if (this.conferenceController) {
      await this.conferenceController.onServerUpdates(update);
      if (kind === 'updategroupcallencryptedmessage') {
        for (const handle of this.conferenceController.getHandles()) if (handle.callId === asBigInt0(update.call?.id))
          await this.conferenceController.onEncryptedMessage(handle.nativeId, update);
      }
    }
    if (kind !== 'updategroupcallparticipants') return;
    const adapter = this.adapter as MTProtoAdapter & { normalizeParticipants?: (raw: unknown[]) => ParticipantInfo[] };
    if (!adapter.normalizeParticipants) return;
    const participants = adapter.normalizeParticipants(update.participants ?? []);
    if (this.conferenceController) for (const handle of this.conferenceController.getHandles()) {
      if (handle.callId === asBigInt0(update.call?.id)) await this.conferenceController.onParticipantsUpdate(handle.nativeId, { participants, version: update.version });
    }
    for (const [id, controller] of this.groupParticipants) {
      const call = this.calls.get(id)?.call as { id?: unknown } | undefined;
      if (call && asBigInt0(call.id) === asBigInt0(update.call?.id)) controller.update(participants, update.version);
    }
  }

  /** The active recording for this chat, or null. Sync (resolved aliases only). */
  getRecording(chat: ChatRef): RecordingInfo | null {
    const id = this.cachedChatId(chat);
    if (id === undefined) {return null;}
    return this.recordings.get(id) ?? null;
  }

  /** Whether a recording is active in this chat. Sync (resolved aliases only). */
  isRecording(chat: ChatRef): boolean {
    return this.getRecording(chat) !== null;
  }

  private conferences(): ConferenceController {
    if (this.conferenceController) return this.conferenceController;
    const adapter = this.adapter as MTProtoAdapter & Partial<ConferenceAdapter>;
    const required = ['getSelfInfo', 'getConferenceInfo', 'createConference', 'joinConference', 'getChainBlocks',
      'sendConferenceBroadcast', 'getParticipants', 'inviteConferenceParticipant', 'leaveConference'] as const;
    for (const method of required) if (typeof adapter[method] !== 'function') throw new Error(`Conference adapter capability missing: ${method}`);
    const ntgAny = this.ntg as any;
    const native: NativeConferencePort = {
      createP2pCall: (id) => this.ntg.createP2pCall(id),
      initConference: (id, user, last) => this.ntg.initConference(id, user, last as unknown as Buffer),
      applyBlocks: (id, subchain, offset, blocks, poll) => this.ntg.applyBlocks(id, subchain, offset, blocks as unknown as Buffer[], poll),
      finishSubchainRequest: (id, subchain) => this.ntg.finishSubchainRequest(id, subchain),
      connect: (id, params, screen) => this.ntg.connect(id, params, screen),
      stop: (id) => this.ntg.stop(id),
      updateAudioSsrcMappings: (id, values) => this.ntg.updateAudioSsrcMappings(id, values),
      addIncomingVideo: (id, user, endpoint, groups) => this.ntg.addIncomingVideo(id, user, endpoint, groups),
      removeIncomingVideo: (id, endpoint) => this.ntg.removeIncomingVideo(id, endpoint),
      getEmojisFingerprint: (id) => this.ntg.getEmojisFingerprint(id),
      ...(typeof ntgAny.encryptMessage === 'function'
        ? { encryptMessage: (id: bigint, data: number[]) => ntgAny.encryptMessage(id, data) }
        : {}),
      ...(typeof ntgAny.decryptMessage === 'function'
        ? { decryptMessage: (id: bigint, userId: bigint, data: number[]) => ntgAny.decryptMessage(id, userId, data) }
        : {}),
    };
    const controller = new ConferenceController({ native, adapter: adapter as ConferenceAdapter,
      allocateNativeId: () => this.allocateFeatureId(),
      onMessage: (event) => this.emit('conferenceMessage', event),
      onError: (error) => this.emit('conferenceError', error) });
    this.conferenceController = controller;
    this.nativeEvents.on('outboundBlock', (id, bytes) => controller.onOutboundBlock(id, bytes));
    this.nativeEvents.on('subchainRequest', (id, request) => controller.onSubchainRequest(id, request));
    this.nativeEvents.on('requestParticipants', (id, request) => controller.onRequestParticipants(id, request));
    this.nativeEvents.on('updateEmojis', (id, emojis) => controller.onUpdateEmojis(id, emojis));
    this.installUpdateHandler();
    return controller;
  }

  private conferenceOptions(options: ConferenceOptions & { source?: AudioSource; video?: VideoOptions }): ConferenceOptions {
    return { ...options, muted: options.muted ?? !options.source, videoStopped: options.videoStopped ?? !options.video,
      prepareCapture: async (id, signal) => {
        signal.throwIfAborted();
        const media: import('ntgcalls').MediaDescription = {};
        if (options.source) media.microphone = audioDescription(options.source, this.opts);
        if (options.video && options.source && options.source.kind !== 'shell' && options.source.kind !== 'external') {
          const input = options.source.kind === 'file' ? options.source.path : options.source.url;
          const probed = await probeVideo(input, this.opts, options.video);
          media.camera = videoDescription(options.source, { ...options.video, ...probed }, this.opts);
        }
        await this.ntg.setStreamSources(id, StreamMode.CAPTURE, media);
        if (options.muted ?? !options.source) await this.ntg.mute(id);
        else await this.ntg.unmute(id);
        if (options.prepareCapture) await options.prepareCapture(id, signal);
      },
    };
  }

  /** Experimental native conference core; inspect capabilities before relying on security extras. */
  async createConference(options: ConferenceOptions & { source?: AudioSource; video?: VideoOptions } = {}): Promise<ConferenceHandle> {
    return this.conferences().createConference(this.conferenceOptions(options));
  }
  async joinConference(ref: ConferenceRef, options: ConferenceOptions & { source?: AudioSource; video?: VideoOptions } = {}): Promise<ConferenceHandle> {
    return this.conferences().joinConference(ref, this.conferenceOptions(options));
  }
  getConferenceCapabilities(): ReturnType<ConferenceController['getCapabilities']> { return this.conferences().getCapabilities(); }
  activeConferences(): ConferenceHandle[] { return this.conferenceController?.getHandles() ?? []; }
  exportConferenceInvite(handle: ConferenceHandle): Promise<string> { return this.conferences().exportConferenceInvite(handle); }
  inviteConferenceParticipants(handle: ConferenceHandle, users: ChatRef[], options: { video?: boolean } = {}): Promise<void> {
    return this.conferences().inviteConferenceParticipants(handle, users, options);
  }
  leaveConference(handle: ConferenceHandle): Promise<void> { return this.conferences().leaveConference(handle); }
  removeConferenceParticipants(handle: ConferenceHandle, users: ChatRef[], options: { kick?: boolean; onlyLeft?: boolean } = {}): Promise<never> {
    return this.conferences().removeConferenceParticipants(handle, users, options);
  }
  sendConferenceMessage(handle: ConferenceHandle, message: ConferenceMessageInput): Promise<ConferenceMessageReceipt> { return this.conferences().sendConferenceMessage(handle, message); }
  rekeyConference(handle: ConferenceHandle): Promise<never> { return this.conferences().rekeyConference(handle); }

  // ------------------------------------------------------------- P2P calls

  /** Check the latest user/profile flags without starting or ringing a call. */
  async getCallDenialReason(user: ChatRef, options: CallCheckOptions = {}): Promise<CallDenialReason | null> {
    return await checkCall(this.adapter, user, options);
  }

  /** True when the latest profile flags allow this call; not a server-side guarantee. */
  async canRequestCall(user: ChatRef, options: CallCheckOptions = {}): Promise<boolean> {
    return await this.getCallDenialReason(user, options) === null;
  }

  /**
   * Listen for incoming 1-on-1 voice calls and answer them, streaming `source`.
   * Requires a GramJS/teleproto client (P2P signaling). One listener per client;
   * calling again replaces it. Stop with stopListeningCalls().
   */
  async listenCalls(options: ListenCallsOptions): Promise<void> {
    if (this.callManager) {await this.callManager.stop();}
    const mgr = new P2PCallManager(this.ntg, this.adapter, {
      logger: this.opts.logger, ffmpegPath: this.opts.ffmpegPath, ffprobePath: this.opts.ffprobePath, ...options,
    }, (peerId, state) => { void this.emit('connectionChange', peerId, state); }, this.nativeEvents, (peerId, info) => {
      this.emit('recordingStopped', peerId, { ...info, peer: { kind: 'user', id: peerId } });
      if (info.status === 'failed' && info.error) {this.emit('recordingError', peerId, info.error);}
    });
    mgr.start();
    this.callManager = mgr;
  }

  /** Stop answering incoming P2P calls and hang up any active ones. */
  async stopListeningCalls(): Promise<void> {
    if (this.callManager) {await this.callManager.stop(); this.callManager = null;}
  }

  /**
   * Place an outgoing 1-on-1 call and stream `source` into it once the callee
   * answers. Requires `listenCalls()` first — it installs the P2P call handler
   * that drives the accept/confirm steps. Returns the Telegram call id.
   */
  async callUser(userId: ChatRef, options: OutgoingCallOptions = {}): Promise<bigint> {
    if (!this.callManager) {
      throw new Error('callUser needs an active call manager — call listenCalls({ source }) first.');
    }
    return await this.callManager.call(await this.resolveChatId(userId), options);
  }

  /** Peer user ids of active incoming P2P calls. */
  activeCallPeers(): bigint[] {
    return this.callManager?.activePeers() ?? [];
  }

  // ------------------------------------------------ external frame bridge

  private async resolveExternalTarget(chat: ChatRef | ConferenceHandle): Promise<{ publicId: bigint; nativeId: bigint }> {
    if (typeof chat === 'object') {
      return { publicId: chat.nativeId, nativeId: chat.nativeId };
    }
    const id = await this.resolveChatId(chat);
    return { publicId: id, nativeId: this.nativeGroupId(id) };
  }

  /**
   * Push signed 16-bit little-endian PCM bytes into an active EXTERNAL capture
   * stream (group call, P2P call, or conference). Automatically chunks larger
   * buffers into 10ms WebRTC frames unless `chunk10ms: false` is passed.
   */
  async pushAudioFrame(
    chat: ChatRef | ConferenceHandle,
    pcm: Uint8Array,
    options: PushAudioOptions = {},
  ): Promise<void> {
    const { nativeId } = await this.resolveExternalTarget(chat);
    await pushExternalAudioFrame(this.ntg, nativeId, pcm, options);
  }

  /**
   * Push a raw planar YUV420p (I420) video frame into an active EXTERNAL camera
   * or screen capture stream (group call, P2P call, or conference).
   */
  async pushVideoFrame(
    chat: ChatRef | ConferenceHandle,
    i420: Uint8Array,
    options: PushVideoOptions,
  ): Promise<void> {
    const { nativeId } = await this.resolveExternalTarget(chat);
    await pushExternalVideoFrame(this.ntg, nativeId, i420, options);
  }

  /**
   * Subscribe to incoming decoded PCM audio frames for a group call, P2P call,
   * or conference. For active group calls without an active recording, ensures
   * PLAYBACK microphone is configured as `MediaSource.EXTERNAL` automatically.
   * Returns an unsubscribe function.
   */
  async onAudioFrame(
    chat: ChatRef | ConferenceHandle,
    handler: (frame: ExternalAudioFrame) => void | Promise<void>,
    options: ExternalAudioSinkOptions = {},
  ): Promise<() => void> {
    const { publicId, nativeId } = await this.resolveExternalTarget(chat);
    const sampleRate = options.sampleRate ?? 48000;
    const channels = options.channels ?? 1;
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error('sampleRate must be a positive integer');
    }
    if (channels !== 1 && channels !== 2) {
      throw new Error('channels must be 1 or 2');
    }
    // Configure EXTERNAL playback microphone on active group calls if no recorder owns PLAYBACK.
    if (this.calls.has(publicId) && !this.recordings.has(publicId) && !this.folderRecorders.has(publicId) && !this.viewers.has(publicId)) {
      await this.ntg.setStreamSources(nativeId, StreamMode.PLAYBACK, {
        microphone: {
          mediaSource: MediaSource.EXTERNAL,
          sampleRate,
          channelCount: channels,
          input: '',
          keepOpen: true,
        },
      });
    }
    return this.nativeEvents.on('frames', (frameChatId, mode, device, frames) => {
      if (frameChatId !== nativeId || mode !== StreamMode.PLAYBACK || device !== StreamDevice.MICROPHONE) {
        return;
      }
      const registry = this.groupParticipants.get(publicId)?.registry;
      const items = normalizeIncomingAudioFrames(frames, (ssrc) => registry?.lookup(ssrc, 'microphone')?.peer);
      for (const item of items) {
        this.fireAndForget(() => handler(item));
      }
    });
  }

  /**
   * Start screen/video presentation (screen share channel) for an active call.
   * `source` must be file/url (ffmpeg-readable). RTC connection required —
   * not available in STREAM/RTMP connection modes.
   */
  async startPresentation(chatId: ChatRef, source: Exclude<AudioSource, { kind: 'shell' | 'external' }>, video: VideoOptions = {}): Promise<void> {
    const id = await this.resolveChatId(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    // 1) native presentation join params — the returned payload goes in the
    //    JoinGroupCallPresentation request itself.
    const params = await this.ntg.initPresentation(this.nativeGroupId(id));
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
    await this.ntg.setStreamSources(this.nativeGroupId(id), StreamMode.CAPTURE, {
      ...(hasAudio && active ? { microphone: audioDescription(active.source, this.opts) } : {}),
      screen: videoDescription(source, videoOpts, this.opts),
    });
    this.ended.delete(id);
    // 3) MTProto presentation join; connect on the presentation channel
    const connParams = await this.joinPresentationCall(this.calls.get(id)?.call, params);
    await this.ntg.connect(this.nativeGroupId(id), connParams, true);
    this.videoState.set(id, { device: 'screen', target: video });
    if (active) {
      active.presentationActive = true;
      active.videoActive = false;
    }
  }

  /** Stop the presentation channel (screen share off, main call stays). */
  async stopPresentation(chatId: ChatRef): Promise<void> {
    const id = await this.resolveChatId(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    try {
      await this.ntg.stopPresentation(this.nativeGroupId(id));
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

  private broadcastWired = false;
  private wireBroadcast(): void {
    if (this.broadcastWired) return;
    this.broadcastWired = true;
    this.nativeEvents.on('requestBroadcastPart', (nativeId, request) => {
      for (const viewer of this.viewers.values()) if (viewer.nativeId === nativeId) return viewer.controller?.requestPart(request);
    });
    this.nativeEvents.on('requestBroadcastTimestamp', (nativeId) => {
      for (const viewer of this.viewers.values()) if (viewer.nativeId === nativeId) return viewer.controller?.requestTimestamp();
    });
  }

  private wireNative(): void {
    if (this.nativeWired) {return;}
    this.nativeWired = true;

    this.nativeEvents.on('streamEnd', (nativeId: bigint, type: StreamType) => {
      if (this.featureNativeIds.has(nativeId) && this.publicGroupId(nativeId) === nativeId) return;
      return this.handleStreamEnd(this.publicGroupId(nativeId), type);
    });

    this.nativeEvents.on('connectionChange', (nativeId: bigint, info: { state: ConnectionState }) => {
      if (this.featureNativeIds.has(nativeId)) {
        const conference = this.conferenceController?.getHandles().find((handle) => handle.nativeId === nativeId);
        if (conference) {
          if (info.state === ConnectionState.CLOSED || info.state === ConnectionState.FAILED)
            return this.conferenceController!.leaveConference(conference).then(() => this.emit('connectionChange', nativeId, info.state));
          this.emit('connectionChange', nativeId, info.state); return;
        }
        if (this.publicGroupId(nativeId) === nativeId) return;
      }
      return this.handleNativeConnectionChange(this.publicGroupId(nativeId), info);
    });

    // Native source events currently originate in P2P; groups use MTProto participants.
    if (typeof this.ntg.onRemoteSourceChange === 'function') {
      this.nativeEvents.on('remoteSourceChange', (chatId: bigint, source: RemoteSourceInfo) => {
        this.emit('remoteSourceChange', chatId, source);
      });
    }
  }

  private async handleStreamEnd(chatId: bigint, type: StreamType): Promise<void> {
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

    // Playlist takes priority: advance to the next queued/hold track instead of
    // leaving. Only auto-leave when nothing is queued.
    let advanced = false;
    try {
      advanced = await this.advancePlaylist(chatId);
    } catch (err) {
      this.opts.logger?.error('[tgcalls-js] playlist advance error:', err);
    }

    const active = this.calls.get(chatId);
    const claimed = (this.eventHandlers.streamEnd?.length ?? 0) > 0;
    const willAutoLeave = !advanced && active?.autoLeave === true && !claimed;
    if (willAutoLeave) {
      this.leave(chatId).catch(() => { /* best-effort */ });
    }
    this.emit('streamEnd', {
      chatId,
      source: active?.source ?? null,
      willAutoLeave,
    });
  }

  private async handleNativeConnectionChange(
    chatId: bigint,
    info: { state: ConnectionState },
  ): Promise<void> {
    if (info.state === ConnectionState.CLOSED || info.state === ConnectionState.FAILED) {
      // Do not discard ActiveCall first: its call reference and SSRC are needed
      // for phone.leaveGroupCall. Notify listeners only after remote cleanup so
      // callers can safely destroy the MTProto client from the event callback.
      await this.leaveResolved(chatId);
    }
    this.emit('connectionChange', chatId, info.state);
  }

  /** Resolve any chat ref to a marked id (-100... for channels/supergroups). */
  async resolveChatId(chat: ChatRef): Promise<bigint> {
    const cached = this.cachedChatId(chat);
    if (cached !== undefined) {return cached;}
    const id = await this.adapter.resolveChatId(chat);
    if (typeof chat === 'string') {
      const key = this.chatAliasKey(chat);
      if (key !== null) {this.chatAliases.set(key, id);}
    }
    return id;
  }

  /** Resolve numeric ids or aliases already looked up by this client, synchronously. */
  private cachedChatId(chat: ChatRef): bigint | undefined {
    if (typeof chat === 'bigint') {return chat;}
    if (typeof chat === 'number') {
      try {return BigInt(chat);} catch {return undefined;}
    }
    const value = chat.trim();
    if (/^-?\d+$/.test(value)) {
      try {return BigInt(value);} catch {return undefined;}
    }
    const key = this.chatAliasKey(value);
    return key === null ? undefined : this.chatAliases.get(key);
  }

  private chatAliasKey(chat: string): string | null {
    const value = chat.trim();
    if (!value || /^-?\d+$/.test(value)) {return null;}
    const handle = value
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^@/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    return handle || null;
  }

  private async joinGroupCall(
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
      (u) => { this.emit('update', u); this.fireAndForget(() => this.handleGroupUpdate(u)); },
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

  /** Stop active calls and remove update handlers before disposing the MTProto client. */
  async dispose(options: { preserveState?: boolean } = {}): Promise<void> {
    if (options.preserveState) {await this.flushState(); this.persistenceSuspended++;}
    if (this.callManager) {await this.callManager.stop(); this.callManager = null;}
    await Promise.all([...this.publishers.values()].map((publisher) => publisher.close()));
    this.publishers.clear();
    await this.conferenceController?.dispose();
    await Promise.all([...this.calls.keys()].map((chatId) => this.leave(chatId)));
    await Promise.all([...this.pendingLeave.values()]);
    if (this.updateUninstall !== null) {
      this.updateUninstall();
      this.updateUninstall = null;
    }
    this.adapter.dispose?.();
    this.nativeEvents.dispose();
    this.calls.clear();
    this.groupParticipants.forEach((controller) => controller.close());
    this.groupParticipants.clear();
    this.viewers.clear();
    this.folderRecorders.clear();
    this.recordings.clear();
    this.chatAliases.clear();
    this.videoState.clear();
    this.ended.clear();
    this.playbackControls.clear();
    if (options.preserveState) {this.persistenceSuspended--;}
  }
}

export * from './persistence.js';
export * from './external-frames.js';
export * from './broadcast.js';
export * from './conference.js';
export * from './rtmp.js';
export * from './participants.js';
export * from './folder-recording.js';
export * from './adapters/index.js';
export * from './errors.js';
export type { CallCheckOptions, CallDenialReason, CallEligibilityInfo } from './eligibility.js';
export { loadTl, resetTlCache, loadEvents } from './tl.js';
export { resolveYouTube, resolveYouTubeStreams, pcmCommand, audioDescription, videoDescription, probeVideo } from './media.js';
export { P2PCallManager } from './calls.js';
export type { ListenCallsOptions, OutgoingCallOptions, CallRecordOptions, CallRecordingStopped } from './calls.js';
export { VideoQuality } from './types.js';
export type {
  ActiveCall,
  AudioSource,
  ChatRef,
  EditParticipantOptions,
  JoinOptions,
  JoinResult,
  LoopMode,
  MTProtoLike,
  MtcuteLike,
  MTProtoAdapter,
  PlaybackControls,
  PlaybackFilterOptions,
  RemoteSourceInfo,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
