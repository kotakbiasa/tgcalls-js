import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { TgCallsError } from './errors.js';
import type { AudioSource, VideoOptions } from './types.js';

export type RtmpPublisherState = 'ready' | 'starting' | 'publishing' | 'reconnecting' | 'paused' | 'stopped' | 'failed';
export interface RtmpPublisherOptions {
  ffmpegPath?: string;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  reconnect?: { maxAttempts: number; maxDelayMs: number; baseDelayMs?: number };
  onStateChange?: (state: RtmpPublisherState) => void;
  onError?: (error: RtmpPublisherError) => void;
  logger?: { error(...args: unknown[]): void };
  /** Injection seam for process tests; production uses spawn without a shell. */
  spawn?: (command: string, args: string[]) => ChildProcess;
}
export class RtmpPublisherError extends TgCallsError {}
interface Track { source: Exclude<AudioSource, { kind: 'shell' | 'external' }>; video?: VideoOptions }
interface Run {
  child: ChildProcess;
  done: Promise<void>;
  finished: boolean;
}
interface Pending {
  resolve(): void;
  reject(error: Error): void;
}

/** H.264/AAC -> FLV uploader. Reconnect restarts the current source from its beginning. */
export class RtmpPublisher {
  private status: RtmpPublisherState = 'ready';
  private readonly target: string;
  private readonly secrets: string[];
  private readonly options: RtmpPublisherOptions;
  private run?: Run;
  private terminating?: Promise<void>;
  private generation = 0;
  private closed = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private pending?: Pending;
  private current?: Track;
  private readonly tracks: Track[] = [];
  private holding?: Track;
  get state(): RtmpPublisherState { return this.status; }

  constructor(url: string, key: string, options: RtmpPublisherOptions = {}) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new RtmpPublisherError('Invalid RTMP URL'); }
    if (!['rtmp:', 'rtmps:'].includes(parsed.protocol) || !parsed.hostname || /[\r\n\0]/.test(url)) {
      throw new RtmpPublisherError('A valid RTMP or RTMPS URL is required');
    }
    if (!key || /[\r\n\0]/.test(key)) throw new RtmpPublisherError('Invalid RTMP stream key');
    if (parsed.hash) throw new RtmpPublisherError('RTMP URL must not contain a fragment');
    this.target = `${url.replace(/\/$/, '')}/${key}`;
    this.secrets = [this.target, key, encodeURIComponent(key)].sort((a, b) => b.length - a.length);
    this.options = { ...options, reconnect: options.reconnect && { ...options.reconnect } };
    positive(options.readyTimeoutMs ?? 15_000, 'readyTimeoutMs');
    positive(options.stopTimeoutMs ?? 2_000, 'stopTimeoutMs');
    if (options.reconnect) {
      const { maxAttempts, maxDelayMs, baseDelayMs = 250 } = options.reconnect;
      if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 100) throw new RtmpPublisherError('Invalid reconnect maxAttempts');
      positive(maxDelayMs, 'maxDelayMs'); positive(baseDelayMs, 'baseDelayMs');
    }
  }

  async play(source: AudioSource, video?: VideoOptions): Promise<void> {
    this.assertOpen();
    const track = this.validate(source, video);
    const generation = this.generation + 1;
    await this.halt(false);
    if (generation !== this.generation || this.closed) throw new RtmpPublisherError('RTMP publishing cancelled');
    return this.begin(track, generation);
  }

  /** Append without starting playback; returns the pending queue length. */
  queue(source: AudioSource, video?: VideoOptions): number {
    this.assertOpen();
    return this.tracks.push(this.validate(source, video));
  }
  /** Replace/clear the track repeated whenever the queue runs empty. */
  hold(source: AudioSource | null, video?: VideoOptions): void {
    this.assertOpen();
    this.holding = source === null ? undefined : this.validate(source, video);
  }
  async skip(): Promise<void> {
    this.assertOpen();
    const next = this.tracks.shift() ?? this.holding;
    const generation = this.generation + 1;
    await this.halt(false);
    if (generation !== this.generation || this.closed) throw new RtmpPublisherError('RTMP publishing cancelled');
    if (next) return this.begin(next, generation);
  }
  /** POSIX process suspension; the RTMP server may expire a long paused connection. */
  async pause(): Promise<boolean> {
    this.assertOpen();
    if (!this.run || this.status !== 'publishing') return false;
    if (process.platform === 'win32') throw new RtmpPublisherError('RTMP pause requires POSIX process signals');
    if (!this.run.child.kill('SIGSTOP')) return false;
    this.change('paused');
    return true;
  }
  async resume(): Promise<boolean> {
    this.assertOpen();
    if (!this.run || this.status !== 'paused') return false;
    if (!this.run.child.kill('SIGCONT')) return false;
    this.change('publishing');
    return true;
  }
  /** Cancel retries, clear playlist, terminate ffmpeg and wait for its exit. */
  async stop(): Promise<void> { await this.halt(true); }
  async close(): Promise<void> { this.closed = true; await this.halt(true); }

  private validate(source: AudioSource, video?: VideoOptions): Track {
    if (source.kind === 'shell' || source.kind === 'external') throw new RtmpPublisherError('RTMP requires a file or URL source; PCM shell/external sources have no video/container contract');
    const input = source.kind === 'file' ? source.path : source.url;
    if (!input || /[\0\r\n]/.test(input)) throw new RtmpPublisherError('Invalid RTMP media source');
    if (source.kind === 'url' && source.audioUrl !== undefined && (!source.audioUrl || /[\0\r\n]/.test(source.audioUrl))) throw new RtmpPublisherError('Invalid audio URL');
    if (video) {
      for (const field of ['width', 'height', 'fps'] as const) {
        const value = video[field];
        if (value !== undefined && (!Number.isFinite(value) || value <= 0 || (field !== 'fps' && (!Number.isInteger(value) || value < 2)))) {
          throw new RtmpPublisherError(`Invalid video ${field}`);
        }
      }
    }
    return { source: { ...source }, video: video && { ...video } };
  }
  private assertOpen(): void { if (this.closed) throw new RtmpPublisherError('RTMP publisher is closed'); }
  private redact(message: string): string {
    for (const secret of this.secrets) message = message.split(secret).join('[REDACTED]');
    return message.replace(/rtmps?:\/\/[^\s'"\]]+/gi, '[RTMP endpoint]');
  }
  private observe(action: () => void): void {
    try { action(); } catch (error) {
      (this.options.logger ?? console).error(new RtmpPublisherError(this.redact(String(error))));
    }
  }
  private change(state: RtmpPublisherState): void {
    if (this.status === state) return;
    this.status = state;
    this.observe(() => this.options.onStateChange?.(state));
  }
  private begin(track: Track, generation: number): Promise<void> {
    this.current = track;
    const ready = new Promise<void>((resolve, reject) => { this.pending = { resolve, reject }; });
    // Auto-advance has no external awaiter; keep errors observable via onError/logger.
    void ready.catch(() => {});
    this.launch(track, generation, 0);
    return ready;
  }
  private launch(track: Track, generation: number, attempts: number): void {
    if (generation !== this.generation || this.closed) return;
    this.change(attempts === 0 ? 'starting' : 'reconnecting');
    if (generation !== this.generation || this.closed) return;
    let child: ChildProcess;
    try {
      const args = this.arguments(track);
      child = this.options.spawn?.(this.options.ffmpegPath ?? 'ffmpeg', args)
        ?? nodeSpawn(this.options.ffmpegPath ?? 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { this.fail(new RtmpPublisherError(this.redact(`RTMP encoder could not start: ${String(error)}`))); return; }
    let finish!: () => void;
    const run: Run = { child, done: new Promise(resolve => { finish = resolve; }), finished: false };
    this.run = run;
    let stderr = '';
    let progress = '';
    let time = 0;
    let mediaReady = false;
    let startupError: Error | undefined;
    this.readyTimer = setTimeout(() => {
      if (generation !== this.generation || this.run !== run) return;
      startupError = new RtmpPublisherError('RTMP encoder readiness timeout');
      const pending = this.pending;
      this.pending = undefined;
      const expiredGeneration = this.generation + 1;
      // Wait for termination before exposing failure; stop may invalidate it meanwhile.
      void this.halt(false).then(() => {
        const error = expiredGeneration === this.generation && !this.closed
          ? startupError! : new RtmpPublisherError('RTMP publishing cancelled');
        if (expiredGeneration === this.generation && !this.closed) this.fail(error);
        pending?.reject(error);
      }, error => { this.fail(error); pending?.reject(error); });
    }, this.options.readyTimeoutMs ?? 15_000);
    child.stderr?.on('data', (bytes: Buffer) => {
      // Keep a bounded raw tail; redact only after chunks have been reassembled.
      stderr = (stderr + bytes.toString()).slice(-8192);
    });
    child.stdout?.on('data', (bytes: Buffer) => {
      progress = (progress + bytes.toString()).slice(-16384);
      const lines = progress.split(/\r?\n/);
      progress = lines.pop() ?? '';
      for (const line of lines) {
        const [field, value] = line.split('=');
        if (field === 'out_time_us' || field === 'out_time_ms') time = Number(value);
        if (field === 'progress' && time > 0 && generation === this.generation && this.run === run && !mediaReady) {
          mediaReady = true;
          clearTimeout(this.readyTimer);
          this.change('publishing');
          this.pending?.resolve(); this.pending = undefined;
        }
      }
    });
    const ended = (code: number | null, error?: Error) => {
      if (run.finished) return;
      run.finished = true; finish();
      if (generation !== this.generation || this.run !== run) return;
      clearTimeout(this.readyTimer); this.run = undefined;
      if (code === 0 && mediaReady && !error) {
        this.current = undefined;
        const next = this.tracks.shift() ?? this.holding;
        if (next) void this.begin(next, generation); else this.change('ready');
        return;
      }
      const failure = new RtmpPublisherError(this.redact(`RTMP encoder failed (${code}): ${error?.message ?? (stderr.trim() || 'no media progress')}`));
      const fatal = error !== undefined || /auth|denied|forbidden|unauthorized|invalid (?:key|stream)|no such file|invalid data|unknown encoder/i.test(stderr);
      const policy = this.options.reconnect;
      if (!fatal && policy && attempts < policy.maxAttempts) {
        this.change('reconnecting');
        const delay = Math.min(policy.maxDelayMs, (policy.baseDelayMs ?? 250) * 2 ** Math.min(attempts, 30));
        this.retryTimer = setTimeout(() => this.launch(track, generation, attempts + 1), delay);
      } else this.fail(failure);
    };
    child.once('error', error => ended(null, error));
    child.once('close', code => ended(code, startupError));
  }
  private fail(error: Error): void {
    const failure = new RtmpPublisherError(this.redact(error.message));
    this.change('failed');
    this.pending?.reject(failure); this.pending = undefined;
    this.observe(() => {
      if (this.options.onError) this.options.onError(failure);
      else (this.options.logger ?? console).error(failure);
    });
  }
  private arguments({ source, video }: Track): string[] {
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-re', '-i', source.kind === 'file' ? source.path : source.url];
    if (source.kind === 'url' && source.audioUrl) args.push('-re', '-i', source.audioUrl);
    args.push('-map', source.kind === 'url' && source.audioUrl ? '1:a:0' : '0:a:0', '-c:a', 'aac', '-ar', '48000', '-ac', '2');
    if (video) {
      const width = Math.floor((video.width ?? 640) / 2) * 2;
      const height = Math.floor((video.height ?? 360) / 2) * 2;
      const fps = video.fps ?? 25;
      args.push('-map', '0:v:0', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
        '-vf', `scale=${width}:${height}`, '-r', String(fps), '-g', String(Math.max(1, Math.round(fps * 2))));
    } else args.push('-vn');
    args.push('-progress', 'pipe:1', '-stats_period', '0.1', '-f', 'flv', this.target);
    return args;
  }
  private async halt(clearPlaylist: boolean): Promise<void> {
    ++this.generation;
    clearTimeout(this.retryTimer); clearTimeout(this.readyTimer);
    this.pending?.reject(new RtmpPublisherError('RTMP publishing cancelled')); this.pending = undefined;
    const run = this.run;
    this.run = undefined; this.current = undefined;
    if (clearPlaylist) { this.tracks.length = 0; this.holding = undefined; }
    const paused = this.status === 'paused';
    this.change('stopped');
    if (this.terminating) return this.terminating;
    if (!run || run.finished) return;
    if (paused) run.child.kill('SIGCONT');
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    const terminating = Promise.race([
      run.done,
      new Promise<never>((_, reject) => {
        const timeout = this.options.stopTimeoutMs ?? 2_000;
        killTimer = setTimeout(() => run.child.kill('SIGKILL'), timeout);
        failureTimer = setTimeout(() => reject(new RtmpPublisherError('RTMP encoder did not exit after SIGKILL')), timeout * 2);
      }),
      new Promise<never>((_, reject) => { try { run.child.kill('SIGTERM'); } catch { reject(new RtmpPublisherError('Could not terminate RTMP encoder')); } }),
    ]).finally(() => {
      clearTimeout(killTimer); clearTimeout(failureTimer);
      if (this.terminating === terminating) this.terminating = undefined;
    });
    this.terminating = terminating;
    await terminating;
  }
}
function positive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RtmpPublisherError(`Invalid ${field}`);
}
