/**
 * Real-time external PCM audio & I420 video frame bridge for Voice AI agents
 * and live media pipelines on top of ntgcalls MediaSource.EXTERNAL.
 */

import { StreamDevice, type Frame, type FrameData, type NTgCalls } from 'ntgcalls';
import { TgCallsError } from './errors.js';
import { normalizeSsrc, type PeerIdentity } from './participants.js';

export interface ExternalAudioFrame {
  /** Unsigned 32-bit SSRC (0 for P2P calls). */
  ssrc: number;
  /** Raw signed 16-bit little-endian PCM bytes. */
  pcm: Buffer;
  /** Sample rate of `pcm` in Hz (after optional resampling). */
  sampleRate: number;
  /** Channel count of `pcm` (1 or 2, after optional conversion). */
  channels: 1 | 2;
  /** Normalized RMS amplitude (0..1) of `pcm`. */
  rms: number;
  /** Capture timestamp in milliseconds reported by ntgcalls. */
  timestampMs: bigint;
  /** Attributed participant identity when available (group calls with participant tracking). */
  peer?: PeerIdentity;
}

export interface ExternalAudioSinkOptions {
  /** Native PLAYBACK sample rate requested from ntgcalls (default 48000). */
  sampleRate?: number;
  /** Native PLAYBACK channel count requested from ntgcalls (1 mono or 2 stereo, default 1). */
  channels?: 1 | 2;
  /**
   * Optional output sample rate to automatically resample incoming frames to
   * (e.g. 16000 for Gemini Live / Whisper STT). Defaults to `sampleRate`.
   */
  targetSampleRate?: number;
  /** Optional output channel count (1 or 2). Defaults to `channels`. */
  targetChannels?: 1 | 2;
}

export interface ExternalVideoFrame {
  /** Unsigned 32-bit SSRC (0 for P2P calls). */
  ssrc: number;
  /** Video source device ('camera' or 'screen'). */
  device: 'camera' | 'screen';
  /** Raw planar YUV420p (I420) bytes (`width * height * 3 / 2`). */
  i420: Buffer;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  timestampMs: bigint;
  peer?: PeerIdentity;
}

export interface ExternalVideoSinkOptions {
  /** Which video devices to subscribe to (default 'both'). */
  device?: 'camera' | 'screen' | 'both';
  /** Hint width for ntgcalls EXTERNAL playback sink (default 1280). */
  width?: number;
  /** Hint height for ntgcalls EXTERNAL playback sink (default 720). */
  height?: number;
  /** Hint fps for ntgcalls EXTERNAL playback sink (default 25). */
  fps?: number;
}

export interface PushAudioOptions {
  /** Target capture device (default 'microphone'). */
  device?: 'microphone' | 'speaker';
  /** Capture timestamp in ms (default BigInt(Date.now())). */
  timestampMs?: bigint;
  /** Target capture sample rate configured on the call (default 48000). */
  sampleRate?: number;
  /** Target capture channel count configured on the call (default 1). */
  channels?: 1 | 2;
  /**
   * Input sample rate of the provided `pcm` buffer (e.g. 24000 for Gemini Live
   * or OpenAI Realtime TTS output). When different from `sampleRate`, `pcm` is
   * automatically resampled before pushing.
   */
  inputSampleRate?: number;
  /** Input channel count of `pcm` (1 or 2). Defaults to `channels`. */
  inputChannels?: 1 | 2;
  /**
   * Slice arbitrary-length PCM buffers into 10ms WebRTC frames
   * ((sampleRate / 100) * channels * 2 bytes). Default true.
   */
  chunk10ms?: boolean;
  /**
   * Queue 10ms frames into the per-call paced sender so long TTS responses can
   * be interrupted mid-speech via `client.interruptAudio(chat)`. Default false.
   */
  paced?: boolean;
  /** Interval in ms between paced 10ms frames (default 10; set 0 in tests for immediate drain). */
  paceIntervalMs?: number;
}

export interface PushVideoOptions {
  width: number;
  height: number;
  /** Target capture device (default 'camera'). */
  device?: 'camera' | 'screen';
  /** Video rotation in degrees (default 0). */
  rotation?: 0 | 90 | 180 | 270;
  /** Capture timestamp in ms (default BigInt(Date.now())). */
  timestampMs?: bigint;
}

export interface VoiceActivityEvent {
  type: 'speechStart' | 'speechEnd';
  ssrc: number;
  rms: number;
  timestampMs: bigint;
  peer?: PeerIdentity;
}

export interface VoiceActivityOptions extends ExternalAudioSinkOptions {
  /** Normalized RMS threshold (0..1) above which a frame counts as speech (default 0.015). */
  thresholdRms?: number;
  /** Consecutive speech frames required to trigger `speechStart` (default 3). */
  speechFrames?: number;
  /** Consecutive silent frames required to trigger `speechEnd` (default 15). */
  silenceFrames?: number;
  /**
   * Automatically call `interruptAudio(chat)` (barge-in) when `speechStart`
   * fires. Default false.
   */
  autoInterrupt?: boolean;
}

export interface InterruptAudioResult {
  droppedFrames: number;
  droppedBytes: number;
}

export interface ExternalFrameNativePort {
  sendExternalFrame(
    chatId: bigint,
    device: StreamDevice,
    data: Buffer,
    frameData: FrameData,
  ): Promise<void>;
}

const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

/** Compute normalized RMS amplitude (0..1) of a signed 16-bit little-endian PCM buffer. */
export function computePcmRms(pcm: Uint8Array): number {
  const samples = Math.floor(pcm.byteLength / 2);
  if (samples <= 0) {return 0;}
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    const s = view.getInt16(i * 2, true) / 32768;
    sumSq += s * s;
  }
  return Math.min(1, Math.sqrt(sumSq / samples));
}

/**
 * Pure-JS signed 16-bit little-endian (`s16le`) PCM resampler and channel
 * converter (e.g. 16 kHz / 24 kHz <-> 48 kHz, mono <-> stereo).
 */
export function resamplePcmS16le(
  pcm: Uint8Array,
  fromRate: number,
  toRate: number,
  fromChannels: 1 | 2 = 1,
  toChannels: 1 | 2 = fromChannels,
): Buffer {
  if (!Number.isInteger(fromRate) || fromRate <= 0 || !Number.isInteger(toRate) || toRate <= 0) {
    throw new TgCallsError('Sample rates must be positive integers');
  }
  if ((fromChannels !== 1 && fromChannels !== 2) || (toChannels !== 1 && toChannels !== 2)) {
    throw new TgCallsError('Channels must be 1 or 2');
  }
  const frameStride = fromChannels * 2;
  if (pcm.byteLength % frameStride !== 0) {
    throw new TgCallsError(`PCM byteLength (${pcm.byteLength}) must be aligned to ${frameStride} bytes`);
  }
  if (fromRate === toRate && fromChannels === toChannels) {
    return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  }
  const inFrames = pcm.byteLength / frameStride;
  if (inFrames === 0) {return Buffer.alloc(0);}

  const inView = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const outFrames = Math.max(1, Math.round((inFrames * toRate) / fromRate));
  const out = Buffer.allocUnsafe(outFrames * toChannels * 2);
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const ratio = fromRate / toRate;

  const readChannelSample = (frameIdx: number, ch: number): number => {
    const clamped = Math.max(0, Math.min(inFrames - 1, frameIdx));
    if (fromChannels === 1) {
      return inView.getInt16(clamped * 2, true);
    }
    if (toChannels === 1) {
      const l = inView.getInt16(clamped * 4, true);
      const r = inView.getInt16(clamped * 4 + 2, true);
      return Math.round((l + r) / 2);
    }
    return inView.getInt16(clamped * 4 + ch * 2, true);
  };

  for (let i = 0; i < outFrames; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.floor(srcPos);
    const frac = srcPos - idx0;
    const idx1 = Math.min(inFrames - 1, idx0 + 1);

    for (let ch = 0; ch < toChannels; ch++) {
      let sample: number;
      if (ratio > 1.0 && idx1 > idx0) {
        // Box-filter averaging when downsampling to prevent aliasing
        const end = Math.min(inFrames, Math.ceil((i + 1) * ratio));
        let acc = 0;
        let count = 0;
        for (let k = idx0; k < end; k++) {
          acc += readChannelSample(k, ch);
          count++;
        }
        sample = count > 0 ? Math.round(acc / count) : readChannelSample(idx0, ch);
      } else {
        const s0 = readChannelSample(idx0, ch);
        const s1 = readChannelSample(idx1, ch);
        sample = Math.round(s0 + (s1 - s0) * frac);
      }
      const clamped = Math.max(-32768, Math.min(32767, sample));
      outView.setInt16((i * toChannels + ch) * 2, clamped, true);
    }
  }
  return out;
}

/**
 * Convert a raw planar YUV420p (I420) frame to an uncompressed 24-bit RGB BMP
 * Buffer (zero external dependencies — ready for vision/multimodal APIs).
 */
export function i420ToBmp(i420: Uint8Array, width: number, height: number): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0) {
    throw new TgCallsError('I420 width and height must be positive even integers');
  }
  const expected = (width * height * 3) / 2;
  if (!(i420 instanceof Uint8Array) || i420.byteLength !== expected) {
    throw new TgCallsError(`I420 byteLength must be ${expected} bytes for ${width}x${height}`);
  }
  const rowStride = (width * 3 + 3) & ~3;
  const pixelBytes = rowStride * height;
  const fileSize = 54 + pixelBytes;
  const bmp = Buffer.alloc(fileSize);

  // BMP Header (14 bytes) + DIB BITMAPINFOHEADER (40 bytes, top-down via negative height)
  bmp.write('BM', 0, 'ascii');
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(-height, 22); // top-down image
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(pixelBytes, 34);

  const yPlane = 0;
  const uPlane = width * height;
  const vPlane = uPlane + (width * height) / 4;
  const halfW = width >> 1;

  for (let y = 0; y < height; y++) {
    const rowOff = 54 + y * rowStride;
    const yRow = yPlane + y * width;
    const uvRow = (y >> 1) * halfW;
    for (let x = 0; x < width; x++) {
      const Y = i420[yRow + x]!;
      const uvIdx = uvRow + (x >> 1);
      const U = i420[uPlane + uvIdx]! - 128;
      const V = i420[vPlane + uvIdx]! - 128;

      const c = Math.max(0, Y - 16) * 298;
      const r = Math.max(0, Math.min(255, (c + 409 * V + 128) >> 8));
      const g = Math.max(0, Math.min(255, (c - 100 * U - 208 * V + 128) >> 8));
      const b = Math.max(0, Math.min(255, (c + 516 * U + 128) >> 8));

      const px = rowOff + x * 3;
      bmp[px] = b;
      bmp[px + 1] = g;
      bmp[px + 2] = r;
    }
  }
  return bmp;
}

/**
 * Per-call paced 10ms outbound audio frame queue supporting instant barge-in
 * interruption (`interrupt()`).
 */
export class PacedAudioQueue {
  private readonly queue: Array<{ device: StreamDevice; chunk: Uint8Array; intervalMs: number }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining = false;
  private nextTimestampMs = 0n;

  constructor(
    private readonly native: Pick<NTgCalls, 'sendExternalFrame'> | ExternalFrameNativePort,
    private readonly nativeId: bigint,
  ) {}

  get pendingFrames(): number {
    return this.queue.length;
  }

  enqueue(chunks: Uint8Array[], device: StreamDevice, intervalMs = 10): Promise<void> {
    for (const chunk of chunks) {
      this.queue.push({ device, chunk, intervalMs });
    }
    this.scheduleDrain();
    return Promise.resolve();
  }

  /** Clear all queued unplayed audio frames immediately (barge-in). */
  interrupt(): InterruptAudioResult {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const droppedFrames = this.queue.length;
    let droppedBytes = 0;
    for (const item of this.queue) {
      droppedBytes += item.chunk.byteLength;
    }
    this.queue.length = 0;
    this.draining = false;
    return { droppedFrames, droppedBytes };
  }

  private scheduleDrain(): void {
    if (this.draining || this.queue.length === 0) {return;}
    this.draining = true;
    const step = async () => {
      const next = this.queue.shift();
      if (!next) {
        this.draining = false;
        this.timer = null;
        return;
      }
      const now = BigInt(Date.now());
      this.nextTimestampMs = this.nextTimestampMs >= now ? this.nextTimestampMs + 10n : now;
      const fd: FrameData = {
        absoluteCaptureTimestampMs: this.nextTimestampMs,
        rotation: 0 as never,
        width: 0,
        height: 0,
      };
      try {
        await this.native.sendExternalFrame(
          this.nativeId,
          next.device,
          Array.from(next.chunk) as unknown as Buffer,
          fd,
        );
      } catch {
        /* ignore frame error if call closed mid-drain */
      }
      if (!this.draining || this.queue.length === 0) {
        this.draining = false;
        this.timer = null;
        return;
      }
      if (next.intervalMs <= 0) {
        void step();
      } else {
        this.timer = setTimeout(() => { void step(); }, next.intervalMs);
      }
    };
    void step();
  }
}

/** Slice a raw s16le PCM buffer into 10ms WebRTC chunks (zero-padding the tail frame). */
export function slicePcm10ms(pcm: Uint8Array, sampleRate = 48000, channels: 1 | 2 = 1): Uint8Array[] {
  const frameBytes = Math.floor((sampleRate / 100) * channels * 2);
  const out: Uint8Array[] = [];
  for (let offset = 0; offset < pcm.byteLength; offset += frameBytes) {
    const slice = pcm.subarray(offset, Math.min(offset + frameBytes, pcm.byteLength));
    if (slice.byteLength < frameBytes) {
      const padded = new Uint8Array(frameBytes);
      padded.set(slice);
      out.push(padded);
    } else {
      out.push(slice);
    }
  }
  return out;
}

/**
 * Push signed 16-bit little-endian PCM bytes into an active EXTERNAL capture
 * stream. Handles resampling, the ntgcalls JS-array N-API boundary, optional
 * 10ms slicing, and optional paced queueing for barge-in interruption.
 */
export async function pushExternalAudioFrame(
  native: Pick<NTgCalls, 'sendExternalFrame'> | ExternalFrameNativePort,
  nativeId: bigint,
  pcm: Uint8Array,
  options: PushAudioOptions = {},
  pacedQueue?: PacedAudioQueue,
): Promise<void> {
  if (!(pcm instanceof Uint8Array) || pcm.byteLength === 0) {
    throw new TgCallsError('PCM audio buffer must be a non-empty Uint8Array');
  }
  const sampleRate = options.sampleRate ?? 48000;
  const channels = options.channels ?? 1;
  const inputSampleRate = options.inputSampleRate ?? sampleRate;
  const inputChannels = options.inputChannels ?? channels;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || !Number.isInteger(inputSampleRate) || inputSampleRate <= 0) {
    throw new TgCallsError('sampleRate must be a positive integer');
  }
  if ((channels !== 1 && channels !== 2) || (inputChannels !== 1 && inputChannels !== 2)) {
    throw new TgCallsError('channels must be 1 or 2');
  }
  const inputAlignment = inputChannels * 2;
  if (pcm.byteLength % inputAlignment !== 0) {
    throw new TgCallsError(`PCM byteLength (${pcm.byteLength}) must be aligned to ${inputAlignment} bytes (s16le * channels)`);
  }

  const targetPcm = (inputSampleRate !== sampleRate || inputChannels !== channels)
    ? resamplePcmS16le(pcm, inputSampleRate, sampleRate, inputChannels, channels)
    : pcm;

  const device = options.device === 'speaker' ? StreamDevice.SPEAKER : StreamDevice.MICROPHONE;
  const baseTs = options.timestampMs ?? BigInt(Date.now());
  const chunk10ms = options.chunk10ms !== false;
  const frameBytes = Math.floor((sampleRate / 100) * channels * 2);

  if (options.paced && pacedQueue) {
    const chunks = chunk10ms ? slicePcm10ms(targetPcm, sampleRate, channels) : [targetPcm];
    await pacedQueue.enqueue(chunks, device, options.paceIntervalMs ?? 10);
    return;
  }

  if (!chunk10ms || targetPcm.byteLength <= frameBytes) {
    const fd: FrameData = {
      absoluteCaptureTimestampMs: baseTs,
      rotation: 0 as never,
      width: 0,
      height: 0,
    };
    await native.sendExternalFrame(nativeId, device, Array.from(targetPcm) as unknown as Buffer, fd);
    return;
  }

  const chunks = slicePcm10ms(targetPcm, sampleRate, channels);
  let frameIndex = 0n;
  for (const chunk of chunks) {
    const fd: FrameData = {
      absoluteCaptureTimestampMs: baseTs + frameIndex * 10n,
      rotation: 0 as never,
      width: 0,
      height: 0,
    };
    await native.sendExternalFrame(nativeId, device, Array.from(chunk) as unknown as Buffer, fd);
    frameIndex++;
  }
}

/**
 * Push a raw planar YUV420p (I420) video frame into an active EXTERNAL camera
 * or screen capture stream.
 */
export async function pushExternalVideoFrame(
  native: Pick<NTgCalls, 'sendExternalFrame'> | ExternalFrameNativePort,
  nativeId: bigint,
  i420: Uint8Array,
  options: PushVideoOptions,
): Promise<void> {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0) {
    throw new TgCallsError('I420 video width and height must be positive even integers');
  }
  const expected = (width * height * 3) / 2;
  if (!(i420 instanceof Uint8Array) || i420.byteLength !== expected) {
    throw new TgCallsError(`I420 frame byteLength must be ${expected} bytes for ${width}x${height}`);
  }
  const rotation = options.rotation ?? 0;
  if (!VALID_ROTATIONS.has(rotation)) {
    throw new TgCallsError('Video rotation must be 0, 90, 180, or 270');
  }
  const device = options.device === 'screen' ? StreamDevice.SCREEN : StreamDevice.CAMERA;
  const fd: FrameData = {
    absoluteCaptureTimestampMs: options.timestampMs ?? BigInt(Date.now()),
    rotation: rotation as never,
    width,
    height,
  };
  await native.sendExternalFrame(nativeId, device, Array.from(i420) as unknown as Buffer, fd);
}

/** Normalize raw ntgcalls PLAYBACK microphone frames into ExternalAudioFrame items. */
export function normalizeIncomingAudioFrames(
  frames: Frame[],
  lookupPeer?: (ssrc: number) => PeerIdentity | undefined,
  options: { sampleRate?: number; channels?: 1 | 2; targetSampleRate?: number; targetChannels?: 1 | 2 } = {},
): ExternalAudioFrame[] {
  const inRate = options.sampleRate ?? 48000;
  const inChannels = options.channels ?? 1;
  const outRate = options.targetSampleRate ?? inRate;
  const outChannels = options.targetChannels ?? inChannels;
  const out: ExternalAudioFrame[] = [];
  for (const frame of frames ?? []) {
    if (!frame?.data || frame.data.length === 0) {continue;}
    const ssrc = frame.ssrc === undefined ? 0 : normalizeSsrc(frame.ssrc);
    const peer = ssrc > 0 ? lookupPeer?.(ssrc) : undefined;
    const rawBuf = Buffer.from(frame.data);
    const pcm = (inRate !== outRate || inChannels !== outChannels)
      ? resamplePcmS16le(rawBuf, inRate, outRate, inChannels, outChannels)
      : rawBuf;
    out.push({
      ssrc,
      pcm,
      sampleRate: outRate,
      channels: outChannels,
      rms: computePcmRms(pcm),
      timestampMs: typeof frame.frameData?.absoluteCaptureTimestampMs === 'bigint'
        ? frame.frameData.absoluteCaptureTimestampMs
        : BigInt(frame.frameData?.absoluteCaptureTimestampMs ?? 0),
      ...(peer ? { peer } : {}),
    });
  }
  return out;
}

/** Normalize raw ntgcalls PLAYBACK camera/screen frames into ExternalVideoFrame items. */
export function normalizeIncomingVideoFrames(
  device: 'camera' | 'screen',
  frames: Frame[],
  lookupPeer?: (ssrc: number, dev: 'camera' | 'screen') => PeerIdentity | undefined,
): ExternalVideoFrame[] {
  const out: ExternalVideoFrame[] = [];
  for (const frame of frames ?? []) {
    if (!frame?.data || frame.data.length === 0) {continue;}
    const width = Number(frame.frameData?.width ?? 0);
    const height = Number(frame.frameData?.height ?? 0);
    if (width <= 0 || height <= 0) {continue;}
    const rawRotation = Number(frame.frameData?.rotation ?? 0);
    const rotation = (VALID_ROTATIONS.has(rawRotation) ? rawRotation : 0) as 0 | 90 | 180 | 270;
    const ssrc = frame.ssrc === undefined ? 0 : normalizeSsrc(frame.ssrc);
    const peer = ssrc > 0 ? lookupPeer?.(ssrc, device) : undefined;
    out.push({
      ssrc,
      device,
      i420: Buffer.from(frame.data),
      width,
      height,
      rotation,
      timestampMs: typeof frame.frameData?.absoluteCaptureTimestampMs === 'bigint'
        ? frame.frameData.absoluteCaptureTimestampMs
        : BigInt(frame.frameData?.absoluteCaptureTimestampMs ?? 0),
      ...(peer ? { peer } : {}),
    });
  }
  return out;
}
