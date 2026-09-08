/**
 * tgcalls-js — shared types.
 */

/** Reference to a chat: username, t.me link, raw id, or marked id (-100...). */
export type ChatRef = string | number | bigint;

/**
 * Minimal MTProto client surface (GramJS / teleproto both satisfy this).
 * We only rely on invoke + getEntity + addEventHandler/removeEventHandler.
 */
export interface MTProtoLike {
  invoke(request: unknown): Promise<unknown>;
  getEntity?(ref: unknown): Promise<unknown>;
  addEventHandler?(cb: (update: unknown) => void, opts?: unknown): unknown;
  removeEventHandler?(cb: unknown, opts?: unknown): void;
}

/** Audio source for streaming into a call. */
export type AudioSource =
  /** Local audio/video file (any ffmpeg-readable format). */
  | { kind: 'file'; path: string }
  /** Direct media URL readable by ffmpeg (http/https, m3u8, etc). */
  | { kind: 'url'; url: string }
  /** Full custom shell command that pipes s16le PCM 48k stereo to stdout. */
  | { kind: 'shell'; command: string };

/** Video stream parameters. */
export interface VideoOptions {
  /** Output width in pixels (default 1280). */
  width?: number;
  /** Output height in pixels (default 720). */
  height?: number;
  /** Frames per second (default 24). */
  fps?: number;
}

export interface JoinOptions {
  /** Join with the microphone muted (default false). */
  muted?: boolean;
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
  /** MTProto client (GramJS / teleproto TelegramClient). */
  client: MTProtoLike;
  /** Override TL namespace detection — normally auto-loaded from teleproto or telegram. */
  Api?: unknown;
  /** ffmpeg binary (default "ffmpeg"). */
  ffmpegPath?: string;
  /** yt-dlp binary for joinYouTube() (default "yt-dlp"). */
  ytDlpPath?: string;
}

export interface StreamEndInfo {
  chatId: bigint;
  /** The audio source that finished (null if unknown). */
  source: AudioSource | null;
  /** True when no user streamEnd handler is registered and the client will auto-leave. */
  willAutoLeave: boolean;
}
