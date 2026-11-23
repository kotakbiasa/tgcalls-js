import { createHash, randomBytes } from 'node:crypto';
import { TgCallsError } from './errors.js';

export type ConferenceRef = { slug: string } | { inviteMessageId: number }
  | { id: bigint; accessHash: bigint };
export interface ConferenceHandle { readonly nativeId: bigint; readonly callId: bigint }
export interface ConferenceInfo {
  /** Original adapter-owned InputGroupCall (including mtcute Long references). */
  call: unknown; id: bigint; accessHash: bigint; conference: boolean; inviteLink?: string;
}
export interface ConferenceJoin { payload: string; publicKey: Uint8Array; block: Uint8Array }
export interface ConferenceResult { info: ConferenceInfo; connectionParams: string; updates: unknown }
export interface ConferenceParticipant {
  peer: { kind: 'user' | 'channel' | 'chat'; id: bigint };
  source: number; left?: boolean; self?: boolean;
  video?: ConferenceVideo; presentation?: ConferenceVideo;
}
export interface ConferenceVideo {
  endpoint: string; audioSource?: number;
  sourceGroups: { semantics: string; sources: number[] }[];
}
export interface ConferenceParticipantPage {
  participants: ConferenceParticipant[]; version: number; nextOffset: string; count: number;
}
/** Concrete adapters implement real MTProto RPCs; this port never substitutes VC or plaintext. */
export interface ConferenceAdapter {
  getSelfInfo(): Promise<{ userId: bigint; isBot: boolean; authorized: boolean }>;
  getConferenceInfo(ref: ConferenceRef, signal?: AbortSignal): Promise<ConferenceInfo>;
  createConference(join: ConferenceJoin, options: {
    join: true; randomId: number; muted: boolean; videoStopped: boolean; signal?: AbortSignal;
  }): Promise<ConferenceResult>;
  joinConference(call: unknown, join: ConferenceJoin, options: {
    muted: boolean; videoStopped: boolean; signal?: AbortSignal;
  }): Promise<ConferenceResult>;
  getChainBlocks(call: unknown, subchain: number, offset: number, limit: number, signal?: AbortSignal): Promise<unknown>;
  sendConferenceBroadcast(call: unknown, block: Buffer, signal?: AbortSignal): Promise<unknown>;
  sendConferenceMessage?(call: unknown, encryptedMessage: Buffer, signal?: AbortSignal): Promise<unknown>;
  getParticipants(call: unknown, options: {
    ids: bigint[]; sources: number[]; offset: string; limit: number; signal?: AbortSignal;
  }): Promise<ConferenceParticipantPage>;
  inviteConferenceParticipant(call: unknown, user: unknown, options: { video: boolean; signal?: AbortSignal }): Promise<unknown>;
  leaveConference(call: unknown, source: number): Promise<void>;
}
/** Router subscription belongs to the facade. Bytes here reflect the actual NAPI ABI, not upstream typings. */
export interface NativeConferencePort {
  createP2pCall(id: bigint): Promise<void>;
  initConference(id: bigint, selfUserId: bigint, lastBlock: number[] | null): Promise<ConferenceJoin>;
  applyBlocks(id: bigint, subchain: number, nextOffset: number, blocks: number[][], fromShortPoll: boolean): Promise<void>;
  finishSubchainRequest(id: bigint, subchain: number): Promise<void>;
  connect(id: bigint, params: string, isPresentation: boolean): Promise<void>;
  stop(id: bigint): Promise<void>;
  updateAudioSsrcMappings(id: bigint, mappings: { userId: bigint; ssrc: number }[]): Promise<void>;
  addIncomingVideo(id: bigint, userId: bigint, endpoint: string, groups: { semantics: string; ssrcs: number[] }[]): Promise<number>;
  removeIncomingVideo(id: bigint, endpoint: string): Promise<boolean>;
  getEmojisFingerprint(id: bigint): Promise<string>;
  /** Available in ntgcalls >= 4.0.0-alpha03; absent in 3.0.7. */
  encryptMessage?(id: bigint, data: number[]): Promise<Buffer>;
  /** Available in ntgcalls >= 4.0.0-alpha03; absent in 3.0.7. */
  decryptMessage?(id: bigint, userId: bigint, data: number[]): Promise<Buffer>;
}
export type ConferenceMessageInput =
  | string
  | { text: string; entities?: unknown[]; randomId?: bigint | string }
  | Uint8Array;
export interface ConferenceMessageReceipt {
  randomId: string;
  bytes: number;
}
export interface ConferenceMessageEvent {
  handle: ConferenceHandle;
  callId: bigint;
  fromUserId: bigint;
  raw: Buffer;
  text?: string;
  randomId?: string;
  parsed?: unknown;
}
export interface ConferenceOptions {
  signal?: AbortSignal; muted?: boolean; videoStopped?: boolean;
  /** Called after initConference has replaced the native stream manager. Idle needs no callback. */
  prepareCapture?: (nativeId: bigint, signal: AbortSignal) => Promise<void>;
}
export class ConferenceProtocolError extends TgCallsError {}
export class UnsupportedNativeCapabilityError extends TgCallsError {
  constructor(readonly capability: string) { super(`ntgcalls 3.0.7 does not expose conference ${capability}`); }
}
interface Session {
  handle: ConferenceHandle; nativeId: bigint; info?: ConferenceInfo; selfUserId: bigint;
  joined: boolean; nextOffset: [number, number]; source: number; stopped: boolean;
  nativeCreated: boolean; member: boolean; abort: AbortController; options: ConferenceOptions;
  tail: Promise<unknown>; leaving?: Promise<void>; seen: [Map<number, string>, Map<number, string>];
  participants: Map<bigint, ConferenceParticipant>; participantVersion: number;
  videos: Map<string, { userId: bigint; groups: string }>;
  detachAbort?: () => void;
  outbound: Buffer[]; applying: number; emoji: string | null; verificationPending: boolean;
  cancelPoll?: () => void; gap: Set<number>; backgroundErrors: unknown[]; recoveryAttempts: number;
}
interface Chain { callId: bigint; subchain: number; nextOffset: number; blocks: Buffer[] }
const SERVER_MAGIC = [[0x639a3db7], [0xd1512ae8, 0x83f4f9d9]];
function fail(message: string): never { throw new ConferenceProtocolError(message); }
function kind(value: any): string { return String(value?.className ?? value?._ ?? '').replace(/[^a-z]/gi, '').toLowerCase(); }
function long(value: any): bigint { try { return BigInt(value.toString()); } catch { return fail('Invalid conference identifier'); } }
function list(value: any): any[] {
  if (Array.isArray(value)) return value.flatMap(list);
  if (Array.isArray(value?.updates)) return value.updates.flatMap(list);
  if (value?.update) return list(value.update);
  return value ? [value] : [];
}
function chains(value: unknown): Chain[] {
  return list(value).filter((item) => kind(item) === 'updategroupcallchainblocks').map((item) => ({
    callId: long(item.call?.id), subchain: item.subChainId ?? item.subchain ?? item.sub_chain_id,
    nextOffset: item.nextOffset ?? item.next_offset,
    blocks: Array.isArray(item.blocks) ? item.blocks.map((b: Uint8Array) => Buffer.from(b)) : fail('Missing chain blocks'),
  }));
}
function validateChain(update: Chain): void {
  if (update.subchain !== 0 && update.subchain !== 1) fail('Unknown conference subchain');
  if (!Number.isInteger(update.nextOffset) || update.nextOffset < update.blocks.length || update.nextOffset > 0x7fffffff) fail('Invalid chain offset');
  for (const block of update.blocks) {
    if (block.length < 4 || !SERVER_MAGIC[update.subchain].includes(block.readUInt32LE())) fail('Invalid server block constructor');
  }
}

/** Experimental native conference core. No health/epoch acceptance proof is available on 3.0.7. */
export class ConferenceController {
  private readonly sessions = new Map<ConferenceHandle, Session>();
  private readonly nativeSessions = new Map<bigint, Session>();
  constructor(private readonly ports: {
    native: NativeConferencePort; adapter: ConferenceAdapter;
    /** Facade must reserve a fresh ID across group/P2P/conference and every generation. */
    allocateNativeId: () => bigint;
    rpcTimeoutMs?: number; onError?: (error: unknown) => void;
    onMessage?: (event: ConferenceMessageEvent) => void;
    schedule?: (callback: () => void, delayMs: number) => () => void;
  }) {}

  getCapabilities() {
    const coreLifecycle = ['createP2pCall', 'initConference', 'applyBlocks', 'finishSubchainRequest', 'connect', 'stop',
      'updateAudioSsrcMappings', 'addIncomingVideo', 'removeIncomingVideo'].every((name) => typeof (this.ports.native as any)[name] === 'function');
    const applicationEncryption =
      typeof this.ports.native.encryptMessage === 'function' &&
      typeof this.ports.native.decryptMessage === 'function';
    return Object.freeze({ nativeVersion: applicationEncryption ? '4.0.0+' : '3.0.7', coreLifecycle, removeParticipants: false,
      rekey: false, applicationEncryption, cryptoHealth: false,
      fullSecurityConformance: false, liveVerified: false });
  }
  private requireCore(): void {
    if (!this.getCapabilities().coreLifecycle) throw new UnsupportedNativeCapabilityError('core lifecycle');
    for (const name of ['getSelfInfo', 'getConferenceInfo', 'createConference', 'joinConference', 'getChainBlocks',
      'sendConferenceBroadcast', 'getParticipants', 'inviteConferenceParticipant', 'leaveConference']) {
      if (typeof (this.ports.adapter as any)[name] !== 'function') fail(`Conference adapter capability missing: ${name}`);
    }
  }
  /** Offsets record successful delivery to native, not proof of crypto acceptance (3.0.7 has no health API). */
  getState(handle: ConferenceHandle) {
    const s = this.session(handle);
    return { joined: s.joined, nextOffset: [...s.nextOffset], stopped: s.stopped };
  }
  getHandles(): ConferenceHandle[] { return [...this.sessions.values()].filter((s) => !s.stopped).map((s) => s.handle); }
  async createConference(options: ConferenceOptions = {}): Promise<ConferenceHandle> {
    this.requireCore();
    const self = await this.ports.adapter.getSelfInfo();
    if (!self.authorized || self.isBot || self.userId <= 0n) fail('Conference requires an authorized user session');
    const s = this.newSession(self.userId, options);
    try {
      const join = await this.prepare(s, null);
      const result = await this.rpc(s, (signal) => this.ports.adapter.createConference(join, {
        join: true, randomId: randomBytes(4).readInt32LE(), muted: options.muted ?? true,
        videoStopped: options.videoStopped ?? true, signal,
      }), (late) => this.ports.adapter.leaveConference(late.info.call, s.source));
      await this.completeJoin(s, result);
      return s.handle;
    } catch (error) { await this.cleanup(s); throw error; }
  }
  async joinConference(ref: ConferenceRef, options: ConferenceOptions = {}): Promise<ConferenceHandle> {
    this.requireCore();
    const self = await this.ports.adapter.getSelfInfo();
    if (!self.authorized || self.isBot || self.userId <= 0n) fail('Conference requires an authorized user session');
    const info = await this.ports.adapter.getConferenceInfo(ref, options.signal);
    if (!info.conference) fail('The reference is not a conference');
    const s = this.newSession(self.userId, options); s.info = info;
    try {
      await this.joinExisting(s);
      return s.handle;
    } catch (error) { await this.cleanup(s); throw error; }
  }
  private async joinExisting(s: Session): Promise<void> {
    const info = s.info!;
    const options = s.options;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.active(s);
        const result = await this.rpc(s, (signal) => this.ports.adapter.getChainBlocks(info.call, 0, -1, 1, signal));
        this.active(s);
        const main = chains(result).filter((update) => update.callId === info.id && update.subchain === 0);
        main.forEach(validateChain);
        const lastBlock = main.at(-1)?.blocks.at(-1);
        if (!lastBlock) fail('No main server block available for conference join');
        const join = await this.prepare(s, lastBlock);
        try {
          const joined = await this.rpc(s, (signal) => this.ports.adapter.joinConference(info.call, join, {
            muted: options.muted ?? true, videoStopped: options.videoStopped ?? true, signal,
          }), (late) => this.ports.adapter.leaveConference(late.info.call, s.source));
          if (joined.info.id !== info.id) fail('Conference join returned a different call');
          await this.completeJoin(s, joined);
          return;
        } catch (error) {
          const code = String((error as any)?.errorMessage ?? (error as any)?.code ?? (error as any)?.message ?? '');
          if (!code.startsWith('CONF_WRITE_CHAIN_INVALID')) throw error;
          await this.resetNative(s, attempt < 2);
          if (attempt === 2) fail('Conference chain conflict retry limit reached');
        }
      }
    fail('Conference chain conflict retry limit reached');
  }
  private async resetNative(s: Session, allocate = true): Promise<void> {
    this.nativeSessions.delete(s.nativeId);
    if (s.nativeCreated) { await this.ports.native.stop(s.nativeId); s.nativeCreated = false; }
    s.joined = false; s.nextOffset = [-1, -1]; s.seen = [new Map(), new Map()];
    s.outbound = []; s.emoji = null; s.verificationPending = true;
    s.participants.clear(); s.videos.clear(); s.participantVersion = -1; s.gap.clear();
    if (allocate) {
      s.nativeId = this.ports.allocateNativeId();
      if (this.nativeSessions.has(s.nativeId)) fail('Conference native handle collision');
      this.nativeSessions.set(s.nativeId, s);
    }
  }
  private async recover(s: Session): Promise<void> {
    this.active(s);
    if (++s.recoveryAttempts > 2) fail('Conference membership recovery retry limit reached');
    s.member = false;
    await this.resetNative(s);
    await this.joinExisting(s);
  }
  private forbidden(error: unknown): boolean {
    return String((error as any)?.errorMessage ?? (error as any)?.code ?? (error as any)?.message ?? '') === 'GROUPCALL_FORBIDDEN';
  }
  private newSession(selfUserId: bigint, options: ConferenceOptions): Session {
    const nativeId = this.ports.allocateNativeId();
    if (this.nativeSessions.has(nativeId)) fail('Conference native handle collision');
    const s: Session = {
      handle: { get nativeId() { return s.nativeId; }, get callId() { return s.info?.id ?? 0n; } },
      nativeId, selfUserId, joined: false, nextOffset: [-1, -1], source: 0, stopped: false,
      nativeCreated: false, member: false, abort: new AbortController(), options, tail: Promise.resolve(),
      seen: [new Map(), new Map()],
      participants: new Map(), participantVersion: -1, videos: new Map(),
      outbound: [], applying: 0, emoji: null, verificationPending: true, gap: new Set(), backgroundErrors: [], recoveryAttempts: 0,
    };
    this.sessions.set(s.handle, s); this.nativeSessions.set(nativeId, s);
    const abort = () => {
      s.abort.abort();
      if (s.joined) void this.cleanup(s).catch((error) => this.ports.onError?.(error));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    s.detachAbort = () => options.signal?.removeEventListener('abort', abort);
    if (options.signal?.aborted) abort();
    return s;
  }
  private session(handle: ConferenceHandle): Session {
    const s = this.sessions.get(handle);
    if (!s) return fail('Unknown conference handle');
    return s;
  }
  private active(s: Session): void {
    if (s.stopped || s.abort.signal.aborted || s.options.signal?.aborted) throw new ConferenceProtocolError('Conference operation cancelled');
  }
  private rpc<T>(s: Session, work: (signal: AbortSignal) => Promise<T>, late?: (value: T) => Promise<void>): Promise<T> {
    this.active(s);
    return new Promise<T>((resolve, reject) => {
      const abort = new AbortController();
      let settled = false;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true; clearTimeout(timer); s.abort.signal.removeEventListener('abort', cancelled);
        if (error) { abort.abort(); reject(error); } else resolve(value!);
      };
      const cancelled = () => finish(new ConferenceProtocolError('Conference operation cancelled'));
      const timer = setTimeout(() => finish(new ConferenceProtocolError('Conference RPC deadline exceeded')), this.ports.rpcTimeoutMs ?? 15000);
      s.abort.signal.addEventListener('abort', cancelled, { once: true });
      Promise.resolve().then(() => work(abort.signal)).then((value) => {
        if (settled) {
          if (late) void late(value).catch((error) => this.ports.onError?.(error));
        } else finish(undefined, value);
      }, (error) => finish(error));
    });
  }
  private async prepare(s: Session, lastBlock: Buffer | null): Promise<ConferenceJoin> {
    this.active(s);
    await this.ports.native.createP2pCall(s.nativeId); s.nativeCreated = true;
    const join = await this.ports.native.initConference(s.nativeId, s.selfUserId, lastBlock ? Array.from(lastBlock) : null);
    this.active(s);
    if (join.publicKey.length !== 32 || join.block.length < 4 || Buffer.from(join.block).readUInt32LE() !== 0x639a3db6) fail('Invalid native conference join material');
    let payload: any;
    try { payload = JSON.parse(join.payload); } catch { fail('Invalid native conference payload'); }
    if (!Number.isInteger(payload.ssrc) || payload.ssrc < -0x80000000 || payload.ssrc > 0xffffffff) fail('Missing native conference SSRC');
    s.source = payload.ssrc | 0;
    if (s.options.prepareCapture) await s.options.prepareCapture(s.nativeId, s.abort.signal);
    this.active(s);
    return { payload: join.payload, publicKey: Buffer.from(join.publicKey), block: Buffer.from(join.block) };
  }
  private async completeJoin(s: Session, result: ConferenceResult): Promise<void> {
    s.info = result.info; s.member = true;
    this.active(s);
    if (!result.info.conference || !result.connectionParams) fail('Expected conference connection response');
    const mainEcho = chains(result.updates).filter((update) => update.callId === result.info.id && update.subchain === 0);
    if (!mainEcho.some((update) => update.blocks.length > 0)) fail('Missing main server echo in conference join');
    await this.consume(s, result.updates, 'join-response');
    if (!s.joined) fail('Conference join response did not bootstrap both subchains');
    await this.ports.native.connect(s.nativeId, result.connectionParams, false);
    this.active(s);
    await this.refreshParticipants(s);
    while (s.outbound.length) await this.broadcast(s, s.outbound.shift()!);
    this.armPoll(s);
  }
  private async consume(s: Session, value: unknown, origin: 'join-response' | 'passive' | 'poll-response'): Promise<void> {
    if (!s.info || s.stopped || (!s.joined && origin !== 'join-response')) return;
    for (const update of chains(value)) {
      if (update.callId !== s.info.id) continue;
      validateChain(update);
      const start = update.nextOffset - update.blocks.length;
      const seen = s.seen[update.subchain];
      const fingerprints = update.blocks.map((block) => createHash('sha256').update(block).digest('hex'));
      for (let index = 0; index < update.blocks.length; index++) {
        const previous = seen.get(start + index);
        if (previous && previous !== fingerprints[index]) fail('Conflicting block at an accepted offset');
      }
      let skip = 0;
      if (s.joined) {
        if (start > s.nextOffset[update.subchain]) {
          if (origin === 'poll-response') fail('Gap remains in polled conference blocks');
          this.scheduleGap(s, update.subchain); continue;
        }
        skip = Math.max(0, s.nextOffset[update.subchain] - start);
        if (skip >= update.blocks.length) continue;
      }
      if (update.subchain === 0 && update.blocks.length > skip) {
        s.emoji = null; s.verificationPending = true; this.armPoll(s);
      }
      s.applying++;
      try {
        await this.ports.native.applyBlocks(s.nativeId, update.subchain, update.nextOffset,
          update.blocks.slice(skip).map((block) => Array.from(block)), origin === 'poll-response');
      } finally { s.applying--; }
      this.active(s);
      for (let index = skip; index < update.blocks.length; index++) seen.set(start + index, fingerprints[index]);
      while (seen.size > 1024) seen.delete(seen.keys().next().value!);
      s.nextOffset[update.subchain] = update.nextOffset;
      s.joined = s.nextOffset.every((offset) => offset >= 0);
    }
  }
  private enqueue<T>(s: Session, work: () => Promise<T>): Promise<T> {
    const result = s.tail.then(work);
    s.tail = result.catch(() => undefined); // Caller still observes the original rejected promise.
    return result;
  }
  /** Facade forwards raw Updates/Update from the server, never locally generated blocks. */
  async onServerUpdates(value: unknown): Promise<void> {
    for (const s of this.nativeSessions.values()) {
      if (!s.joined || s.stopped) continue;
      await this.enqueue(s, async () => {
        await this.consume(s, value, 'passive');
        while (s.outbound.length) await this.broadcast(s, s.outbound.shift()!);
      });
    }
  }
  async onSubchainRequest(nativeId: bigint, request: { subchain: number; height: number; limit: number }): Promise<void> {
    const s = this.nativeSessions.get(nativeId);
    if (!s) return;
    const work = this.enqueue(s, async () => {
      try {
        if (!s.joined || s.stopped) return;
        if ((request.subchain !== 0 && request.subchain !== 1) || !Number.isInteger(request.height)
          || request.height < -1 || !Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) fail('Invalid subchain request');
        let offset = request.height;
        for (let page = 0; page < 100; page++) {
          this.active(s);
          const response = await this.rpc(s, (signal) => this.ports.adapter.getChainBlocks(s.info!.call, request.subchain, offset, request.limit, signal));
          this.active(s);
          await this.consume(s, response, 'poll-response');
          while (s.outbound.length) await this.broadcast(s, s.outbound.shift()!);
          const matching = chains(response).filter((update) => update.callId === s.info!.id && update.subchain === request.subchain);
          const count = matching.reduce((sum, update) => sum + update.blocks.length, 0);
          if (count < request.limit) return;
          const committed = s.nextOffset[request.subchain];
          if (committed <= offset) fail('Subchain paging made no progress');
          offset = committed;
        }
        fail('Subchain paging limit reached');
      } finally {
        if (s.nativeCreated && s.nativeId === nativeId) await this.ports.native.finishSubchainRequest(nativeId, request.subchain);
      }
    });
    try { await work; } catch (error) {
      if (!this.forbidden(error) || s.stopped) throw error;
      try { await this.enqueue(s, () => this.recover(s)); } catch (failed) { await this.cleanup(s); throw failed; }
    }
  }
  async onOutboundBlock(nativeId: bigint, bytes: Uint8Array): Promise<void> {
    const s = this.nativeSessions.get(nativeId);
    if (!s || s.stopped) return;
    const block = Buffer.from(bytes);
    if (block.length < 4 || ![0xd1512ae7, 0x83f4f9d8].includes(block.readUInt32LE())) fail('Invalid native verification broadcast');
    if (!s.joined || s.applying) {
      if (s.outbound.length >= 64) fail('Conference verification queue limit reached');
      s.outbound.push(block); return;
    }
    try { await this.enqueue(s, () => this.broadcast(s, block)); } catch (error) {
      if (!this.forbidden(error) || s.stopped) throw error;
      // A fresh native Session changes its key/epoch, so this old signed block
      // cannot be replayed. Native generates a fresh commitment after self-add.
      s.outbound.push(block);
      try { await this.enqueue(s, () => this.recover(s)); } catch (failed) { await this.cleanup(s); throw failed; }
    }
  }
  private async broadcast(s: Session, block: Buffer): Promise<void> {
    let next: Buffer | undefined = block;
    for (let count = 0; next && count < 64; count++) {
      this.active(s);
      const sending = next;
      const result = await this.rpc(s, (signal) => this.ports.adapter.sendConferenceBroadcast(s.info!.call, sending, signal));
      this.active(s); await this.consume(s, result, 'passive');
      next = s.outbound.shift();
    }
    if (next) fail('Conference verification relay limit reached');
  }
  private armPoll(s: Session): void {
    if (s.stopped || !s.joined) return;
    s.cancelPoll?.(); s.cancelPoll = undefined;
    const tick = () => {
      s.cancelPoll = undefined;
      if (s.stopped || !s.joined) return;
      void (async () => {
        try {
          for (const subchain of [0, 1]) {
            if (s.stopped || !s.joined) return;
            await this.onSubchainRequest(s.nativeId, { subchain, height: s.nextOffset[subchain], limit: 50 });
          }
        } catch (error) { this.backgroundError(s, error); }
        finally { this.armPoll(s); }
      })();
    };
    const delay = s.verificationPending ? 1000 : 5000;
    if (this.ports.schedule) s.cancelPoll = this.ports.schedule(tick, delay);
    else {
      const timer = setTimeout(tick, delay); timer.unref();
      s.cancelPoll = () => clearTimeout(timer);
    }
  }
  private backgroundError(s: Session, error: unknown): void {
    if (s.stopped) return;
    s.backgroundErrors.push(error);
    this.ports.onError?.(error);
  }
  private scheduleGap(s: Session, subchain: number): void {
    if (s.gap.has(subchain) || s.stopped || !s.joined) return;
    s.gap.add(subchain);
    void this.onSubchainRequest(s.nativeId, { subchain, height: s.nextOffset[subchain], limit: 50 })
      .catch((error) => this.backgroundError(s, error)).finally(() => s.gap.delete(subchain));
  }
  /** Drain controller work for deterministic integration/tests; rejects unconsumed background errors. */
  async flush(handle: ConferenceHandle): Promise<void> {
    const s = this.session(handle);
    let previous: Promise<unknown>;
    do { previous = s.tail; await previous; } while (previous !== s.tail);
    if (s.backgroundErrors.length) throw s.backgroundErrors.shift();
  }
  async onUpdateEmojis(nativeId: bigint, emojis: string): Promise<void> {
    const s = this.nativeSessions.get(nativeId);
    if (!s || s.stopped || !s.joined) return;
    s.emoji = emojis || null; s.verificationPending = !s.emoji;
    this.armPoll(s);
  }
  async getEmojiFingerprint(handle: ConferenceHandle): Promise<string | null> {
    const s = this.session(handle); this.active(s);
    // Never read a stale native fingerprint from a preceding epoch. This is an
    // unverified native display value, not crypto-health/epoch attestation.
    return s.verificationPending ? null : s.emoji;
  }
  async exportConferenceInvite(handle: ConferenceHandle): Promise<string> {
    const s = this.session(handle); this.active(s);
    const info = await this.rpc(s, (signal) => this.ports.adapter.getConferenceInfo({ id: s.info!.id, accessHash: s.info!.accessHash }, signal));
    this.active(s);
    if (info.id !== s.info!.id || !info.conference || !info.inviteLink) fail('Missing conference invite link');
    return info.inviteLink;
  }
  private async refreshParticipants(s: Session): Promise<void> {
    let offset = '';
    let version = -1;
    const snapshot = new Map<bigint, ConferenceParticipant>();
    const offsets = new Set<string>();
    for (let page = 0; page < 100; page++) {
      this.active(s);
      const result = await this.rpc(s, (signal) => this.ports.adapter.getParticipants(s.info!.call, {
        ids: [], sources: [], offset, limit: 100, signal,
      }));
      this.active(s);
      if (!Number.isInteger(result.version) || result.version < 0) fail('Invalid participant version');
      if (version >= 0 && version !== result.version) fail('Participant snapshot changed during pagination');
      version = result.version;
      for (const participant of result.participants) {
        if (participant.peer.kind !== 'user' || participant.peer.id <= 0n) fail('Conference requires a user identity for every participant');
        if (!participant.left) snapshot.set(participant.peer.id, participant);
      }
      if (!result.nextOffset) {
        await this.installParticipants(s, snapshot); s.participantVersion = version; return;
      }
      if (offsets.has(result.nextOffset)) fail('Participant pagination made no progress');
      offsets.add(result.nextOffset); offset = result.nextOffset;
    }
    fail('Participant pagination limit reached');
  }
  private async installParticipants(s: Session, snapshot: Map<bigint, ConferenceParticipant>): Promise<void> {
    const mappings = new Map<number, bigint>();
    const videos = new Map<string, { userId: bigint; groups: string; sources: { semantics: string; ssrcs: number[] }[] }>();
    const unsigned = (source: number): number => {
      if (!Number.isInteger(source) || source < -0x80000000 || source > 0xffffffff) fail('Invalid conference SSRC');
      return source >>> 0;
    };
    for (const participant of snapshot.values()) {
      if (participant.peer.kind !== 'user' || typeof participant.peer.id !== 'bigint' || participant.peer.id <= 0n) fail('Conference requires a user identity for every participant');
      const userId = participant.peer.id;
      for (const source of [participant.source, participant.presentation?.audioSource]) {
        if (source === undefined) continue;
        const ssrc = unsigned(source);
        if (mappings.has(ssrc) && mappings.get(ssrc) !== userId) fail('Conference SSRC belongs to different users');
        mappings.set(ssrc, userId);
      }
      for (const video of [participant.video, participant.presentation]) {
        if (!video || participant.self) continue;
        if (!video.endpoint) fail('Missing conference video endpoint');
        const groups = video.sourceGroups.map((group) => ({ semantics: group.semantics, ssrcs: group.sources.map(unsigned) }));
        const previous = videos.get(video.endpoint);
        if (previous && previous.userId !== userId) fail('Conference video endpoint belongs to different users');
        videos.set(video.endpoint, { userId, groups: JSON.stringify(groups), sources: groups });
      }
    }
    this.active(s);
    await this.ports.native.updateAudioSsrcMappings(s.nativeId, [...mappings].map(([ssrc, userId]) => ({ userId, ssrc })));
    for (const [endpoint, previous] of s.videos) {
      const next = videos.get(endpoint);
      if (!next || next.userId !== previous.userId || next.groups !== previous.groups) await this.ports.native.removeIncomingVideo(s.nativeId, endpoint);
    }
    for (const [endpoint, next] of videos) {
      const previous = s.videos.get(endpoint);
      if (!previous || next.userId !== previous.userId || next.groups !== previous.groups) {
        await this.ports.native.addIncomingVideo(s.nativeId, next.userId, endpoint, next.sources);
      }
    }
    this.active(s); s.participants = snapshot; s.videos = videos;
  }
  async onParticipantsUpdate(nativeId: bigint, update: { participants: ConferenceParticipant[]; version: number }): Promise<void> {
    const s = this.nativeSessions.get(nativeId);
    if (!s || !s.joined || s.stopped) return;
    await this.enqueue(s, async () => {
      this.active(s);
      if (update.version < s.participantVersion) return;
      if (update.version > s.participantVersion + 1) { await this.refreshParticipants(s); return; }
      const snapshot = new Map(s.participants);
      for (const participant of update.participants) {
        if (participant.peer.kind !== 'user' || participant.peer.id <= 0n) fail('Conference requires a user identity for every participant');
        if (participant.left) snapshot.delete(participant.peer.id); else snapshot.set(participant.peer.id, participant);
      }
      await this.installParticipants(s, snapshot); s.participantVersion = update.version;
    });
  }
  async onRequestParticipants(nativeId: bigint, request: { ssrcs: number[] }): Promise<void> {
    const s = this.nativeSessions.get(nativeId);
    if (!s || !s.joined || s.stopped) return;
    await this.enqueue(s, async () => {
      this.active(s);
      const known = new Set([...s.participants.values()].flatMap((p) => [p.source >>> 0, ...(p.presentation?.audioSource === undefined ? [] : [p.presentation.audioSource >>> 0])]));
      const missing = [...new Set(request.ssrcs)].filter((source) => !known.has(source >>> 0));
      if (!missing.length) { await this.installParticipants(s, new Map(s.participants)); return; }
      const result = await this.rpc(s, (signal) => this.ports.adapter.getParticipants(s.info!.call, {
        ids: [], sources: missing.map((source) => source | 0), offset: '', limit: 100, signal,
      }));
      this.active(s);
      const snapshot = new Map(s.participants);
      for (const participant of result.participants) {
        if (participant.left) snapshot.delete(participant.peer.id); else snapshot.set(participant.peer.id, participant);
      }
      await this.installParticipants(s, snapshot);
    });
  }
  async removeConferenceParticipants(_handle: ConferenceHandle, _users: unknown[], _options: { kick?: boolean; onlyLeft?: boolean } = {}): Promise<never> {
    throw new UnsupportedNativeCapabilityError('removal/rekey');
  }
  async rekeyConference(_handle: ConferenceHandle): Promise<never> { throw new UnsupportedNativeCapabilityError('rekey'); }
  async sendConferenceMessage(handle: ConferenceHandle, message: ConferenceMessageInput): Promise<ConferenceMessageReceipt> {
    if (typeof this.ports.native.encryptMessage !== 'function') {
      throw new UnsupportedNativeCapabilityError('application encryption');
    }
    if (typeof this.ports.adapter.sendConferenceMessage !== 'function') {
      fail('Conference adapter capability missing: sendConferenceMessage');
    }
    const s = this.session(handle);
    this.active(s);
    if (!s.joined || !s.info) fail('Conference session is not joined');
    let randomId: string;
    let plaintext: Buffer;
    if (message instanceof Uint8Array) {
      randomId = randomBytes(8).readBigInt64LE().toString();
      plaintext = Buffer.from(message);
    } else if (typeof message === 'string') {
      randomId = randomBytes(8).readBigInt64LE().toString();
      plaintext = Buffer.from(JSON.stringify({
        '@type': 'groupCallMessage',
        random_id: randomId,
        text: { text: message, entities: [] },
      }), 'utf8');
    } else if (message && typeof message === 'object' && typeof message.text === 'string') {
      randomId = message.randomId !== undefined ? String(message.randomId) : randomBytes(8).readBigInt64LE().toString();
      plaintext = Buffer.from(JSON.stringify({
        '@type': 'groupCallMessage',
        random_id: randomId,
        text: { text: message.text, entities: Array.isArray(message.entities) ? message.entities : [] },
      }), 'utf8');
    } else {
      fail('Conference message must be a string, { text, entities? }, or Uint8Array');
    }
    const encrypted = await this.ports.native.encryptMessage(s.nativeId, Array.from(plaintext));
    const encryptedBuf = Buffer.from(encrypted);
    if (!encryptedBuf.length) fail('Native encryptMessage returned empty ciphertext');
    await this.rpc(s, (signal) => this.ports.adapter.sendConferenceMessage!(s.info!.call, encryptedBuf, signal));
    return { randomId, bytes: encryptedBuf.length };
  }
  async onEncryptedMessage(nativeId: bigint, update: unknown): Promise<ConferenceMessageEvent | null> {
    if (typeof this.ports.native.decryptMessage !== 'function') {
      throw new UnsupportedNativeCapabilityError('application decryption');
    }
    const s = this.nativeSessions.get(nativeId);
    if (!s || !s.joined || s.stopped || !s.info) return null;
    const u = update as Record<string, any> | undefined;
    const from = u?.fromId ?? u?.from_id;
    const rawUserId = from?.userId ?? from?.user_id ?? (typeof from === 'bigint' || typeof from === 'number' ? from : undefined);
    const fromUserId = rawUserId !== undefined ? long(rawUserId) : 0n;
    if (fromUserId <= 0n) fail('Encrypted conference message requires a positive sender user id');
    const cipherRaw = u?.encryptedMessage ?? u?.encrypted_message;
    if (!(cipherRaw instanceof Uint8Array) || !cipherRaw.length) fail('Missing encrypted conference message bytes');
    const plain = Buffer.from(await this.ports.native.decryptMessage(s.nativeId, fromUserId, Array.from(cipherRaw)));
    let parsed: unknown;
    let text: string | undefined;
    let randomId: string | undefined;
    try {
      const json = JSON.parse(plain.toString('utf8')) as Record<string, any>;
      parsed = json;
      if (typeof json?.text === 'string') text = json.text;
      else if (typeof json?.text?.text === 'string') text = json.text.text;
      if (typeof json?.random_id === 'string') randomId = json.random_id;
    } catch { /* non-JSON custom binary payload */ }
    const event: ConferenceMessageEvent = {
      handle: s.handle,
      callId: s.info.id,
      fromUserId,
      raw: plain,
      ...(text !== undefined ? { text } : {}),
      ...(randomId !== undefined ? { randomId } : {}),
      ...(parsed !== undefined ? { parsed } : {}),
    };
    this.ports.onMessage?.(event);
    return event;
  }
  async getCryptoHealth(_handle: ConferenceHandle): Promise<never> { throw new UnsupportedNativeCapabilityError('crypto health'); }
  async inviteConferenceParticipants(handle: ConferenceHandle, users: unknown[], options: { video?: boolean } = {}): Promise<void> {
    const s = this.session(handle); this.active(s);
    for (const user of users) {
      const result = await this.rpc(s, (signal) => this.ports.adapter.inviteConferenceParticipant(s.info!.call, user, { video: options.video ?? false, signal }));
      this.active(s); await this.consume(s, result, 'passive');
    }
  }
  async leaveConference(handle: ConferenceHandle): Promise<void> { await this.cleanup(this.session(handle)); }
  async dispose(): Promise<void> {
    const results = await Promise.allSettled([...this.nativeSessions.values()].map((s) => this.cleanup(s)));
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
    if (errors.length) throw new AggregateError(errors, 'Conference cleanup failed');
  }
  private async cleanup(s: Session): Promise<void> {
    if (s.leaving) return s.leaving;
    s.stopped = true; s.joined = false; s.nextOffset = [-1, -1]; s.abort.abort(); s.detachAbort?.();
    s.cancelPoll?.(); s.cancelPoll = undefined;
    s.emoji = null; s.outbound = []; s.gap.clear(); s.participants.clear(); s.videos.clear();
    this.nativeSessions.delete(s.nativeId);
    s.leaving = (async () => {
      await s.tail;
      try { if (s.member && s.info) { s.member = false; await this.ports.adapter.leaveConference(s.info.call, s.source); } }
      finally { if (s.nativeCreated) { s.nativeCreated = false; await this.ports.native.stop(s.nativeId); } }
    })();
    return s.leaving;
  }
}
