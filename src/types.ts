/**
 * tgcalls-js — shared types.
 */

import type { PeerIdentity } from './participants.js';
import type { StreamDevice, StreamStatus } from 'ntgcalls';
import type { ResumeControllerOptions, StateStoreOptions } from './persistence.js';

/** Reference to a chat: username, t.me link, raw id, or marked id (-100...). */
export type ChatRef = string | number | bigint;

/** A remote participant's stream state, as reported by ntgcalls. */
export interface RemoteSourceInfo {
  ssrc: number;
  state: StreamStatus;
  device: StreamDevice;
  peer?: PeerIdentity;
  endpoint?: string;
  origin?: 'mtproto' | 'native';
}

/**
 * Minimal MTProto client surface (GramJS / teleproto both satisfy this).
 * We only rely on invoke + getEntity + addEventHandler/removeEventHandler.
 */
export interface MTProtoLike {
  invoke(request: unknown): Promise<unknown>;
  getEntity?(ref: unknown): Promise<unknown>;
  getMe?(): Promise<unknown>;
  addEventHandler?(cb: (update: unknown) => void, opts?: unknown): unknown;
  removeEventHandler?(cb: unknown, opts?: unknown): void;
}

export type { MtcuteLike, MTProtoAdapter } from './adapters/types.js';
import type { MtcuteLike, MTProtoAdapter } from './adapters/types.js';


/** Audio source for streaming into a call. */
export type AudioSource =
  /** Local audio/video file (any ffmpeg-readable format). */
  | { kind: 'file'; path: string }
  /**
   * Direct media URL readable by ffmpeg (http/https, m3u8, etc).
   * `audioUrl` (optional): separate audio-only URL, used when video and audio
   * come as two streams (e.g. yt-dlp bestvideo+bestaudio). `url` is then the video.
   */
  | { kind: 'url'; url: string; audioUrl?: string }
  /** Full custom shell command that pipes s16le PCM 48k stereo to stdout. */
  | { kind: 'shell'; command: string }
  /**
   * Real-time programmatic PCM audio source (ntgcalls MediaSource.EXTERNAL).
   * Feed PCM frames with `client.pushAudioFrame(chat, pcm)` — no ffmpeg required.
   */
  | { kind: 'external'; sampleRate?: number; channels?: 1 | 2; keepOpen?: boolean };

/** Video stream parameters. */
export interface VideoOptions {
  /** Output width in pixels (default 640 or auto-probed). */
  width?: number;
  /** Output height in pixels (default 360 or auto-probed). */
  height?: number;
  /** Frames per second (default 25 or auto-probed). */
  fps?: number;
  /** Adjust by height if computed height exceeds max (default true, matching pytgcalls). */
  adjustByHeight?: boolean;
}

/** Predefined video quality profiles matching pytgcalls. */
export const VideoQuality = {
  UHD_4K: { width: 3840, height: 2160, fps: 60 },
  QHD_2K: { width: 2560, height: 1440, fps: 60 },
  FHD_1080p: { width: 1920, height: 1080, fps: 60 },
  HD_720p: { width: 1280, height: 720, fps: 30 },
  SD_480p: { width: 854, height: 480, fps: 30 },
  SD_360p: { width: 640, height: 360, fps: 30 },
} as const;

export interface JoinOptions {
  /** Join with the microphone muted (default false). */
  muted?: boolean;
  /** Join with capture paused before the transport is connected. */
  paused?: boolean;
  /** Automatically leave the call when the audio stream ends (default true). */
  autoLeave?: boolean;
  /** Start a new voice chat if the chat has none (requires admin rights; default false). */
  allowCreate?: boolean;
  /** Invite hash when joining via a call invite link. */
  inviteHash?: string;
  /** Share video from the same source (file/url) with these parameters. */
  video?: VideoOptions | false;
  /** Join the presentation (screen share) channel for this call. */
  presentation?: boolean;
  /** Internal: whether to mark video as stopped in the TL join request. */
  videoStopped?: boolean;
}

export interface ActiveCall {
  /** Marked chat id (-100...) used as the ntgcalls handle. */
  chatId: bigint;
  /** Raw TL InputGroupCall instance (opaque; reused for leave()). */
  call: unknown;
  /** Our own audio SSRC (from the native join params; used by LeaveGroupCall). */
  ssrc: number;
  /** The audio source this call was started with. */
  source: AudioSource;
  /** True when the video camera channel is being shared from this client. */
  videoActive: boolean;
  /** True when the presentation (screen share) channel is active. */
  presentationActive: boolean;
  muted: boolean;
  autoLeave: boolean;
  joinedAt: number;
}

export interface JoinResult {
  chatId: bigint;
  call: unknown;
  ssrc: number;
}

export interface TgCallsOptions {
  /** MTProto client (GramJS / teleproto TelegramClient, mtcute TelegramClient, or custom MTProtoAdapter). */
  client: MTProtoLike | MtcuteLike | MTProtoAdapter;
  /** TL API namespace for this client. Pass per client when using telegram and teleproto together. */
  Api?: unknown;
  /** Opt-in desired group state file; no auto-join occurs during construction. */
  statePath?: string;
  persistence?: Pick<StateStoreOptions, 'allowShell' | 'maxBytes'>;
  restore?: ResumeControllerOptions;
  /** ffmpeg binary (default "ffmpeg"). */
  ffmpegPath?: string;
  /** ffprobe binary (default "ffprobe"). */
  ffprobePath?: string;
  /** yt-dlp binary for joinYouTube() (default "yt-dlp"). */
  ytDlpPath?: string;
  /**
   * Sink for internal library warnings (e.g. an event handler that threw).
   * Defaults to console.error; pass { error(){} } for silence, or your own
   * structured logger (e.g. pino: { error: pinoLogger.error }).
   */
  logger?: {
    error(...args: unknown[]): void;
  };
}

export interface StreamEndInfo {
  chatId: bigint;
  /** The audio source that finished (null if unknown). */
  source: AudioSource | null;
  /** True when no user streamEnd handler is registered and the client will auto-leave. */
  willAutoLeave: boolean;
}

/** Options for startRecording(). */
export interface RecordOptions {
  /** PCM sample rate ntgcalls resamples incoming audio to. Default 48000. */
  sampleRate?: number;
  /** PCM channel count (1 mono, 2 stereo). Default 1. */
  channels?: number;
}

export interface FolderRecordingTarget {
  dir: string;
  video?: boolean;
  sampleRate?: number;
  channels?: 1 | 2;
}

export interface RecordingStoppedInfo {
  path: string;
  peer?: PeerIdentity;
  device: 'microphone' | 'camera' | 'screen';
  segment: number;
  reason: string;
  status: 'saved' | 'empty' | 'failed';
  error?: Error;
}

/** State of an active recording (getRecording()). */
export interface RecordingInfo {
  mode?: 'mixed' | 'folder';
  dir?: string;
  video?: boolean;
  /** Output file path (container inferred from extension). */
  path: string;
  sampleRate: number;
  channels: number;
  /** Date.now() when recording started. */
  startedAt: number;
}
