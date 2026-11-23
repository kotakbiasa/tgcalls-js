import { MediaSegmentPartStatus, MediaSegmentQuality, type SegmentPartRequest } from 'ntgcalls';
import { TgCallsError } from './errors.js';

/** upload.getFile input. offset is a byte offset, independent of native partId. */
export interface BroadcastChunkRequest {
  timeMs: bigint;
  scale: 0;
  offset: bigint;
  limit: number;
  videoChannel?: number;
  videoQuality?: 0 | 1 | 2;
}
export type BroadcastChunkResult = { bytes: Uint8Array; redirect?: never } | { redirect: unknown; bytes?: never };
export interface BroadcastNativePort {
  /** Pass these JS arrays to native unchanged: ntgcalls 3.0.7 rejects Buffer inputs. */
  sendBroadcastPart(handle: bigint, segmentId: bigint, partId: number, status: MediaSegmentPartStatus, qualityUpdate: boolean, data: number[]): Promise<void>;
  sendBroadcastTimestamp(handle: bigint, timestamp: bigint): Promise<void>;
}
export interface BroadcastAdapterPort {
  /** Route to dcId explicitly. Return normalized raw timestamps without buffering/rounding. */
  getStreamChannels(call: unknown, dcId: number, signal: AbortSignal): Promise<Array<{ channel: number; lastTimestampMs: bigint }>>;
  /** Raw upload.getFile to the exact media DC, flood sleep/retries disabled, abortSignal forwarded. */
  downloadStreamChunk(call: unknown, request: BroadcastChunkRequest, dcId: number, signal: AbortSignal): Promise<BroadcastChunkResult>;
}
export interface BroadcastOptions {
  handle: bigint;
  call: unknown;
  dcId: number;
  native: BroadcastNativePort;
  adapter: BroadcastAdapterPort;
  requestTimeoutMs?: number;
  nativeTimeoutMs?: number;
  maxPartBytes?: number;
  maxConcurrentRequests?: number;
  maxRejoins?: number;
  /** Parent owns membership + native lifecycle. All active requests are answered before this hook. */
  rejoin?: (signal: AbortSignal) => Promise<{ call: unknown; dcId: number }>;
  onError?: (error: Error) => void;
  logger?: { error(...args: unknown[]): void };
}
export class BroadcastError extends TgCallsError {}
interface Work {
  abort: AbortController;
  done: Promise<void>;
  reply?: (status: MediaSegmentPartStatus, data?: Uint8Array) => Promise<void>;
}
const RPC_LIMIT = 1024 * 1024;

/** Download side only. The parent's native router calls requestPart/requestTimestamp. */
export class BroadcastController {
  private readonly options: BroadcastOptions;
  private call: unknown;
  private dcId: number;
  private stopped = false;
  private generation = 0;
  private readonly active = new Map<string, Work>();
  private timestamp?: Work;
  private recovery?: Work;
  private rejoins = 0;
  private stopping?: Promise<void>;

  constructor(options: BroadcastOptions) {
    checkDc(options.dcId);
    for (const [field, value] of Object.entries({
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
      nativeTimeoutMs: options.nativeTimeoutMs ?? 2_000,
      maxConcurrentRequests: options.maxConcurrentRequests ?? 8,
      maxPartBytes: options.maxPartBytes ?? 8 * RPC_LIMIT,
    })) {
      if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) throw new BroadcastError(`Invalid ${field}`);
    }
    if ((options.maxPartBytes ?? 8 * RPC_LIMIT) < RPC_LIMIT || (options.maxPartBytes ?? 8 * RPC_LIMIT) % RPC_LIMIT !== 0) {
      throw new BroadcastError('maxPartBytes must be a positive multiple of 1 MiB');
    }
    if (!Number.isInteger(options.maxRejoins ?? 2) || (options.maxRejoins ?? 2) < 0) throw new BroadcastError('Invalid maxRejoins');
    this.options = { ...options };
    this.call = options.call; this.dcId = options.dcId;
  }

  requestPart(input: SegmentPartRequest): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const request = { ...input };
    const key = `${request.segmentId}:${request.partId}:${Number(request.qualityUpdate)}`;
    const previous = this.active.get(key);
    if (previous) return previous.done;
    const abort = new AbortController();
    let terminal: Promise<void> | undefined;
    const work: Work = { abort, done: Promise.resolve() };
    const reply = (status: MediaSegmentPartStatus, data: Uint8Array = new Uint8Array()) => {
      if (!terminal) {
        terminal = this.native(() => this.options.native.sendBroadcastPart(this.options.handle, request.segmentId,
          request.partId, status, request.qualityUpdate, Array.from(data)));
      }
      return terminal;
    };
    work.reply = reply;
    const full = this.active.size >= (this.options.maxConcurrentRequests ?? 8);
    this.active.set(key, work);
    const generation = this.generation;
    const call = this.call; const dcId = this.dcId;
    const timer = setTimeout(() => abort.abort(new BroadcastError('Broadcast part request timeout')), this.options.requestTimeoutMs ?? 10_000);
    work.done = (async () => {
      let recover = false;
      try {
        if (full || this.recovery) { await reply(MediaSegmentPartStatus.NOT_READY); return; }
        let bytes: Uint8Array;
        try {
          bytes = await this.download(request, call, dcId, abort.signal);
          if (abort.signal.aborted || generation !== this.generation) throw new BroadcastError('Stale broadcast request');
        } catch (error) {
          const message = rpcMessage(error);
          const retry = /TIME_TOO_BIG|FLOOD(?:_PREMIUM)?_WAIT|FLOODWAIT/i.test(message);
          recover = /GROUPCALL_JOIN_MISSING|GROUPCALL_FORBIDDEN/i.test(message) && !this.stopped && !abort.signal.aborted;
          if (!retry && !abort.signal.aborted) this.report(error);
          await reply(retry ? MediaSegmentPartStatus.NOT_READY : MediaSegmentPartStatus.RESYNC_NEEDED);
          if (recover) await this.rejoin();
          return;
        }
        await reply(bytes.length ? MediaSegmentPartStatus.SUCCESS : MediaSegmentPartStatus.NOT_READY, bytes);
      } finally {
        clearTimeout(timer);
        if (this.active.get(key) === work) this.active.delete(key);
      }
    })();
    // Native router users should await/catch; attach a report sink as well for fire-and-forget routing.
    void work.done.catch(error => this.report(error));
    return work.done;
  }

  requestTimestamp(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.timestamp) return this.timestamp.done;
    const abort = new AbortController();
    const work: Work = { abort, done: Promise.resolve() };
    this.timestamp = work;
    const timer = setTimeout(() => abort.abort(new BroadcastError('Broadcast timestamp request timeout')), this.options.requestTimeoutMs ?? 10_000);
    work.done = (async () => {
      try {
        let timestamp = 0n;
        let recover = false;
        try {
          const channels = this.recovery ? [] : await abortable(() => this.options.adapter.getStreamChannels(this.call, this.dcId, abort.signal), abort.signal);
          const channel = channels.find(value => value.channel === 1) ?? channels[0];
          if (channel) {
            if (typeof channel.lastTimestampMs !== 'bigint' || channel.lastTimestampMs < 0n) throw new BroadcastError('Invalid stream channel timestamp');
            timestamp = channel.lastTimestampMs;
          }
        } catch (error) {
          if (!abort.signal.aborted) this.report(error);
          recover = /GROUPCALL_JOIN_MISSING|GROUPCALL_FORBIDDEN/i.test(rpcMessage(error)) && !abort.signal.aborted;
        }
        // Native applies the 1000ms rounding and 2000ms buffer exactly once.
        await this.native(() => this.options.native.sendBroadcastTimestamp(this.options.handle, timestamp));
        if (recover) {
          if (this.timestamp === work) this.timestamp = undefined;
          await this.rejoin();
        }
      } finally {
        clearTimeout(timer);
        if (this.timestamp === work) this.timestamp = undefined;
      }
    })();
    void work.done.catch(error => this.report(error));
    return work.done;
  }

  /** Must finish BEFORE the parent destroys/replaces the native handle. Idempotent. */
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true; ++this.generation;
    const jobs = [...this.active.values(), ...this.timestamp ? [this.timestamp] : [], ...this.recovery ? [this.recovery] : []];
    for (const job of jobs) job.abort.abort(new BroadcastError('Broadcast controller stopped'));
    this.stopping = Promise.allSettled(jobs.map(job => job.done)).then(results => {
      const failed = results.find((value): value is PromiseRejectedResult => value.status === 'rejected');
      if (failed) throw failed.reason;
    });
    return this.stopping;
  }
  close(): Promise<void> { return this.stop(); }

  private async download(request: SegmentPartRequest, call: unknown, dcId: number, signal: AbortSignal): Promise<Uint8Array> {
    const chunk: BroadcastChunkRequest = { timeMs: request.timestamp, scale: 0, offset: 0n, limit: RPC_LIMIT };
    if (typeof request.timestamp !== 'bigint' || request.timestamp < 0n) throw new BroadcastError('Invalid broadcast timestamp');
    if (request.quality !== MediaSegmentQuality.NONE) {
      const quality = new Map<number, 0 | 1 | 2>([
        [MediaSegmentQuality.THUMBNAIL, 0], [MediaSegmentQuality.MEDIUM, 1], [MediaSegmentQuality.FULL, 2],
      ]).get(request.quality);
      if (quality === undefined || !Number.isInteger(request.channelId) || request.channelId < 0) throw new BroadcastError('Invalid broadcast video quality/channel');
      chunk.videoChannel = request.channelId; chunk.videoQuality = quality;
    }
    const parts: Uint8Array[] = [];
    const cap = this.options.maxPartBytes ?? 8 * RPC_LIMIT;
    let length = 0;
    while (length < cap) {
      const result = await abortable(() => this.options.adapter.downloadStreamChunk(call, { ...chunk, offset: BigInt(length) }, dcId, signal), signal);
      if ('redirect' in result) throw new BroadcastError('Broadcast CDN redirect requires resynchronization');
      if (!(result.bytes instanceof Uint8Array) || result.bytes.length > RPC_LIMIT) throw new BroadcastError('Invalid broadcast download response');
      const bytes = Uint8Array.from(result.bytes);
      parts.push(bytes); length += bytes.length;
      if (bytes.length < RPC_LIMIT) {
        const complete = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) { complete.set(part, offset); offset += part.length; }
        return complete;
      }
    }
    throw new BroadcastError('Broadcast part reached download cap before a short read');
  }
  private rejoin(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.recovery) return this.recovery.done;
    if (!this.options.rejoin || this.rejoins >= (this.options.maxRejoins ?? 2)) {
      this.report(new BroadcastError('Broadcast fresh rejoin is unavailable or exhausted')); return Promise.resolve();
    }
    ++this.rejoins; ++this.generation;
    const abort = new AbortController();
    const work: Work = { abort, done: Promise.resolve() };
    this.recovery = work;
    // Complete every active native request before the parent can tear down its handle.
    const replies = [...this.active.values()].map(job => {
      job.abort.abort(new BroadcastError('Broadcast membership changed'));
      return job.reply!(MediaSegmentPartStatus.RESYNC_NEEDED);
    });
    const timestamp = this.timestamp;
    timestamp?.abort.abort(new BroadcastError('Broadcast membership changed'));
    if (timestamp) replies.push(timestamp.done);
    const timer = setTimeout(() => abort.abort(new BroadcastError('Broadcast fresh rejoin timeout')), this.options.requestTimeoutMs ?? 10_000);
    work.done = (async () => {
      try {
        await Promise.all(replies);
        const joined = await abortable(() => this.options.rejoin!(abort.signal), abort.signal);
        checkDc(joined.dcId);
        if (!this.stopped && !abort.signal.aborted) { this.call = joined.call; this.dcId = joined.dcId; }
      } catch (error) { if (!this.stopped) this.report(error); }
      finally { clearTimeout(timer); if (this.recovery === work) this.recovery = undefined; }
    })();
    return work.done;
  }
  private native(action: () => Promise<void>): Promise<void> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new BroadcastError('Broadcast native reply timeout')), this.options.nativeTimeoutMs ?? 2_000);
    return abortable(action, abort.signal).finally(() => clearTimeout(timer));
  }
  private report(error: unknown): void {
    const value = error instanceof Error ? error : new BroadcastError(String(error));
    try {
      if (this.options.onError) this.options.onError(value);
      else (this.options.logger ?? console).error(value);
    } catch (failure) { (this.options.logger ?? console).error(failure); }
  }
}
function checkDc(dcId: number): void {
  if (!Number.isInteger(dcId) || dcId <= 0) throw new BroadcastError('A valid stream media DC is required');
}
function rpcMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const value = error as { errorMessage?: string; message?: string; name?: string };
  return `${value.errorMessage ?? ''} ${value.message ?? ''} ${value.name ?? ''}`;
}
/** Even an adapter ignoring AbortSignal cannot keep the controller's promise pending. */
function abortable<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancelled = () => reject(signal.reason ?? new BroadcastError('Broadcast request cancelled'));
    if (signal.aborted) { cancelled(); return; }
    signal.addEventListener('abort', cancelled, { once: true });
    let result: Promise<T>;
    try { result = action(); } catch (error) { result = Promise.reject(error); }
    result.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
  });
}
