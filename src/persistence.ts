/** Desired group intent only. Never pass an ActiveCall, TL object, or native state here. */
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { TgCallsError } from './errors.js';
import type { AudioSource, VideoOptions } from './types.js';

export interface SavedGroup {
  kind: 'group-rtc' | 'group-viewer';
  chatId: string;
  join: { muted: boolean; autoLeave: boolean; inviteHash?: string };
  source: AudioSource | null;
  video?: { device: 'camera' | 'screen'; options: VideoOptions };
  playlist: { queue: AudioSource[]; hold: AudioSource | null };
  paused: boolean;
  recording?: { target: string | { dir: string; video?: boolean }; segment: number };
}

export type DesiredGroup = Omit<SavedGroup, 'chatId'> & { chatId: string | bigint };
export interface SavedState { version: 1; groups: SavedGroup[] }
export interface SaveReport {
  saved: string[];
  skipped: { chatId: string; reason: 'SHELL_DISABLED' }[];
}
export type PersistenceErrorCode = 'INVALID_STATE' | 'UNSUPPORTED_VERSION' | 'STATE_TOO_LARGE'
  | 'IO_ERROR' | 'STATE_CONFLICT' | 'STATE_LOCKED';

/** Messages name schema locations, never source URLs, shell commands, or file contents. */
export class PersistenceError extends TgCallsError {
  constructor(readonly code: PersistenceErrorCode, message: string, readonly cause?: unknown) {
    super(message);
  }
}

export interface StateStoreOptions {
  /** Entire encoded file, default 1 MiB. Reads are bounded before JSON parsing. */
  maxBytes?: number;
  /** Persist shell groups only after explicit application opt-in; replay has a separate gate. */
  allowShell?: boolean;
  /** Synchronous error event bridge. Rejected promises always remain observable too. */
  onError?: (error: PersistenceError) => void;
  /** Filesystem port for fault tests; defaults to the actual Node filesystem. */
  io?: Pick<typeof fs, 'open' | 'rename' | 'unlink'>;
}

function invalid(location: string): never {
  throw new PersistenceError('INVALID_STATE', `Invalid persistence state at ${location}`);
}

function object(value: unknown, keys: readonly string[], location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return invalid(location); }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) { return invalid(location); }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)
      || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
      || !('value' in Object.getOwnPropertyDescriptor(value, key)!)) { return invalid(location); }
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, location: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || value.length > 16384) {
    return invalid(location);
  }
  return value;
}

function bool(value: unknown, location: string): boolean {
  if (typeof value !== 'boolean') { return invalid(location); }
  return value;
}

function integer(value: unknown, min: number, max: number, location: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return invalid(location);
  }
  return value;
}

function chatId(value: unknown, allowBigInt: boolean): string {
  if (allowBigInt && typeof value === 'bigint') { value = value.toString(); }
  if (typeof value !== 'string' || !/^-?[1-9]\d{0,18}$/.test(value)) { return invalid('group.chatId'); }
  const id = BigInt(value);
  if (id < -9223372036854775808n || id > 9223372036854775807n) { return invalid('group.chatId'); }
  return value;
}

function source(value: unknown): AudioSource | null {
  if (value === null) { return null; }
  const src = object(value, ['kind', 'path', 'url', 'audioUrl', 'command', 'sampleRate', 'channels', 'keepOpen'], 'source');
  switch (src.kind) {
    case 'file':
      object(src, ['kind', 'path'], 'source.file');
      return { kind: 'file', path: text(src.path, 'source.path') };
    case 'url':
      object(src, ['kind', 'url', 'audioUrl'], 'source.url');
      return {
        kind: 'url', url: text(src.url, 'source.url'),
        ...(src.audioUrl !== undefined ? { audioUrl: text(src.audioUrl, 'source.audioUrl') } : {}),
      };
    case 'shell':
      object(src, ['kind', 'command'], 'source.shell');
      return { kind: 'shell', command: text(src.command, 'source.command') };
    case 'external':
      object(src, ['kind', 'sampleRate', 'channels', 'keepOpen'], 'source.external');
      return {
        kind: 'external',
        ...(src.sampleRate !== undefined ? { sampleRate: integer(src.sampleRate, 8000, 192000, 'source.sampleRate') } : {}),
        ...(src.channels !== undefined ? { channels: src.channels === 1 || src.channels === 2 ? src.channels : invalid('source.channels') } : {}),
        ...(src.keepOpen !== undefined ? { keepOpen: typeof src.keepOpen === 'boolean' ? src.keepOpen : invalid('source.keepOpen') } : {}),
      };
    default: return invalid('source.kind');
  }
}

function videoOptions(value: unknown): VideoOptions {
  const opts = object(value, ['width', 'height', 'fps', 'adjustByHeight'], 'video.options');
  const result: VideoOptions = {};
  for (const key of ['width', 'height'] as const) {
    if (opts[key] !== undefined) {
      const dimension = integer(opts[key], 2, 16384, `video.${key}`);
      if (dimension % 2) { return invalid(`video.${key}`); }
      result[key] = dimension;
    }
  }
  if (opts.fps !== undefined) {
    if (typeof opts.fps !== 'number' || !Number.isFinite(opts.fps) || opts.fps <= 0 || opts.fps > 240) {
      return invalid('video.fps');
    }
    result.fps = opts.fps;
  }
  if (opts.adjustByHeight !== undefined) { result.adjustByHeight = bool(opts.adjustByHeight, 'video.adjustByHeight'); }
  return result;
}

function savedGroup(value: unknown, allowBigInt: boolean): SavedGroup {
  const group = object(value, ['kind', 'chatId', 'join', 'source', 'video', 'playlist', 'paused', 'recording'], 'group');
  if (group.kind !== 'group-rtc' && group.kind !== 'group-viewer') { return invalid('group.kind'); }
  const flags = object(group.join, ['muted', 'autoLeave', 'inviteHash'], 'group.join');
  const playlist = object(group.playlist, ['queue', 'hold'], 'group.playlist');
  if (!Array.isArray(playlist.queue) || playlist.queue.length > 1000) { return invalid('playlist.queue'); }
  const result: SavedGroup = {
    kind: group.kind,
    chatId: chatId(group.chatId, allowBigInt),
    join: {
      muted: bool(flags.muted, 'join.muted'), autoLeave: bool(flags.autoLeave, 'join.autoLeave'),
      ...(flags.inviteHash !== undefined ? { inviteHash: text(flags.inviteHash, 'join.inviteHash') } : {}),
    },
    source: source(group.source),
    playlist: {
      queue: Array.from(playlist.queue, (item) => source(item) ?? invalid('playlist.queue.source')),
      hold: source(playlist.hold),
    },
    paused: bool(group.paused, 'group.paused'),
  };
  if (group.video !== undefined) {
    const video = object(group.video, ['device', 'options'], 'group.video');
    if (video.device !== 'camera' && video.device !== 'screen') { return invalid('video.device'); }
    if (!result.source || result.source.kind === 'shell' || result.source.kind === 'external') { return invalid('video.source'); }
    result.video = { device: video.device, options: videoOptions(video.options) };
  }
  if (group.kind === 'group-viewer' && (result.source !== null || result.video !== undefined
    || result.playlist.queue.length || result.playlist.hold !== null)) { return invalid('viewer.source'); }
  if (group.recording !== undefined) {
    const recording = object(group.recording, ['target', 'segment'], 'group.recording');
    let target: NonNullable<SavedGroup['recording']>['target'];
    if (typeof recording.target === 'string') { target = text(recording.target, 'recording.target'); }
    else {
      const folder = object(recording.target, ['dir', 'video'], 'recording.target');
      target = {
        dir: text(folder.dir, 'recording.dir'),
        ...(folder.video !== undefined ? { video: bool(folder.video, 'recording.video') } : {}),
      };
    }
    result.recording = { target, segment: integer(recording.segment, 0, Number.MAX_SAFE_INTEGER - 1, 'recording.segment') };
  }
  return result;
}

function savedGroups(value: unknown, allowBigInt: boolean): SavedGroup[] {
  if (!Array.isArray(value) || value.length > 1000) { return invalid('groups'); }
  const seen = new Set<string>();
  return Array.from(value, (item) => {
    const group = savedGroup(item, allowBigInt);
    if (seen.has(group.chatId)) { return invalid('groups.duplicate'); }
    seen.add(group.chatId);
    return group;
  });
}

function validateState(value: unknown): SavedState {
  const state = object(value, ['version', 'groups'], 'state');
  if (!Number.isSafeInteger(state.version)) { return invalid('state.version'); }
  if (state.version !== 1) { throw new PersistenceError('UNSUPPORTED_VERSION', 'Unsupported persistence state version'); }
  return { version: 1, groups: savedGroups(state.groups, false) };
}

function hasShell(group: SavedGroup): boolean {
  return group.source?.kind === 'shell' || group.playlist.hold?.kind === 'shell'
    || group.playlist.queue.some((item) => item.kind === 'shell');
}

const pathOperations = new Map<string, Promise<void>>();

function serialize<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = pathOperations.get(path) ?? Promise.resolve();
  const operation = previous.then(run);
  // A failed write must not poison subsequent work. The original promise still rejects.
  const settled = operation.then(() => undefined, () => undefined);
  pathOperations.set(path, settled);
  void settled.then(() => { if (pathOperations.get(path) === settled) { pathOperations.delete(path); } });
  return operation;
}

function revision(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Constructing a store performs no IO. save() snapshots its input before yielding.
 * Same-process operations serialize per absolute path. An exclusive sibling .lock
 * protects cross-process writes; stale lock recovery is deliberately manual after
 * the application has established that the owning process is dead. load() refreshes
 * this instance's revision; load once before saving over an existing file. Stale
 * saves reject instead of overwriting another client. Parents must not treat a
 * revision load as permission to replace saved desired groups with an empty runtime
 * snapshot: resume, or explicitly reconcile intent before enabling mutation hooks.
 */
export class StateStore {
  readonly path: string;
  private readonly maxBytes: number;
  private readonly allowShell: boolean;
  private readonly io: NonNullable<StateStoreOptions['io']>;
  private readonly onError?: StateStoreOptions['onError'];
  private observed: string | null | undefined;

  constructor(path: string, options: StateStoreOptions = {}) {
    this.path = resolve(text(path, 'path'));
    this.maxBytes = integer(options.maxBytes ?? 1048576, 1, 64 * 1048576, 'maxBytes');
    this.allowShell = options.allowShell === true;
    this.io = options.io ?? fs;
    this.onError = options.onError;
  }

  async load(): Promise<SavedState> {
    try {
      return await serialize(this.path, async () => {
        const loaded = await this.read();
        this.observed = loaded.revision;
        return loaded.state;
      });
    } catch (error) { throw this.report(error); }
  }

  private async read(): Promise<{ state: SavedState; revision: string | null }> {
    let handle: fs.FileHandle;
    try { handle = await this.io.open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { state: { version: 1, groups: [] }, revision: null };
      }
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) { return invalid('file'); }
      if (stat.size > this.maxBytes) { throw this.tooLarge(); }
      const bytes = Buffer.alloc(this.maxBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await handle.read(bytes, length, bytes.length - length, null);
        if (read.bytesRead === 0) { break; }
        length += read.bytesRead;
      }
      if (length > this.maxBytes) { throw this.tooLarge(); }
      const content = bytes.subarray(0, length);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
      catch { return invalid('json'); }
      return { state: validateState(parsed), revision: revision(content) };
    } finally { await handle.close(); }
  }

  /** Call after successful runtime mutations; await before planned transport cleanup. */
  async save(groups: readonly DesiredGroup[]): Promise<SaveReport> {
    try {
      const validated = savedGroups(groups, true);
      const skipped: SaveReport['skipped'] = [];
      const state: SavedState = { version: 1, groups: validated.filter((group) => {
        if (!this.allowShell && hasShell(group)) {
          skipped.push({ chatId: group.chatId, reason: 'SHELL_DISABLED' });
          return false;
        }
        return true;
      }) };
      const bytes = Buffer.from(JSON.stringify(state) + '\n');
      if (bytes.length > this.maxBytes) { throw this.tooLarge(); }
      return await serialize(this.path, async () => {
        await this.write(bytes);
        return { saved: state.groups.map((group) => group.chatId), skipped };
      });
    } catch (error) { throw this.report(error); }
  }

  private async write(bytes: Buffer): Promise<void> {
    const lockPath = this.path + '.lock';
    let lock: fs.FileHandle;
    try { lock = await this.io.open(lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new PersistenceError('STATE_LOCKED', 'Persistence state is locked by another writer');
      }
      throw error;
    }
    const temp = join(dirname(this.path), `.${basename(this.path)}.${randomUUID()}.tmp`);
    let file: fs.FileHandle | undefined;
    let tempExists = false;
    let failure: unknown;
    try {
      await lock.writeFile(`${process.pid}\n`);
      // Validate the exact existing file under the cross-process lock, including its version.
      const current = await this.read();
      if ((this.observed === undefined && current.revision !== null)
        || (this.observed !== undefined && this.observed !== current.revision)) {
        throw new PersistenceError('STATE_CONFLICT', 'Load the current persistence revision before replacing an existing snapshot');
      }
      file = await this.io.open(temp, 'wx', 0o600);
      tempExists = true;
      await file.writeFile(bytes);
      await file.sync();
      const written = file;
      file = undefined;
      await written.close();
      await this.io.rename(temp, this.path);
      tempExists = false;
      this.observed = revision(bytes);
      // Rename durability is a separate IO step. Failure remains observable even
      // when rename already committed; callers must reload before deciding to retry.
      const directory = await this.io.open(dirname(this.path), constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) { failure = error; }
    const cleanup = async (run: () => Promise<unknown>) => {
      try { await run(); }
      catch (error) { failure = failure ? new AggregateError([failure, error], 'Persistence cleanup failed') : error; }
    };
    if (file) { await cleanup(() => file!.close()); }
    if (tempExists) { await cleanup(() => this.io.unlink(temp)); }
    await cleanup(() => lock.close());
    await cleanup(() => this.io.unlink(lockPath));
    if (failure) { throw failure; }
  }

  private report(error: unknown): PersistenceError {
    const wrapped = error instanceof PersistenceError ? error
      : new PersistenceError('IO_ERROR', 'Persistence filesystem operation failed', error);
    this.onError?.(wrapped);
    return wrapped;
  }

  private tooLarge(): PersistenceError {
    return new PersistenceError('STATE_TOO_LARGE', 'Persistence state exceeds the configured byte limit');
  }
}

/** The facade must honor these gates before native connect starts media. */
export interface ResumeJoinOptions {
  allowCreate: false;
  muted: true;
  paused: true;
  autoLeave: false;
  inviteHash?: string;
  video?: SavedGroup['video'];
  signal?: AbortSignal;
}

export type RecordingTarget = NonNullable<SavedGroup['recording']>['target'];
export interface ResumeRecordingOptions {
  segment: number;
  previousTarget: RecordingTarget;
  interrupted: true;
  noOverwrite: true;
  signal?: AbortSignal;
}

/**
 * Public-operation ports implemented by the owning client, never native/TL import.
 * joinGroup must refetch the current call and allocate a fresh native session/SSRC;
 * source=null means a real idle join, never an empty shell. Install callbacks first,
 * keep CAPTURE muted+paused before connect, and suppress streamEnd/autoLeave until
 * setAutoLeave commits the bootstrap. Include pending joins in isActive().
 * restorePlaylist replaces queue+hold without starting or consuming either track.
 * Recording writers must create targets exclusively (including folder manifests).
 * rollback tears down only the group created by this bootstrap, including partial
 * join membership and writers. All rejected operations remain per-chat failures.
 */
export interface ResumePorts {
  isActive(chatId: bigint): boolean | Promise<boolean>;
  joinGroup(chatId: bigint, source: AudioSource | null, options: ResumeJoinOptions): Promise<unknown>;
  joinViewer?(chatId: bigint, options: ResumeJoinOptions): Promise<unknown>;
  restorePlaylist(chatId: bigint, playlist: SavedGroup['playlist']): Promise<void>;
  setPaused(chatId: bigint, paused: boolean): Promise<void>;
  setMuted(chatId: bigint, muted: boolean): Promise<void>;
  setAutoLeave(chatId: bigint, autoLeave: boolean): Promise<void>;
  startRecording?(chatId: bigint, target: RecordingTarget, options: ResumeRecordingOptions): Promise<unknown>;
  rollback(chatId: bigint): Promise<void>;
}

export interface ResumeReport {
  restored: bigint[];
  skipped: { chatId: bigint; reason: string }[];
  failed: { chatId: bigint; error: Error }[];
}

export interface ResumeOptions { signal?: AbortSignal }
export interface ResumeControllerOptions {
  /** Separate from permission to persist shell commands. Default false. */
  allowShell?: boolean;
  /** Refresh expiring URLs without changing the saved intent; never called for null idle. */
  resolveSource?: (source: AudioSource, context: {
    chatId: bigint; position: 'current' | 'queue' | 'hold'; index?: number; signal?: AbortSignal;
  }) => AudioSource | Promise<AudioSource>;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Resume aborted', { cause: signal.reason });
    error.name = 'AbortError';
    throw error;
  }
}

/** Explicit replay only; construction never loads a file, joins, or spawns a process. */
export class ResumeController {
  private inFlight?: Promise<ResumeReport>;
  constructor(
    private readonly store: StateStore,
    private readonly ports: ResumePorts,
    private readonly options: ResumeControllerOptions = {},
  ) {}

  /** Concurrent callers share the first caller's operation (and cancellation signal). */
  resume(options: ResumeOptions = {}): Promise<ResumeReport> {
    if (this.inFlight) { return this.inFlight; }
    const operation = this.run(options);
    this.inFlight = operation;
    const clear = () => { if (this.inFlight === operation) { this.inFlight = undefined; } };
    void operation.then(clear, clear);
    return operation;
  }

  private async run(options: ResumeOptions): Promise<ResumeReport> {
    const state = await this.store.load();
    const report: ResumeReport = { restored: [], skipped: [], failed: [] };
    for (const saved of state.groups) {
      const id = BigInt(saved.chatId);
      if (options.signal?.aborted) {
        report.skipped.push({ chatId: id, reason: 'ABORTED' });
        continue;
      }
      let attempted = false;
      try {
        if (await this.ports.isActive(id)) {
          report.skipped.push({ chatId: id, reason: 'ALREADY_ACTIVE' });
          continue;
        }
        checkAbort(options.signal);
        if (!this.options.allowShell && hasShell(saved)) {
          report.skipped.push({ chatId: id, reason: 'SHELL_DISABLED' });
          continue;
        }
        const group = await this.resolveSources(saved, options.signal);
        checkAbort(options.signal);
        // A resolver is application code, so repeat the safety gate on its output.
        if (!this.options.allowShell && hasShell(group)) {
          report.skipped.push({ chatId: id, reason: 'SHELL_DISABLED' });
          continue;
        }
        this.checkCapabilities(group);
        // Recheck after async resolution in case the application joined meanwhile.
        if (await this.ports.isActive(id)) {
          report.skipped.push({ chatId: id, reason: 'ALREADY_ACTIVE' });
          continue;
        }
        checkAbort(options.signal);
        const joinOptions: ResumeJoinOptions = {
          allowCreate: false, muted: true, paused: true, autoLeave: false,
          ...(group.join.inviteHash !== undefined ? { inviteHash: group.join.inviteHash } : {}),
          ...(group.video !== undefined ? { video: group.video } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        };
        attempted = true;
        if (group.kind === 'group-viewer') { await this.ports.joinViewer!(id, joinOptions); }
        else { await this.ports.joinGroup(id, group.source, joinOptions); }
        checkAbort(options.signal);
        await this.ports.restorePlaylist(id, group.playlist);
        checkAbort(options.signal);
        if (group.recording) {
          const segment = group.recording.segment + 1;
          const previousTarget = group.recording.target;
          const suffix = `.resume-${segment}-${randomUUID()}`;
          const target = typeof previousTarget === 'string'
            ? join(dirname(previousTarget), basename(previousTarget, extname(previousTarget)) + suffix + extname(previousTarget))
            : { ...previousTarget, dir: join(previousTarget.dir, `resume-${segment}-${randomUUID()}`) };
          await this.ports.startRecording!(id, target, {
            segment, previousTarget, interrupted: true, noOverwrite: true,
            ...(options.signal ? { signal: options.signal } : {}),
          });
        }
        checkAbort(options.signal);
        await this.ports.setPaused(id, group.paused);
        checkAbort(options.signal);
        await this.ports.setMuted(id, group.join.muted);
        checkAbort(options.signal);
        await this.ports.setAutoLeave(id, group.join.autoLeave);
        checkAbort(options.signal);
        report.restored.push(id);
      } catch (error) {
        let failure = error instanceof Error ? error : new Error('Resume operation failed', { cause: error });
        if (attempted) {
          try { await this.ports.rollback(id); }
          catch (cleanup) { failure = new AggregateError([failure, cleanup], 'Resume and rollback failed'); }
        }
        report.failed.push({ chatId: id, error: failure });
      }
    }
    return report;
  }

  private checkCapabilities(group: SavedGroup): void {
    const required: (keyof ResumePorts)[] = [
      'isActive', 'restorePlaylist', 'setPaused', 'setMuted', 'setAutoLeave', 'rollback',
      group.kind === 'group-viewer' ? 'joinViewer' : 'joinGroup',
    ];
    if (group.recording) { required.push('startRecording'); }
    for (const key of required) {
      if (typeof this.ports[key] !== 'function') {
        throw Object.assign(new TgCallsError(`Resume requires the ${key} operation port`), {
          code: 'UNSUPPORTED_CAPABILITY' as const,
        });
      }
    }
  }

  private async resolveSources(group: SavedGroup, signal?: AbortSignal): Promise<SavedGroup> {
    const resolver = this.options.resolveSource;
    if (!resolver) { return group; }
    const transform = async (value: AudioSource | null, position: 'current' | 'queue' | 'hold', index?: number) => {
      if (value === null) { return null; }
      checkAbort(signal);
      const output = await resolver(value, { chatId: BigInt(group.chatId), position, index, signal });
      checkAbort(signal);
      return source(output) ?? invalid('resolver.source');
    };
    const current = await transform(group.source, 'current');
    const queue: AudioSource[] = [];
    for (let index = 0; index < group.playlist.queue.length; index++) {
      queue.push((await transform(group.playlist.queue[index], 'queue', index))!);
    }
    const hold = await transform(group.playlist.hold, 'hold');
    return savedGroup({ ...group, source: current, playlist: { queue, hold } }, false);
  }
}
