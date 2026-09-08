/**
 * Media source helpers: build ntgcalls AudioDescription input for a given
 * AudioSource, and resolve YouTube/other sites to a direct audio URL via yt-dlp.
 */

import { spawn } from 'child_process';
import { MediaSource } from 'ntgcalls';
import type { AudioSource, TgCallsOptions } from './types.js';

/** Build the shell command that pipes decoded s16le PCM to stdout. */
export function pcmCommand(source: AudioSource, opts: TgCallsOptions): string {
  const ffmpeg = opts.ffmpegPath ?? 'ffmpeg';
  switch (source.kind) {
    case 'file':
      return `${ffmpeg} -i ${shellQuote(source.path)} -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1`;
    case 'url':
      return `${ffmpeg} -i ${shellQuote(source.url)} -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1`;
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

function shellQuote(s: string): string {
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
): Promise<string | null> {
  const bin = opts.ytDlpPath ?? 'yt-dlp';
  return new Promise((resolve) => {
    const proc = spawn(bin, [
      '-f', 'bestaudio/best',
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
