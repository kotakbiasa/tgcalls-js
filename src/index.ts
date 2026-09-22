/**
 * tgcalls-js — pytgcalls-style Telegram group call wrapper for Node.js.
 *
 * Built on the official `ntgcalls` native binding (C++ WebRTC core by the
 * pytgcalls team) and any GramJS-family MTProto client (GramJS / teleproto).
 *
 * Join flow (mirrors ntgcalls/examples/python):
 *   1. channels.getFullChannel(chat)          → full_chat.call (InputGroupCall)
 *   2. ntgcalls.createCall(chatId)            → native join params (JSON w/ ssrc)
 *   3. ntgcalls.setStreamSources(...)         → ffmpeg/yt-dlp PCM source
 *   4. phone.joinGroupCall(params=DataJSON)   → updates contain
 *      UpdateGroupCallConnection with native connect params
 *   5. ntgcalls.connect(chatId, connParams)   → media starts flowing
 */

import { NTgCalls, ConnectionState, StreamMode } from 'ntgcalls';
import type {
  ActiveCall,
  AudioSource,
  ChatRef,
  JoinOptions,
  JoinResult,
  MTProtoLike,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
import { loadTl, loadEvents } from './tl.js';
import { audioDescription, videoDescription, resolveYouTube } from './media.js';

type AnyApi = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TgCallsEvents {
  /** Fired when the native audio stream ends (e.g. file finished). */
  streamEnd: (info: StreamEndInfo) => void | Promise<void>;
  /** Fired on native connection state changes. */
  connectionChange: (chatId: bigint, state: ConnectionState) => void | Promise<void>;
  /** Raw TL updates related to group calls (pass-through). */
  update: (update: unknown) => void | Promise<void>;
}

function toBigInt(v: unknown): bigint | undefined {
  if (v === undefined || v === null) {return undefined;}
  if (typeof v === 'bigint') {return v;}
  if (typeof v === 'number') {return BigInt(v);}
  if (typeof v === 'string') {return BigInt(v);}
  if (typeof v === 'object' && typeof (v as { toString?: unknown }).toString === 'function') {
    try {
      return BigInt((v as { toString: () => string }).toString());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function asBigInt0(v: unknown): bigint {
  return toBigInt(v) ?? 0n;
}

export class TgCallsClient {
  /** Direct access to the underlying native instance (advanced use). */
  readonly ntg: NTgCalls;

  private readonly client: MTProtoLike;
  private readonly Api: AnyApi;
  private readonly opts: TgCallsOptions;
  private readonly calls = new Map<bigint, ActiveCall>();
  private readonly eventHandlers: Partial<TgCallsEvents> = {};
  private updateCb: ((u: unknown) => void) | null = null;
  private pendingConnectionParams: string | null = null;
  private nativeWired = false;

  constructor(opts: TgCallsOptions) {
    this.opts = opts;
    this.client = opts.client;
    this.Api = loadTl(opts.Api) as AnyApi;
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
    if (this.calls.has(chatId)) {
      throw new Error(`Already in a call in chat ${chatId} — leave() first`);
    }

    const inputCall = await this.getGroupCall(chatId, options.allowCreate === true);

    // Native join params — created exactly once; the SAME params string must
    // be sent in JoinGroupCall and its ssrc later reused for LeaveGroupCall.
    const joinParams = await this.ntg.createCall(chatId);

    // Media sources set before the MTProto join so media flows immediately.
    const media: Record<string, unknown> = {
      microphone: audioDescription(source, this.opts),
    };
    if (options.video !== false && options.video !== undefined && source.kind !== 'shell') {
      media.camera = videoDescription(
        source as { kind: 'file'; path: string } | { kind: 'url'; url: string },
        options.video,
        this.opts,
      );
    }
    await this.ntg.setStreamSources(chatId, StreamMode.CAPTURE, media);

    const connParams = await this.joinGroupCall(chatId, inputCall, joinParams, {
      ...options,
      // videoStopped=false only when we actually share camera video.
      muted: options.muted === true,
      videoStopped: !(options.video !== false && options.video !== undefined && source.kind !== 'shell'),
    });
    await this.ntg.connect(chatId, connParams, false);

    const ssrc = extractSsrc(joinParams);
    this.calls.set(chatId, {
      chatId,
      call: inputCall,
      ssrc,
      source,
      videoActive: options.video !== false && options.video !== undefined && source.kind !== 'shell',
      presentationActive: false,
      muted: options.muted === true,
      autoLeave: options.autoLeave !== false,
      joinedAt: Date.now(),
    });
    this.wireNative();
    return { chatId, call: inputCall, ssrc };
  }

  /** join() with a YouTube/any yt-dlp-supported page URL. */
  async joinYouTube(chat: ChatRef, url: string, options: JoinOptions = {}): Promise<JoinResult> {
    const direct = await resolveYouTube(url, this.opts);
    if (direct === null) {
      throw new Error(`yt-dlp failed to resolve: ${url}`);
    }
    return this.join(chat, { kind: 'url', url: direct }, options);
  }

  /** Resolve a YouTube/any yt-dlp-supported page URL to a direct media URL. */
  async resolveYouTube(url: string): Promise<string | null> {
    return resolveYouTube(url, this.opts);
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
    if (this.calls.has(chatId)) {
      throw new Error(`Already in a call in chat ${chatId} — leave() first`);
    }

    let inputCall = await this.getGroupCall(chatId, false).catch(() => null);
    if (inputCall === null) {
      if (options.allowCreate !== true) {
        throw new Error('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
      }
      await this.getGroupCall(chatId, true); // creates (rtmpStream) and returns it
      inputCall = await this.getGroupCall(chatId, false);
    }

    const joinParams = await this.ntg.createCall(chatId);
    this.installUpdateHandler();
    this.pendingConnectionParams = null;
    const result = await this.client.invoke(new this.Api.phone.JoinGroupCall({
      call: inputCall,
      params: new this.Api.DataJSON({ data: joinParams }),
      muted: true,
      videoStopped: true,
      joinAs: new this.Api.InputPeerSelf(),
      ...(options.inviteHash !== undefined ? { inviteHash: options.inviteHash } : {}),
    })) as { updates?: Array<Record<string, unknown>> } | undefined;
    let connParams = findConnectionParams(result?.updates ?? []);
    if (connParams === null) {
      for (let i = 0; i < 15 && connParams === null; i++) {
        await sleep(200);
        if (this.pendingConnectionParams !== null) {
          connParams = this.pendingConnectionParams;
          this.pendingConnectionParams = null;
        }
      }
    }
    if (connParams === null) {
      throw new Error('JoinGroupCall succeeded but no UpdateGroupCallConnection was received');
    }
    await this.ntg.connect(chatId, connParams, false);

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
    try {
      await this.ntg.stop(id);
    } catch { /* already stopped */ }
    if (active) {
      try {
        // active.call is the exact InputGroupCall instance from getFullChannel.
        await this.client.invoke(new this.Api.phone.LeaveGroupCall({
          call: active.call,
          source: active.ssrc,
        }));
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
    await this.ntg.setStreamSources(id, StreamMode.CAPTURE, {
      microphone: audioDescription(source, this.opts),
    });
    const active = this.calls.get(id);
    if (active) {active.source = source;}
  }

  /**
   * Start screen/video presentation (screen share channel) for an active call.
   * `source` must be file/url (ffmpeg-readable). RTC connection required —
   * not available in STREAM/RTMP connection modes.
   */
  async startPresentation(chatId: ChatRef, source: { kind: 'file'; path: string } | { kind: 'url'; url: string }, video: VideoOptions = {}): Promise<void> {
    const id = BigInt(chatId);
    if (!this.calls.has(id)) {
      throw new Error(`No active call in chat ${id}`);
    }
    // 1) native presentation join params — the returned payload goes in the
    //    JoinGroupCallPresentation request itself.
    const params = await this.ntg.initPresentation(id);
    const active = this.calls.get(id);
    await this.ntg.setStreamSources(id, StreamMode.CAPTURE, {
      ...(active?.source ? { microphone: audioDescription(active.source, this.opts) } : {}),
      screen: videoDescription(source, video, this.opts),
    });
    // 3) MTProto presentation join; connect on the presentation channel
    const connParams = await this.joinPresentationCall(id, this.calls.get(id)?.call, params);
    await this.ntg.connect(id, connParams, true);
    if (active) {active.presentationActive = true;}
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
      await this.client.invoke(new this.Api.phone.LeaveGroupCallPresentation({
        call: this.calls.get(id)?.call,
      }));
    } catch { /* best-effort */ }
    const active = this.calls.get(id);
    if (active) {active.presentationActive = false;}
  }

  // -------------------------------------------------------------- internals

  private wireNative(): void {
    if (this.nativeWired) {return;}
    this.nativeWired = true;

    this.ntg.onStreamEnd((chatId: bigint) => {
      const active = this.calls.get(chatId);
      const claimed = this.eventHandlers.streamEnd !== undefined;
      if (active?.autoLeave && !claimed) {
        this.leave(chatId).catch(() => { /* best-effort */ });
      }
      void this.eventHandlers.streamEnd?.({
        chatId,
        source: active?.source ?? null,
        willAutoLeave: active?.autoLeave === true && !claimed,
      });
    });

    this.ntg.onConnectionChange((chatId: bigint, info: { state: ConnectionState }) => {
      if (info.state === ConnectionState.CLOSED || info.state === ConnectionState.FAILED) {
        this.calls.delete(chatId);
      }
      void this.eventHandlers.connectionChange?.(chatId, info.state);
    });
  }

  /** Resolve any chat ref to a marked id (-100... for channels/supergroups). */
  async resolveChatId(chat: ChatRef): Promise<bigint> {
    if (typeof chat === 'number' || typeof chat === 'bigint') {
      return BigInt(chat);
    }
    const s = chat.trim();
    if (/^-?\d+$/.test(s)) {
      return BigInt(s);
    }
    const handle = s.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '');
    if (this.client.getEntity) {
      try {
        const entity = await this.client.getEntity(handle);
        const marked = markedIdFromEntity(entity);
        if (marked !== undefined) {return marked;}
      } catch { /* fall through */ }
    }
    throw new Error(
      `Cannot resolve chat "${chat}" — pass a numeric chat id (e.g. -1001234567890), ` +
      'or make sure the client has the entity cached.',
    );
  }

  private async getGroupCall(chatId: bigint, allowCreate: boolean): Promise<unknown> {
    let peer: unknown = chatId;
    let channelInput: unknown = chatId;
    let isBasicChat = false;

    const clientAny = this.client as any;
    if (clientAny.getInputEntity) {
      try {
        const inputEntity = await clientAny.getInputEntity(chatId);
        if (inputEntity) {
          peer = inputEntity;
          if (inputEntity.className === 'InputPeerChannel' || (inputEntity as any).channelId !== undefined) {
            channelInput = new this.Api.InputChannel({
              channelId: (inputEntity as any).channelId,
              accessHash: (inputEntity as any).accessHash,
            });
          } else if (inputEntity.className === 'InputPeerChat' || (inputEntity as any).chatId !== undefined) {
            isBasicChat = true;
          }
        }
      } catch {
        /* fallback to chatId */
      }
    }

    const fetchCall = async () => {
      if (isBasicChat && this.Api.messages?.GetFullChat) {
        try {
          const rawId = typeof chatId === 'bigint' && chatId < 0n ? -chatId : chatId;
          const full = (await this.client.invoke(
            new this.Api.messages.GetFullChat({ chatId: (peer as any).chatId || rawId }),
          )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
          return full.fullChat?.call;
        } catch { /* ignore */ }
      }
      try {
        const full = (await this.client.invoke(
          new this.Api.channels.GetFullChannel({ channel: channelInput }),
        )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
        return full.fullChat?.call;
      } catch (err) {
        if (this.Api.messages?.GetFullChat) {
          try {
            const rawId = typeof chatId === 'bigint' && chatId < 0n ? -chatId : chatId;
            const full = (await this.client.invoke(
              new this.Api.messages.GetFullChat({ chatId: rawId }),
            )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
            return full.fullChat?.call;
          } catch { /* ignore */ }
        }
        throw err;
      }
    };

    const call = await fetchCall().catch(() => undefined);
    if (call) {
      return new this.Api.InputGroupCall({
        id: asBigInt0(call.id),
        accessHash: asBigInt0(call.accessHash),
      });
    }

    if (allowCreate) {
      await this.client.invoke(new this.Api.phone.CreateGroupCall({
        peer,
        randomId: Math.floor(Math.random() * 2 ** 31),
        title: 'Voice Chat',
        rtmpStream: false,
      }));
      await sleep(1000);
      const call2 = await fetchCall().catch(() => undefined);
      if (call2) {
        return new this.Api.InputGroupCall({
          id: asBigInt0(call2.id),
          accessHash: asBigInt0(call2.accessHash),
        });
      }
      throw new Error('Group call created but not visible yet — retry join()');
    }
    throw new Error('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
  }

  private async joinGroupCall(
    chatId: bigint,
    inputCall: unknown,
    joinParams: string,
    options: JoinOptions,
  ): Promise<string> {
    // Ready the update handler first: some servers deliver
    // UpdateGroupCallConnection via updates instead of the join result.
    this.installUpdateHandler();
    this.pendingConnectionParams = null;

    const result = await this.client.invoke(new this.Api.phone.JoinGroupCall({
      call: inputCall,
      params: new this.Api.DataJSON({ data: joinParams }),
      muted: options.muted === true,
      videoStopped: options.videoStopped ?? true,
      joinAs: new this.Api.InputPeerSelf(),
      ...(options.inviteHash !== undefined ? { inviteHash: options.inviteHash } : {}),
    })) as { updates?: Array<Record<string, unknown>> } | undefined;

    const inline = findConnectionParams(result?.updates ?? []);
    if (inline !== null) {
      return inline;
    }
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      if (this.pendingConnectionParams !== null) {
        const p = this.pendingConnectionParams;
        this.pendingConnectionParams = null;
        return p;
      }
    }
    throw new Error('JoinGroupCall succeeded but no UpdateGroupCallConnection was received');
  }

  private installUpdateHandler(): void {
    if (this.updateCb !== null || this.client.addEventHandler === undefined) {return;}
    this.updateCb = (update: unknown) => {
      const u = update as { className?: string; params?: { data?: string } };
      void this.eventHandlers.update?.(u);
      if (u.className === 'UpdateGroupCallConnection' && typeof u.params?.data === 'string') {
        this.pendingConnectionParams = u.params.data;
      }
    };
    // teleproto/GramJS dispatch calls builder.resolve()/build()/filter().
    // Use the package's Raw builder when resolvable; otherwise a minimal
    // compatible builder that passes every raw update through.
    const events = loadEvents();
    const builder = events?.Raw
      ? new events.Raw({ types: [this.Api.UpdateGroupCallConnection] })
      : {
          resolved: true,
          async resolve() { /* nothing to resolve */ },
          build: (e: unknown) => {return e;},
          filter: (e: unknown) => {return e;},
        };
    this.client.addEventHandler(this.updateCb, builder);
  }

  private async joinPresentationCall(chatId: bigint, inputCall: unknown, presentationParams: string): Promise<string> {
    this.installUpdateHandler();
    this.pendingConnectionParams = null;
    const result = await this.client.invoke(new this.Api.phone.JoinGroupCallPresentation({
      call: inputCall,
      params: new this.Api.DataJSON({ data: presentationParams }),
    })) as { updates?: Array<Record<string, unknown>> } | undefined;
    const inline = findConnectionParams(result?.updates ?? []);
    if (inline !== null) {
      return inline;
    }
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      if (this.pendingConnectionParams !== null) {
        const p = this.pendingConnectionParams;
        this.pendingConnectionParams = null;
        return p;
      }
    }
    throw new Error('JoinGroupCallPresentation succeeded but no UpdateGroupCallConnection was received');
  }

  /** Cleanup for consumers disposing the MTProto client. */
  dispose(): void {
    if (this.updateCb !== null && this.client.removeEventHandler !== undefined) {
      this.client.removeEventHandler(this.updateCb, {});
      this.updateCb = null;
    }
    this.calls.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Find UpdateGroupCallConnection.params.data inside an updates list. */
function findConnectionParams(updates: Array<Record<string, unknown>>): string | null {
  for (const upd of updates) {
    if (upd.className === 'UpdateGroupCallConnection') {
      const params = upd.params as { data?: unknown } | undefined;
      if (typeof params?.data === 'string') {
        return params.data;
      }
    }
  }
  return null;
}

/** Extract our audio ssrc from the native join params JSON. */
function extractSsrc(joinParams: string): number {
  try {
    const parsed = JSON.parse(joinParams) as { ssrc?: number };
    return typeof parsed.ssrc === 'number' ? parsed.ssrc : 0;
  } catch {
    return 0;
  }
}

/**
 * Best-effort marked-id extraction from a GramJS entity object.
 * GramJS uses Bot-API-style marked ids: channels = -100..., basic chats = -id.
 */
function markedIdFromEntity(entity: unknown): bigint | undefined {
  const e = entity as {
    id?: unknown;
    channelId?: unknown;
    chatId?: unknown;
    userId?: unknown;
    className?: string;
  };
  if (e === null || typeof e !== 'object') {return undefined;}
  if (e.className === 'Channel' && e.id !== undefined) {
    const raw = toBigInt(e.id);
    return raw === undefined ? undefined : -(1_000_000_000_000n + raw);
  }
  if (e.className === 'Chat' && e.id !== undefined) {
    const raw = toBigInt(e.id);
    return raw === undefined ? undefined : -raw;
  }
  if (e.channelId !== undefined) {
    const raw = toBigInt(e.channelId);
    return raw === undefined ? undefined : -(1_000_000_000_000n + raw);
  }
  if (e.chatId !== undefined) {
    const raw = toBigInt(e.chatId);
    return raw === undefined ? undefined : -raw;
  }
  if (e.userId !== undefined) {return toBigInt(e.userId);}
  return undefined;
}

export { loadTl, resetTlCache, loadEvents } from './tl.js';
export { resolveYouTube, pcmCommand, audioDescription } from './media.js';
export type {
  ActiveCall,
  AudioSource,
  ChatRef,
  JoinOptions,
  JoinResult,
  MTProtoLike,
  StreamEndInfo,
  TgCallsOptions,
  VideoOptions,
} from './types.js';
