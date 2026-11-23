import { open, mkdir, writeFile, rename } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { MediaSource, StreamDevice, StreamMode } from 'ntgcalls';
import type { MediaDescription, SsrcGroup } from 'ntgcalls';
import { TgCallsError } from './errors.js';
import { ParticipantRegistry, normalizeSsrc, participantKey } from './participants.js';
import type { PeerIdentity, ParticipantDevice, ParticipantSource } from './participants.js';

/** Only the native commands this recorder owns. Callbacks remain with the client router. */
export interface FolderNativePort {
  setStreamSources(handle: bigint, mode: StreamMode, media: MediaDescription): Promise<void>;
  addIncomingVideo(handle: bigint, peerId: bigint, endpoint: string, groups: SsrcGroup[]): Promise<number>;
  removeIncomingVideo(handle: bigint, endpoint: string): Promise<boolean>;
}
export interface FolderFrame {
  ssrc: bigint | number;
  data: Uint8Array;
  frameData?: { width?: number; height?: number; absoluteCaptureTimestampMs?: bigint; rotation?: number };
}
export type FolderFramesConsumer = (handle: bigint, mode: StreamMode, device: StreamDevice, frames: readonly FolderFrame[]) => void;
export interface FolderRecordingStopped {
  path: string;
  peer: PeerIdentity;
  device: ParticipantDevice;
  segment: number;
  reason: string;
  status: 'saved' | 'empty' | 'failed';
  error?: Error;
}
export interface FolderRecordingDiagnostic {
  code: 'unknown-buffer-full' | 'unknown-expired' | 'unknown-stopped' | 'version-gap' | 'device-mismatch';
  ssrc?: number;
  device?: ParticipantDevice;
}
export interface FolderRecorderOptions {
  handle: bigint;
  dir: string;
  registry: ParticipantRegistry;
  native: FolderNativePort;
  video?: boolean;
  sampleRate?: number;
  channels?: 1 | 2;
  ffprobePath?: string;
  ffmpegPath?: string;
  fps?: number;
  /** Monotonic local arrival clock in milliseconds; native A/V units differ. */
  now?: () => number;
  maxQueuedBytes?: number;
  maxQueuedFrames?: number;
  maxUnknownBytes?: number;
  unknownTimeoutMs?: number;
  /** Owner performs bounded MTProto getParticipants(sources), then updates registry. */
  lookupUnknown?: (sources: number[], signal: AbortSignal) => Promise<void>;
  onDiagnostic?: (event: FolderRecordingDiagnostic) => void;
  /** Per-participant attribution is impossible for native RTMP's unified SSRC 1. */
  connectionMode?: 'RTC' | 'STREAM' | 'RTMP';
  /** Subscribe to the parent's handle/generation router; do not pass native.onFrames. */
  subscribeFrames?: (consumer: FolderFramesConsumer) => () => void;
  onStopped?: (event: FolderRecordingStopped) => void | Promise<void>;
  onError?: (error: Error) => void;
}
interface Segment {
  path: string;
  peer: PeerIdentity;
  device: ParticipantDevice;
  segment: number;
  ssrc: number;
  endpoint?: string;
  startMs: number;
  endMs: number;
  frames: number;
  bytes: number;
  file: FileHandle;
  error?: Error;
  status?: FolderRecordingStopped['status'];
  reason?: string;
  width?: number;
  height?: number;
  rawPath?: string;
  audioPath?: string;
  audioFile?: FileHandle;
  audioBytes?: number;
  audioSsrc?: number;
  lastFrame?: Buffer;
  nativeTimestamp?: string;
}
function errorOf(error: unknown): Error { return error instanceof Error ? error : new TgCallsError(String(error)); }
function wavHeader(bytes: number, sampleRate: number, channels: number): Buffer {
  if (bytes > 0xffffffff - 36) { throw new TgCallsError('WAV segment exceeds RIFF size limit'); }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(bytes + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(bytes, 40);
  return header;
}
/** Async child execution with bounded diagnostic buffers and a hard deadline. */
async function command(program: string, args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-65536); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-16384); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) { resolveCommand(stdout); }
      else { reject(new TgCallsError(`${program} failed (${code ?? signal}): ${stderr}`)); }
    });
  });
}

/**
 * One exclusive PLAYBACK owner per native handle. Frame ingress is synchronous
 * and bounded; disk/finalization work is serialized. stop() drains accepted
 * frames and only emits saved after ffprobe accepts the closed output file.
 */
export class FolderRecorder {
  readonly path: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly startedAt = Date.now();
  private state: 'idle' | 'active' | 'stopping' | 'stopped' = 'idle';
  private work: Promise<void> = Promise.resolve();
  private stopping?: Promise<string>;
  private startPromise?: Promise<void>;
  private unsubscribeFrames?: () => void;
  private unsubscribeRegistry?: () => void;
  private queuedBytes = 0;
  private readonly maxQueuedBytes: number;
  private sequence = 0;
  private segments: Segment[] = [];
  private active = new Map<string, Segment>();
  private failures: Error[] = [];
  private origin = performance.now();
  private subscriptions = new Map<string, string>();
  private readonly fps: number;
  private queuedFrames = 0;
  private droppedFrames = 0;
  private sourceErrors = new Map<string, Error>();
  private unknown: { frame: FolderFrame; device: ParticipantDevice; arrival: number; expires: number }[] = [];
  private unknownBytes = 0;
  private unknownTimer?: ReturnType<typeof setTimeout>;
  private lookupInFlight = new Set<number>();
  private lookupAbort = new AbortController();
  private initialized = false;

  constructor(private readonly options: FolderRecorderOptions) {
    if (options.connectionMode === 'RTMP') { throw new TgCallsError('Per-participant recording unavailable for unified RTMP media'); }
    this.path = resolve(options.dir);
    this.sampleRate = options.sampleRate ?? 48000;
    this.channels = options.channels ?? 1;
    this.maxQueuedBytes = options.maxQueuedBytes ?? 8 * 1024 * 1024;
    for (const bound of [options.maxQueuedFrames ?? 1024, options.maxUnknownBytes ?? 1024 * 1024, options.unknownTimeoutMs ?? 1000]) {
      if (!Number.isSafeInteger(bound) || bound < 1) { throw new TgCallsError('Invalid folder queue/unknown bounds'); }
    }
    this.fps = options.fps ?? 25;
    if (!Number.isSafeInteger(this.fps) || this.fps < 1 || this.fps > 60) { throw new TgCallsError('Invalid folder video fps'); }
    if (!Number.isSafeInteger(this.sampleRate) || this.sampleRate < 8000 || this.sampleRate > 192000 || ![1, 2].includes(this.channels) || !Number.isSafeInteger(this.maxQueuedBytes) || this.maxQueuedBytes < 1) {
      throw new TgCallsError('Invalid folder recording format or buffer bounds');
    }
  }
  start(): Promise<void> {
    if (this.state === 'active' && this.startPromise) { return this.startPromise; }
    if (this.state !== 'idle') { return Promise.reject(new TgCallsError('Folder recorder has stopped')); }
    this.state = 'active';
    this.startPromise = this.begin();
    return this.startPromise;
  }
  private async begin(): Promise<void> {
    await mkdir(this.path, { recursive: true });
    await writeFile(join(this.path, 'manifest.json'), '{}\n', { flag: 'wx', mode: 0o600 });
    this.origin = this.options.now?.() ?? performance.now();
    this.initialized = true;
    try {
      if (this.state !== 'active') { return; }
      this.unsubscribeRegistry = this.options.registry.subscribe((change) => {
        if (this.state !== 'active' || change.reason === 'alias') { return; }
        const snapshot = this.options.registry.snapshot();
        this.enqueue(() => this.syncParticipants(snapshot));
        if (change.reason === 'gap') {
          this.diagnostic({ code: 'version-gap' });
          this.dropUnknown('unknown-expired');
        } else { this.replayUnknown(); }
      });
      this.unsubscribeFrames = this.options.subscribeFrames?.(this.consumeFrames.bind(this));
      const initialParticipants = this.options.registry.snapshot();
      this.enqueue(() => this.syncParticipants(initialParticipants));
      await this.options.native.setStreamSources(this.options.handle, StreamMode.PLAYBACK, this.playbackDescription());
      await this.work;
      if (this.failures.length) { throw this.failures[0]; }
      await this.manifest();
    } catch (error) {
      this.observe(errorOf(error));
      this.state = 'stopping';
      this.detach();
      try { await this.options.native.setStreamSources(this.options.handle, StreamMode.PLAYBACK, {}); } catch (cleanupError) { this.observe(errorOf(cleanupError)); }
      for (const endpoint of this.subscriptions.keys()) {
        try { await this.options.native.removeIncomingVideo(this.options.handle, endpoint); this.options.registry.unbindEndpoint(endpoint); } catch (cleanupError) { this.observe(errorOf(cleanupError)); }
      }
      this.subscriptions.clear();
      await this.work;
      for (const segment of this.active.values()) { await this.finalize(segment, 'start-error'); }
      this.active.clear(); this.state = 'stopped';
      await this.manifest().catch((manifestError) => { this.observe(errorOf(manifestError)); });
      throw error;
    }
  }
  playbackDescription(): MediaDescription {
    const video = { mediaSource: MediaSource.EXTERNAL, width: 0, height: 0, fps: 0, input: '', keepOpen: false };
    return {
      microphone: { mediaSource: MediaSource.EXTERNAL, sampleRate: this.sampleRate, channelCount: this.channels, input: '', keepOpen: false },
      ...(this.options.video ? { camera: { ...video }, screen: { ...video } } : {}),
    };
  }
  consumeFrames(handle: bigint, mode: StreamMode, device: StreamDevice, frames: readonly FolderFrame[]): void {
    if (this.state !== 'active' || handle !== this.options.handle || mode !== StreamMode.PLAYBACK) { return; }
    const kind = device === StreamDevice.MICROPHONE ? 'microphone' : device === StreamDevice.CAMERA ? 'camera' : device === StreamDevice.SCREEN ? 'screen' : undefined;
    if (!kind || (kind !== 'microphone' && !this.options.video)) { return; }
    for (const frame of frames) {
      try {
        const source = this.options.registry.lookup(frame.ssrc, kind);
        if (source?.paused) { this.droppedFrames++; continue; }
        if (kind === 'microphone' && frame.data.byteLength % (this.channels * 2)) { throw new TgCallsError('Misaligned PCM frame'); }
        const width = frame.frameData?.width ?? 0, height = frame.frameData?.height ?? 0;
        if (kind !== 'microphone' && (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width % 2 || height % 2 || width * height > 3840 * 2160 || frame.data.byteLength !== width * height * 3 / 2)) { throw new TgCallsError('Invalid I420 frame dimensions or size'); }
        if (!source) {
          const otherDevice = kind === 'camera' ? 'screen' : kind === 'screen' ? 'camera' : undefined;
          if (otherDevice && this.options.registry.lookup(frame.ssrc, otherDevice)) {
            this.droppedFrames++; this.diagnostic({ code: 'device-mismatch', ssrc: normalizeSsrc(frame.ssrc), device: kind }); continue;
          }
          if (this.options.registry.needsResync) { this.droppedFrames++; this.diagnostic({ code: 'version-gap', ssrc: normalizeSsrc(frame.ssrc), device: kind }); }
          else { this.holdUnknown(frame, kind, this.time()); }
          continue;
        }
        this.acceptFrame(source, frame, this.time());
      } catch (error) {
        const failure = errorOf(error);
        try {
          const source = this.options.registry.lookup(frame.ssrc, kind);
          if (source) { this.sourceErrors.set(`${participantKey(source.peer)}:${source.device}:${source.ssrc}`, failure); }
        } catch (lookupError) { this.observe(errorOf(lookupError)); }
        this.observe(failure);
      }
    }
  }
  /** Wait for frames/transitions already accepted, useful for an owner flushing before leave. */
  async flush(): Promise<void> { await this.work; }
  stop(reason = 'stop'): Promise<string> {
    if (this.stopping) { return this.stopping; }
    this.state = 'stopping';
    this.detach();
    this.stopping = this.finish(reason);
    return this.stopping;
  }
  private async finish(reason: string): Promise<string> {
    if (this.startPromise) { await this.startPromise.catch((error) => { this.observe(errorOf(error)); }); }
    this.state = 'stopping';
    this.detach();
    this.dropUnknown('unknown-stopped');
    if (!this.initialized) {
      this.state = 'stopped';
      if (this.failures.length) { throw new AggregateError(this.failures, 'Folder recording failed'); }
      return this.path;
    }
    try { await this.options.native.setStreamSources(this.options.handle, StreamMode.PLAYBACK, {}); }
    catch (error) { this.observe(errorOf(error)); }
    await this.work;
    for (const endpoint of this.subscriptions.keys()) {
      try { await this.options.native.removeIncomingVideo(this.options.handle, endpoint); this.options.registry.unbindEndpoint(endpoint); }
      catch (error) { this.observe(errorOf(error)); }
    }
    this.subscriptions.clear();
    for (const segment of this.active.values()) { await this.finalize(segment, reason); }
    this.active.clear(); this.state = 'stopped';
    try { await this.manifest(); } catch (error) { this.observe(errorOf(error)); }
    if (this.failures.length) { throw new AggregateError(this.failures, 'Folder recording failed'); }
    return this.path;
  }
  private enqueue(operation: () => Promise<void>): void {
    this.work = this.work.then(operation).catch((error) => { this.observe(errorOf(error)); });
  }
  private observe(error: Error): void {
    if (this.failures.length < 64 && !this.failures.includes(error)) { this.failures.push(error); }
    try { this.options.onError?.(error); } catch (listenerError) { if (this.failures.length < 64) { this.failures.push(errorOf(listenerError)); } }
  }
  private detach(): void {
    this.unsubscribeFrames?.(); this.unsubscribeFrames = undefined;
    this.unsubscribeRegistry?.(); this.unsubscribeRegistry = undefined;
    clearTimeout(this.unknownTimer); this.unknownTimer = undefined;
    this.lookupAbort.abort();
  }
  private diagnostic(event: FolderRecordingDiagnostic): void {
    try { this.options.onDiagnostic?.(event); } catch (error) { this.observe(errorOf(error)); }
  }
  private holdUnknown(frame: FolderFrame, device: ParticipantDevice, arrival: number): void {
    const ssrc = normalizeSsrc(frame.ssrc);
    if (this.unknownBytes + frame.data.byteLength > (this.options.maxUnknownBytes ?? 1024 * 1024) || this.unknown.length >= 128) {
      this.droppedFrames++; this.diagnostic({ code: 'unknown-buffer-full', ssrc, device }); return;
    }
    this.unknown.push({ frame: { ...frame, ssrc, data: Buffer.from(frame.data), frameData: frame.frameData ? { ...frame.frameData } : undefined },
      device, arrival, expires: performance.now() + (this.options.unknownTimeoutMs ?? 1000) });
    this.unknownBytes += frame.data.byteLength;
    this.scheduleUnknownExpiry();
    if (this.options.lookupUnknown && this.lookupInFlight.size < 32 && !this.lookupInFlight.has(ssrc)) {
      this.lookupInFlight.add(ssrc);
      try {
        void this.options.lookupUnknown([ssrc], this.lookupAbort.signal).then(() => {
          if (this.state === 'active') { this.replayUnknown(); }
        }).catch((error) => {
          if (this.state === 'active') { this.observe(errorOf(error)); }
        }).finally(() => { this.lookupInFlight.delete(ssrc); });
      } catch (error) { this.lookupInFlight.delete(ssrc); this.observe(errorOf(error)); }
    }
  }
  private scheduleUnknownExpiry(): void {
    clearTimeout(this.unknownTimer); this.unknownTimer = undefined;
    if (!this.unknown.length || this.state !== 'active') { return; }
    const delay = Math.max(1, Math.min(...this.unknown.map((item) => item.expires)) - performance.now());
    this.unknownTimer = setTimeout(() => this.replayUnknown(), delay);
    this.unknownTimer.unref();
  }
  private replayUnknown(): void {
    if (this.state !== 'active') { return; }
    const pending = this.unknown;
    this.unknown = []; this.unknownBytes = 0;
    for (const item of pending) {
      const source = this.options.registry.lookup(item.frame.ssrc, item.device);
      if (item.expires <= performance.now()) {
        this.droppedFrames++; this.diagnostic({ code: 'unknown-expired', ssrc: normalizeSsrc(item.frame.ssrc), device: item.device });
      } else if (source?.paused) { this.droppedFrames++; }
      else if (source) { this.acceptFrame(source, item.frame, item.arrival); }
      else { this.unknown.push(item); this.unknownBytes += item.frame.data.byteLength; }
    }
    this.scheduleUnknownExpiry();
  }
  private dropUnknown(code: 'unknown-expired' | 'unknown-stopped'): void {
    clearTimeout(this.unknownTimer); this.unknownTimer = undefined;
    for (const item of this.unknown) { this.droppedFrames++; this.diagnostic({ code, ssrc: normalizeSsrc(item.frame.ssrc), device: item.device }); }
    this.unknown = []; this.unknownBytes = 0;
  }
  private acceptFrame(source: ParticipantSource, frame: FolderFrame, arrival: number): void {
    const errorKey = `${participantKey(source.peer)}:${source.device}:${source.ssrc}`;
    if (this.sourceErrors.has(errorKey)) { this.droppedFrames++; return; }
    if (this.queuedBytes + frame.data.byteLength > this.maxQueuedBytes || this.queuedFrames >= (this.options.maxQueuedFrames ?? 1024)) {
      const error = new TgCallsError('Folder recording queue limit exceeded');
      this.sourceErrors.set(errorKey, error); this.droppedFrames++; this.observe(error); return;
    }
    const data = Buffer.from(frame.data);
    const timestamp = frame.frameData?.absoluteCaptureTimestampMs?.toString();
    const width = frame.frameData?.width ?? 0, height = frame.frameData?.height ?? 0;
    this.queuedBytes += data.length; this.queuedFrames++;
    this.enqueue(async () => {
      try {
        if (source.device === 'microphone') { await this.writeAudio(source, data, arrival); }
        else { await this.writeVideo(source, data, width, height, arrival, timestamp); }
      } catch (error) { this.sourceErrors.set(errorKey, errorOf(error)); throw error; }
      finally { this.queuedBytes -= data.length; this.queuedFrames--; }
    });
  }
  private time(): number { return (this.options.now?.() ?? performance.now()) - this.origin; }
  private async writeAudio(source: ParticipantSource, data: Buffer, arrival: number): Promise<void> {
    const key = `${participantKey(source.peer)}:microphone:${source.ssrc}`;
    let segment = this.active.get(key);
    if (!segment) {
      const index = ++this.sequence;
      const path = join(this.path, `${source.peer.kind}-${source.peer.id}-microphone-${index}.wav`);
      const file = await open(path, 'wx', 0o600);
      await file.write(wavHeader(0, this.sampleRate, this.channels), 0, 44, 0);
      segment = { ...source, segment: index, path, file, startMs: arrival, endMs: arrival, frames: 0, bytes: 0, error: this.sourceErrors.get(`${participantKey(source.peer)}:microphone:${source.ssrc}`) };
      this.segments.push(segment); this.active.set(key, segment);
    }
    try {
      await segment.file.write(data, 0, data.length, 44 + segment.bytes);
      segment.bytes += data.length; segment.frames++; segment.endMs = arrival;
      for (const video of this.active.values()) {
        if (video.device === 'microphone' || video.audioSsrc !== source.ssrc || participantKey(video.peer) !== participantKey(source.peer) || !video.audioFile) { continue; }
        const offset = Math.max(video.audioBytes ?? 0, Math.max(0, Math.round((arrival - video.startMs) / 1000 * this.sampleRate)) * this.channels * 2);
        await video.audioFile.write(data, 0, data.length, offset);
        video.audioBytes = offset + data.length;
      }
    } catch (error) { segment.error = errorOf(error); throw error; }
  }
  private async finalize(segment: Segment, reason: string): Promise<void> {
    if (segment.status) { return; }
    try {
      if (segment.device !== 'microphone') { await this.finalizeVideo(segment); }
      else {
      segment.error ??= this.sourceErrors.get(`${participantKey(segment.peer)}:${segment.device}:${segment.ssrc}`);
      await segment.file.write(wavHeader(segment.bytes, this.sampleRate, this.channels), 0, 44, 0);
      await segment.file.close();
      if (segment.error) { throw segment.error; }
      const info = JSON.parse(await command(this.options.ffprobePath ?? 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', segment.path]));
      if (info.streams?.[0]?.codec_name !== 'pcm_s16le') { throw new TgCallsError('Invalid WAV output'); }
      segment.status = segment.bytes ? 'saved' : 'empty';
      }
    } catch (error) {
      segment.error = errorOf(error); segment.status = 'failed'; this.observe(segment.error);
      await segment.file.close().catch((closeError) => { this.observe(errorOf(closeError)); });
      await segment.audioFile?.close().catch((closeError) => { this.observe(errorOf(closeError)); });
    }
    segment.lastFrame = undefined;
    segment.reason = reason;
    try { await this.options.onStopped?.({ path: segment.path, peer: { ...segment.peer }, device: segment.device, segment: segment.segment, reason, status: segment.status ?? 'failed', error: segment.error }); }
    catch (error) { this.observe(errorOf(error)); }
  }
  private async syncParticipants(snapshot: ReturnType<ParticipantRegistry['snapshot']>): Promise<void> {
    const desired = new Map<string, { signature: string; peer: PeerIdentity; groups: SsrcGroup[] }>();
    for (const p of snapshot) {
      if (p.self) { continue; }
      for (const [device, video] of [['camera', p.video], ['screen', p.presentation]] as const) {
        if (!video || video.paused || !this.options.video) { continue; }
        const groups = video.sourceGroups.map((group) => ({ semantics: group.semantics, ssrcs: group.sources.map(normalizeSsrc) }));
        desired.set(video.endpoint, { peer: p.peer, groups, signature: `${participantKey(p.peer)}:${device}:${JSON.stringify(groups)}` });
      }
    }
    for (const [key, segment] of this.active) {
      const peer = snapshot.find((p) => participantKey(p.peer) === participantKey(segment.peer) && !p.self);
      const video = segment.device === 'camera' ? peer?.video : peer?.presentation;
      const valid = !this.options.registry.needsResync && (segment.device === 'microphone'
        ? peer && (peer.source === segment.ssrc || peer.presentation?.audioSource === segment.ssrc || peer.video?.audioSource === segment.ssrc)
        : video && !video.paused && video.endpoint === segment.endpoint);
      if (!valid) {
        await this.finalize(segment, !peer ? 'participant-left' : segment.device === 'microphone' ? 'source-change' : 'endpoint-change');
        this.active.delete(key);
      }
    }
    for (const [endpoint, signature] of this.subscriptions) {
      if (desired.get(endpoint)?.signature === signature) { continue; }
      await this.options.native.removeIncomingVideo(this.options.handle, endpoint);
      this.options.registry.unbindEndpoint(endpoint);
      this.subscriptions.delete(endpoint);
    }
    for (const [endpoint, value] of desired) {
      if (this.subscriptions.has(endpoint)) { continue; }
      const ssrc = await this.options.native.addIncomingVideo(this.options.handle, value.peer.id, endpoint, value.groups);
      const stillCurrent = this.state === 'active' && this.options.registry.snapshot().some((p) =>
        participantKey(p.peer) === participantKey(value.peer) && !p.self && [p.video, p.presentation].some((stream) =>
          stream?.endpoint === endpoint && !stream.paused && JSON.stringify(stream.sourceGroups.map((group) => ({ semantics: group.semantics, ssrcs: group.sources }))) === JSON.stringify(value.groups)));
      if (!stillCurrent) {
        await this.options.native.removeIncomingVideo(this.options.handle, endpoint);
        continue;
      }
      this.subscriptions.set(endpoint, value.signature);
      this.options.registry.bindEndpoint(endpoint, ssrc);
    }
  }
  private async writeVideo(source: ParticipantSource, data: Buffer, width: number, height: number, arrival: number, timestamp?: string): Promise<void> {
    const key = `${participantKey(source.peer)}:${source.device}`;
    let segment = this.active.get(key);
    if (segment && (segment.width !== width || segment.height !== height || segment.endpoint !== source.endpoint)) {
      await this.finalize(segment, segment.endpoint !== source.endpoint ? 'endpoint-change' : 'resolution-change');
      this.active.delete(key); segment = undefined;
    }
    if (!segment) {
      const index = ++this.sequence;
      const path = join(this.path, `${source.peer.kind}-${source.peer.id}-${source.device}-${index}.mp4`);
      const rawPath = `${path}.i420`, audioPath = `${path}.s16le`;
      const file = await open(rawPath, 'wx', 0o600);
      let audioFile: FileHandle;
      try { audioFile = await open(audioPath, 'wx', 0o600); }
      catch (error) { await file.close(); throw error; }
      const p = this.options.registry.snapshot().find((p) => participantKey(p.peer) === participantKey(source.peer));
      segment = { ...source, segment: index, path, file, rawPath, audioPath, audioFile, audioBytes: 0,
        audioSsrc: source.device === 'screen' ? p?.presentation?.audioSource ?? p?.source : p?.source,
        startMs: arrival, endMs: arrival, frames: 0, bytes: 0, width, height, nativeTimestamp: timestamp, error: this.sourceErrors.get(`${participantKey(source.peer)}:${source.device}:${source.ssrc}`) };
      this.segments.push(segment); this.active.set(key, segment);
    }
    // CFR timeline from local monotonic arrival. Duplicate held frames over gaps,
    // drop arrivals inside an occupied output slot, cap expansion to one second.
    const slot = Math.round((arrival - segment.startMs) * this.fps / 1000);
    if (slot < segment.frames) { return; }
    if (slot - segment.frames > this.fps) { throw new TgCallsError('Video arrival gap exceeds bounded CFR window'); }
    while (segment.frames < slot && segment.lastFrame) {
      await segment.file.write(segment.lastFrame, 0, segment.lastFrame.length, segment.bytes);
      segment.bytes += segment.lastFrame.length; segment.frames++;
    }
    await segment.file.write(data, 0, data.length, segment.bytes);
    segment.bytes += data.length; segment.frames++; segment.endMs = arrival;
    segment.lastFrame = data;
  }
  private async finalizeVideo(segment: Segment): Promise<void> {
    await segment.file.close();
    if (!segment.audioFile || !segment.rawPath || !segment.audioPath || !segment.width || !segment.height) { throw new TgCallsError('Incomplete video segment'); }
    const audioLength = Math.round(segment.frames / this.fps * this.sampleRate) * this.channels * 2;
    // Sparse file extension inserts real zero samples for missing peer audio;
    // audio from any other peer is never selected as a fallback.
    await segment.audioFile.truncate(audioLength);
    await segment.audioFile.close();
    segment.error ??= this.sourceErrors.get(`${participantKey(segment.peer)}:${segment.device}:${segment.ssrc}`);
    if (segment.error) { throw segment.error; }
    await command(this.options.ffmpegPath ?? 'ffmpeg', [
      '-v', 'error', '-nostdin', '-n', '-f', 'rawvideo', '-pixel_format', 'yuv420p',
      '-video_size', `${segment.width}x${segment.height}`, '-framerate', String(this.fps), '-i', segment.rawPath,
      '-f', 's16le', '-ar', String(this.sampleRate), '-ac', String(this.channels), '-i', segment.audioPath,
      '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-shortest', '-movflags', '+faststart', segment.path,
    ]);
    const info = JSON.parse(await command(this.options.ffprobePath ?? 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', segment.path]));
    if (!info.streams?.some((stream: { codec_name: string }) => stream.codec_name === 'h264') || !info.streams?.some((stream: { codec_name: string }) => stream.codec_name === 'aac')) {
      throw new TgCallsError('MP4 is missing H264/AAC streams');
    }
    segment.status = segment.frames ? 'saved' : 'empty';
  }
  private async manifest(): Promise<void> {
    const value = { version: 1, state: this.state, handle: this.options.handle.toString(), startedAt: this.startedAt, sampleRate: this.sampleRate, channels: this.channels,
      timeline: 'PCM sample count per SSRC; video uses local monotonic arrival time, never native A/V timestamp equality',
      segments: this.segments.map(({ file: _file, audioFile: _audioFile, lastFrame: _lastFrame, ...segment }) => ({ ...segment, peer: { kind: segment.peer.kind, id: segment.peer.id.toString() }, error: segment.error?.message })),
      droppedFrames: this.droppedFrames,
      errors: this.failures.map((error) => error.message),
    };
    const temp = join(this.path, 'manifest.json.next');
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, join(this.path, 'manifest.json'));
  }
}
