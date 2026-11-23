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
  /** Capture timestamp in milliseconds reported by ntgcalls. */
  timestampMs: bigint;
  /** Attributed participant identity when available (group calls with participant tracking). */
  peer?: PeerIdentity;
}

export interface ExternalAudioSinkOptions {
  /** PCM sample rate for incoming playback frames (default 48000). */
  sampleRate?: number;
  /** Channel count for incoming playback frames (1 mono or 2 stereo, default 1). */
  channels?: 1 | 2;
}

export interface PushAudioOptions {
  /** Target capture device (default 'microphone'). */
  device?: 'microphone' | 'speaker';
  /** Capture timestamp in ms (default BigInt(Date.now())). */
  timestampMs?: bigint;
  /** Sample rate used for 10ms frame slicing (default 48000). */
  sampleRate?: number;
  /** Channel count used for 10ms frame slicing (default 1). */
  channels?: 1 | 2;
  /**
   * Slice arbitrary-length PCM buffers into 10ms WebRTC frames
   * ((sampleRate / 100) * channels * 2 bytes). Default true.
   */
  chunk10ms?: boolean;
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

export interface ExternalFrameNativePort {
  sendExternalFrame(
    chatId: bigint,
    device: StreamDevice,
    data: Buffer,
    frameData: FrameData,
  ): Promise<void>;
}

const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

/**
 * Push signed 16-bit little-endian PCM bytes into an active EXTERNAL capture
 * stream. Handles the ntgcalls JS-array N-API boundary and optional 10ms slicing.
 */
export async function pushExternalAudioFrame(
  native: Pick<NTgCalls, 'sendExternalFrame'> | ExternalFrameNativePort,
  nativeId: bigint,
  pcm: Uint8Array,
  options: PushAudioOptions = {},
): Promise<void> {
  if (!(pcm instanceof Uint8Array) || pcm.byteLength === 0) {
    throw new TgCallsError('PCM audio buffer must be a non-empty Uint8Array');
  }
  const sampleRate = options.sampleRate ?? 48000;
  const channels = options.channels ?? 1;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new TgCallsError('sampleRate must be a positive integer');
  }
  if (channels !== 1 && channels !== 2) {
    throw new TgCallsError('channels must be 1 or 2');
  }
  const sampleAlignment = channels * 2;
  if (pcm.byteLength % sampleAlignment !== 0) {
    throw new TgCallsError(`PCM byteLength (${pcm.byteLength}) must be aligned to ${sampleAlignment} bytes (s16le * channels)`);
  }

  const device = options.device === 'speaker' ? StreamDevice.SPEAKER : StreamDevice.MICROPHONE;
  const baseTs = options.timestampMs ?? BigInt(Date.now());
  const chunk10ms = options.chunk10ms !== false;
  const frameBytes = Math.floor((sampleRate / 100) * channels * 2);

  if (!chunk10ms || pcm.byteLength <= frameBytes) {
    const fd: FrameData = {
      absoluteCaptureTimestampMs: baseTs,
      rotation: 0 as never,
      width: 0,
      height: 0,
    };
    await native.sendExternalFrame(nativeId, device, Array.from(pcm) as unknown as Buffer, fd);
    return;
  }

  let frameIndex = 0n;
  for (let offset = 0; offset < pcm.byteLength; offset += frameBytes) {
    const slice = pcm.subarray(offset, Math.min(offset + frameBytes, pcm.byteLength));
    let chunk: Uint8Array = slice;
    if (slice.byteLength < frameBytes) {
      const padded = new Uint8Array(frameBytes);
      padded.set(slice);
      chunk = padded;
    }
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
): ExternalAudioFrame[] {
  const out: ExternalAudioFrame[] = [];
  for (const frame of frames ?? []) {
    if (!frame?.data || frame.data.length === 0) {continue;}
    const ssrc = frame.ssrc === undefined ? 0 : normalizeSsrc(frame.ssrc);
    const peer = ssrc > 0 ? lookupPeer?.(ssrc) : undefined;
    out.push({
      ssrc,
      pcm: Buffer.from(frame.data),
      timestampMs: typeof frame.frameData?.absoluteCaptureTimestampMs === 'bigint'
        ? frame.frameData.absoluteCaptureTimestampMs
        : BigInt(frame.frameData?.absoluteCaptureTimestampMs ?? 0),
      ...(peer ? { peer } : {}),
    });
  }
  return out;
}
