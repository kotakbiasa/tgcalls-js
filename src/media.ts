/**
 * Media source helpers: build ntgcalls AudioDescription input for a given
 * AudioSource, and resolve YouTube/other sites to a direct audio URL via yt-dlp.
 */

import { spawn } from 'child_process';
import { MediaSource } from 'ntgcalls';
import type { AudioSource, TgCallsOptions, VideoOptions } from './types.js';

/** Build the shell command that pipes decoded s16le PCM to stdout. */
export function pcmCommand(source: AudioSource, opts: TgCallsOptions): string {
  const ffmpeg = opts.ffmpegPath ?? 'ffmpeg';
  switch (source.kind) {
    case 'file':
      return `${ffmpeg} -vn -i ${shellQuote(source.path)} -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1`;
    case 'url':
      return `${ffmpeg} -vn -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i ${shellQuote(source.audioUrl ?? source.url)} -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1`;
    case 'shell':
      return source.command;
  }
}

/** Build the ntgcalls microphone description (SHELL source, PCM via ffmpeg). */
export function audioDescription(source: AudioSource, opts: TgCallsOptions) {
  return {
    mediaSource: MediaSource.SHELL,
    input: pcmCommand(source, opts),
    sampleRate: 48000,
    channelCount: 2,
    keepOpen: false,
  };
}

/**
 * Probe a video file or direct URL to extract original dimensions and frame rate,
 * calculating proportional target dimensions (even integers for YUV420p).
 * Matches pytgcalls ffmpeg.py check_stream behavior.
 */
export async function probeVideo(
  filePathOrUrl: string,
  opts: TgCallsOptions = { client: {} as never },
  target: VideoOptions = {},
): Promise<{ width: number; height: number; fps: number }> {
  const ffprobe = opts.ffprobePath ?? 'ffprobe';
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'stream=width,height,r_frame_rate,codec_type',
      '-of', 'json',
      filePathOrUrl,
    ];
    const proc = spawn(ffprobe, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });

    const fallback = () => {
      const w = target.width ?? 1280;
      const h = target.height ?? 720;
      const fps = target.fps ?? 30;
      resolve({
        width: w % 2 !== 0 ? w - 1 : w,
        height: h % 2 !== 0 ? h - 1 : h,
        fps,
      });
    };

    const timer = setTimeout(() => {
      proc.kill();
      fallback();
    }, 7000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return fallback();
      }
      try {
        const data = JSON.parse(out) as {
          streams?: Array<{
            codec_type?: string;
            width?: number;
            height?: number;
            r_frame_rate?: string;
          }>;
        };
        const vStream = data.streams?.find((s) => s.codec_type === 'video');
        if (!vStream || !vStream.width || !vStream.height) {
          return fallback();
        }

        const origW = Number(vStream.width);
        const origH = Number(vStream.height);
        const maxW = target.width ?? 1280;
        const maxH = target.height ?? 720;
        const ratio = origW / origH;

        let newW = Math.min(origW, maxW);
        let newH = Math.floor(newW / ratio);

        if (newH > maxH && target.adjustByHeight !== false) {
          newH = maxH;
          newW = Math.floor(newH * ratio);
        }

        // Even dimensions required for YUV420p
        newW = newW % 2 !== 0 ? newW - 1 : newW;
        newH = newH % 2 !== 0 ? newH - 1 : newH;

        let fps = target.fps ?? 30;
        if (!target.fps && vStream.r_frame_rate && typeof vStream.r_frame_rate === 'string') {
          const parts = vStream.r_frame_rate.split('/');
          if (parts.length === 2 && Number(parts[1]) > 0) {
            const parsedFps = Math.round(Number(parts[0]) / Number(parts[1]));
            if (parsedFps > 0 && parsedFps <= 30) {
              fps = parsedFps;
            }
          }
        }
        resolve({ width: newW, height: newH, fps });
      } catch {
        fallback();
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      fallback();
    });
  });
}

/**
 * Build the ntgcalls camera/screen description using PyTgCalls' raw yuv420p
 * FFmpeg pipeline.
 */
export function videoDescription(
  source: Exclude<AudioSource, { kind: 'shell' }>,
  video: VideoOptions,
  opts: TgCallsOptions,
) {
  const ffmpeg = opts.ffmpegPath ?? 'ffmpeg';
  const width = video.width ? (video.width % 2 !== 0 ? video.width - 1 : video.width) : 1280;
  const height = video.height ? (video.height % 2 !== 0 ? video.height - 1 : video.height) : 720;
  const fps = video.fps ?? 30;
  const scaleFilter = `scale=${width}:${height}:flags=bicubic,format=yuv420p`;
  let input: string;
  if (source.kind === 'file') {
    input = `${ffmpeg} -an -i ${shellQuote(source.path)} -loglevel panic -f rawvideo -r ${fps} -pix_fmt yuv420p -vf ${scaleFilter} pipe:1`;
  } else {
    input = `${ffmpeg} -an -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i ${shellQuote(source.url)} -loglevel panic -f rawvideo -r ${fps} -pix_fmt yuv420p -vf ${scaleFilter} pipe:1`;
  }
  return {
    mediaSource: MediaSource.SHELL,
    input,
    width,
    height,
    fps,
    keepOpen: false,
  };
}

function shellQuote(s: string): string {
  if (process.platform === 'win32') {
    return `"${s.replace(/"/g, '')}"`;
  }
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) {
    return s;
  }
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * Resolve a YouTube (or any yt-dlp-supported) link to a direct audio URL.
 * Returns null when yt-dlp fails or is missing.
 */
export async function resolveYouTube(
  url: string,
  opts: TgCallsOptions,
  video = false,
): Promise<string | null> {
  const bin = opts.ytDlpPath ?? 'yt-dlp';
  const format = video
    ? 'best[height<=720]/bestvideo[height<=720]+bestaudio/best'
    : 'bestaudio/best';
  return new Promise((resolve) => {
    const proc = spawn(bin, [
      '-f', format,
      '--no-playlist',
      '-g',
      '--',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(null);
    }, 20_000);

    proc.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      if (code === 0 && lines.length > 0) {
        resolve(lines[lines.length - 1]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Resolve a YouTube (or any yt-dlp-supported) link for VIDEO playback.
 *
 * Mirrors pytgcalls' YtDlp.extract(): separate video + audio streams
 * (`bestvideo[vcodec~="(vp09|avc1)"]+m4a/best`) sorted toward `maxHeight`
 * (`-S res:N`). Restricting to vp09/avc1 avoids AV1, which is very heavy to
 * decode in real time on a small VPS. Unlike resolveYouTube(), the picture is
 * not stuck at the low-res pre-merged `best` format. `-g` prints one URL per
 * stream: line 1 = video, line 2 = audio. When only one URL comes back (a
 * single combined format) `audioUrl` is omitted and `url` carries both.
 */
export async function resolveYouTubeStreams(
  url: string,
  opts: TgCallsOptions,
  maxHeight = 720,
): Promise<{ url: string; audioUrl?: string } | null> {
  const bin = opts.ytDlpPath ?? 'yt-dlp';
  const format = 'bestvideo[vcodec~="(vp09|avc1)"]+m4a/best';
  return new Promise((resolve) => {
    const proc = spawn(bin, [
      '-f', format,
      '-S', `res:${maxHeight}`,
      '--no-playlist',
      '--no-warnings',
      '-g',
      '--',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(null);
    }, 20_000);

    proc.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      if (code !== 0 || lines.length === 0) {
        resolve(null);
      } else if (lines.length >= 2) {
        resolve({ url: lines[0], audioUrl: lines[1] });
      } else {
        resolve({ url: lines[0] });
      }
    });
  });
}
