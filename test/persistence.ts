import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AudioSource } from '../src/types.js';
import type { ResumePorts, SavedGroup } from '../src/persistence.js';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const persistence = await import('../src/persistence.js').catch((error: unknown) => {
  assert.fail(`Persistence module must implement the desired-state contract: ${String(error)}`);
});

async function fixture(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'tgcalls-persistence-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function group(chatId: string | bigint = '-1001234567890') {
  return {
    kind: 'group-rtc' as const,
    chatId,
    join: { muted: true, autoLeave: false, inviteHash: 'group-invite' },
    source: { kind: 'file' as const, path: '/media/current.mp4' },
    video: { device: 'screen' as const, options: { width: 640, height: 360, fps: 25 } },
    playlist: {
      queue: [
        { kind: 'file' as const, path: '/media/next.wav' },
        { kind: 'url' as const, url: 'https://example.test/video', audioUrl: 'https://example.test/audio' },
      ],
      hold: { kind: 'file' as const, path: '/media/hold.wav' },
    },
    paused: true,
    recording: { target: '/recordings/call.wav', segment: 1 },
  };
}

test('round-trips only desired group state through a private versioned file', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const store = new persistence.StateStore(path);
    assert.deepEqual(await store.load(), { version: 1, groups: [] });
    const input = group(-1001234567890n);
    const result = await store.save([input]);
    assert.deepEqual(result, { saved: ['-1001234567890'], skipped: [] });
    const expected = { version: 1, groups: [{ ...input, chatId: '-1001234567890' }] };
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await new persistence.StateStore(path).load(), expected);
  });
});

test('strict validation rejects unknown state and never overwrites invalid or future files', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const store = new persistence.StateStore(path);
    await store.save([group()]);
    const original = await readFile(path, 'utf8');
    const invalid = [
      { ...group(), chatId: 123 },
      { ...group(), chatId: '00123' },
      { ...group(), chatId: '0' },
      { ...group(), chatId: '9223372036854775808' },
      { ...group(), chatId: '-0' },
      { ...group(), join: { muted: 'yes', autoLeave: false } },
      { ...group(), source: { kind: 'file', path: '/media/x', auth: 'do-not-save' } },
      { ...group(), video: { device: 'camera', options: { fps: 0 } } },
      { ...group(), source: null, video: group().video },
      { ...group(), recording: { target: '/x.wav', segment: -1 } },
      { ...group(), playlist: { queue: [], hold: { kind: 'shell', command: '' } } },
      ...['ssrc', 'call', 'native', 'dtls', 'auth', 'p2p', 'conference', 'rtmpKey'].map(
        (field) => ({ ...group(), [field]: 'do-not-save' }),
      ),
    ];
    for (const value of invalid) {
      await assert.rejects(store.save([value as never]), { code: 'INVALID_STATE' });
      assert.equal(await readFile(path, 'utf8'), original);
    }
    await assert.rejects(store.save([group(), group()]), { code: 'INVALID_STATE' });
    for (const bad of [
      '{broken json',
      JSON.stringify({ version: 2, groups: [] }),
      JSON.stringify({ version: 1, groups: [group()], authKey: 'do-not-save' }),
      JSON.stringify({ version: 1, groups: [{ ...group(), kind: 'conference' }] }),
    ]) {
      await writeFile(path, bad);
      const code = bad.includes('"version":2') ? 'UNSUPPORTED_VERSION' : 'INVALID_STATE';
      await assert.rejects(store.load(), { code });
      await assert.rejects(store.save([]), { code });
      assert.equal(await readFile(path, 'utf8'), bad);
    }
    const limited = new persistence.StateStore(path, { maxBytes: 1024 });
    await writeFile(path, ' '.repeat(1025));
    await assert.rejects(limited.load(), { code: 'STATE_TOO_LARGE' });
    await assert.rejects(limited.save([]), { code: 'STATE_TOO_LARGE' });
    assert.equal((await stat(path)).size, 1025);
    const emptyPath = join(dir, 'oversized.json');
    await assert.rejects(new persistence.StateStore(emptyPath, { maxBytes: 1024 }).save([
      { ...group(), source: { kind: 'file', path: 'x'.repeat(2048) } },
    ]), { code: 'STATE_TOO_LARGE' });
    await assert.rejects(stat(emptyPath), { code: 'ENOENT' });
  });
});

test('shell persistence defaults to skipping the whole group with an observable reason', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const shell = { kind: 'shell' as const, command: 'touch /never-execute-from-state' };
    const unsafe = { ...group(), playlist: { queue: [shell], hold: null } };
    const store = new persistence.StateStore(path);
    assert.deepEqual(await store.save([unsafe]), {
      saved: [], skipped: [{ chatId: unsafe.chatId, reason: 'SHELL_DISABLED' }],
    });
    assert.equal((await readFile(path, 'utf8')).includes(shell.command), false);
    const trusted = new persistence.StateStore(path, { allowShell: true });
    await trusted.load();
    await trusted.save([unsafe]);
    assert.deepEqual((await trusted.load()).groups[0], unsafe);
  });
});

test('atomic faults preserve the old file, remove temps, surface errors, and allow a later save', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    await new persistence.StateStore(path).save([group()]);
    const original = await readFile(path, 'utf8');
    for (const phase of ['write', 'sync', 'rename'] as const) {
      let armed = true;
      const events: string[] = [];
      const observed: unknown[] = [];
      const failure = Object.assign(new Error('injected disk failure'), { code: 'EIO' });
      const io = {
        ...fs,
        async open(...args: Parameters<typeof fs.open>) {
          const handle = await fs.open(...args);
          if (typeof args[0] !== 'string' || !args[0].endsWith('.tmp')) { return handle; }
          events.push(`open:${(await handle.stat()).mode & 0o777}`);
          return new Proxy(handle, { get(target, key) {
            if (key === 'writeFile' || key === 'sync' || key === 'close') {
              return async (...params: unknown[]) => {
                events.push(String(key));
                if (armed && ((phase === 'write' && key === 'writeFile') || (phase === 'sync' && key === 'sync'))) {
                  armed = false;
                  throw failure;
                }
                return (target[key] as (...values: unknown[]) => unknown).apply(target, params);
              };
            }
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          } });
        },
        async rename(...args: Parameters<typeof fs.rename>) {
          events.push('rename');
          if (armed && phase === 'rename') { armed = false; throw failure; }
          return fs.rename(...args);
        },
      };
      const store = new persistence.StateStore(path, { io, onError: (error) => { observed.push(error); } });
      await store.load();
      await assert.rejects(store.save([group('-1002')]), { code: 'IO_ERROR', cause: failure });
      assert.equal(observed.length, 1);
      assert.equal(await readFile(path, 'utf8'), original);
      assert.deepEqual(await readdir(dir), ['state.json']);
      assert.ok(events.includes('close'));
      assert.equal(events[0], 'open:384');
      await store.save([group()]);
      assert.equal(await readFile(path, 'utf8'), original);
      assert.deepEqual(events.slice(-5), ['open:384', 'writeFile', 'sync', 'close', 'rename']);
    }
  });
});

test('serializes same-path writes, snapshots inputs immediately, and detects stale clients', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const store = new persistence.StateStore(path);
    const first = group('-1001');
    const pending = store.save([first]);
    first.source.path = '/changed-after-save';
    await pending;
    assert.equal((await store.load()).groups[0].source?.kind, 'file');
    assert.equal(((await store.load()).groups[0].source as { path: string }).path, '/media/current.mp4');
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.save([group(String(-2000 - index))])));
    assert.equal((await store.load()).groups[0].chatId, '-2011');
    assert.deepEqual(await readdir(dir), ['state.json']);
    const peer = new persistence.StateStore(path);
    await peer.load();
    await store.save([group('-3001')]);
    const uninitialized = new persistence.StateStore(path);
    await assert.rejects(uninitialized.save([group('-3000')]), { code: 'STATE_CONFLICT' });
    await assert.rejects(peer.save([group('-3002')]), { code: 'STATE_CONFLICT' });
    assert.equal((await peer.load()).groups[0].chatId, '-3001');
    await peer.save([group('-3003')]);
    await assert.rejects(store.save([group('-3004')]), { code: 'STATE_CONFLICT' });
    const before = await readFile(path, 'utf8');
    await writeFile(path + '.lock', 'another-process\n');
    await assert.rejects(peer.save([]), { code: 'STATE_LOCKED' });
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(await readFile(path + '.lock', 'utf8'), 'another-process\n');
  });
});

function fakePorts() {
  const events: Array<{ op: string; id: bigint; value?: unknown }> = [];
  const active = new Map<bigint, { source: AudioSource | null; ssrc: number; playlist?: SavedGroup['playlist'] }>();
  let serial = 6000;
  let joins = 0;
  let peak = 0;
  const ports: ResumePorts = {
    isActive: (id) => active.has(id),
    async joinGroup(id, source, options) {
      joins++;
      peak = Math.max(peak, joins);
      try {
        assert.equal(options.allowCreate, false);
        assert.equal(options.muted, true);
        assert.equal(options.paused, true);
        assert.equal(options.autoLeave, false);
        await new Promise<void>((resolve) => setImmediate(resolve));
        events.push({ op: 'join', id, value: { source, options } });
        active.set(id, { source, ssrc: ++serial });
      } finally { joins--; }
    },
    async joinViewer(id, options) {
      events.push({ op: 'viewer', id, value: options });
      active.set(id, { source: null, ssrc: ++serial });
    },
    async restorePlaylist(id, playlist) {
      events.push({ op: 'playlist', id, value: playlist });
      active.get(id)!.playlist = playlist;
    },
    async setPaused(id, paused) { events.push({ op: 'pause', id, value: paused }); },
    async setMuted(id, muted) { events.push({ op: 'mute', id, value: muted }); },
    async setAutoLeave(id, autoLeave) { events.push({ op: 'autoLeave', id, value: autoLeave }); },
    async startRecording(id, target, options) {
      events.push({ op: 'record', id, value: { target, options } });
      if (typeof target === 'string') { await writeFile(target, 'new-segment', { flag: 'wx', mode: 0o600 }); }
      else { await fs.mkdir(target.dir); }
    },
    async rollback(id) { events.push({ op: 'rollback', id }); active.delete(id); },
  };
  return { ports, events, active, peak: () => peak };
}

test('explicit concurrent resume rejoins serially, restores queue/hold, and preserves old recordings', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const old = join(dir, 'call.wav');
    await writeFile(old, 'old-recording-must-survive');
    const first = { ...group('-1001'), join: { muted: false, autoLeave: true }, paused: false,
      recording: { target: old, segment: 4 } };
    const second = { ...group('-1002'), source: null, video: undefined, recording: undefined };
    const viewer = { ...second, kind: 'group-viewer' as const, chatId: '-1004',
      playlist: { queue: [], hold: null } };
    const store = new persistence.StateStore(path);
    await store.save([first, second, group('-1003'), viewer]);
    const fake = fakePorts();
    fake.active.set(-1003n, { source: null, ssrc: 777 });
    const controller = new persistence.ResumeController(store, fake.ports);
    assert.equal(fake.events.length, 0, 'construction must not join or execute anything');
    const a = controller.resume();
    const b = controller.resume();
    assert.strictEqual(a, b, 'concurrent callers join the same operation');
    const report = await a;
    assert.deepEqual(report.restored, [-1001n, -1002n, -1004n]);
    assert.deepEqual(report.skipped, [{ chatId: -1003n, reason: 'ALREADY_ACTIVE' }]);
    assert.deepEqual(report.failed, []);
    assert.equal(fake.peak(), 1);
    assert.deepEqual(fake.active.get(-1001n)?.playlist, first.playlist);
    assert.deepEqual(fake.active.get(-1002n)?.playlist, second.playlist);
    assert.equal(fake.active.get(-1002n)?.source, null);
    assert.notEqual(fake.active.get(-1001n)?.ssrc, 777);
    assert.equal(await readFile(old, 'utf8'), 'old-recording-must-survive');
    const record = fake.events.find((event) => event.op === 'record')!.value as {
      target: string; options: { segment: number; previousTarget: string; interrupted: boolean; noOverwrite: boolean };
    };
    assert.equal(record.options.segment, 5);
    assert.equal(record.options.previousTarget, old);
    assert.equal(record.options.interrupted, true);
    assert.equal(record.options.noOverwrite, true);
    assert.notEqual(record.target, old);
    assert.equal(await readFile(record.target, 'utf8'), 'new-segment');
    assert.deepEqual(fake.events.filter((event) => event.id === -1001n).map((event) => event.op),
      ['join', 'playlist', 'record', 'pause', 'mute', 'autoLeave']);
    const before = fake.events.length;
    const repeat = await controller.resume();
    assert.equal(repeat.restored.length, 0);
    assert.equal(repeat.skipped.length, 4);
    assert.equal(fake.events.length, before);
  });
});

test('replay requires its own shell opt-in and skips any command in current, queue, or hold', async () => {
  await fixture(async (dir) => {
    const marker = join(dir, 'shell-was-executed');
    const shell = { kind: 'shell' as const, command: `touch ${marker}` };
    const groups = [
      { ...group('-1001'), source: shell, video: undefined, recording: undefined },
      { ...group('-1002'), playlist: { queue: [shell], hold: null }, recording: undefined },
      { ...group('-1003'), playlist: { queue: [], hold: shell }, recording: undefined },
    ];
    const path = join(dir, 'state.json');
    const store = new persistence.StateStore(path, { allowShell: true });
    await store.save(groups);
    const fake = fakePorts();
    const report = await new persistence.ResumeController(store, fake.ports).resume();
    assert.deepEqual(report.skipped, groups.map(({ chatId }) => ({ chatId: BigInt(chatId), reason: 'SHELL_DISABLED' })));
    assert.equal(report.restored.length, 0);
    assert.equal(fake.events.length, 0);
    await assert.rejects(stat(marker), { code: 'ENOENT' });
    const trusted = await new persistence.ResumeController(store, fake.ports, { allowShell: true }).resume();
    assert.equal(trusted.restored.length, 3);
    // Fake ports merely accept the opted-in intent; this test never executes the command.
    await assert.rejects(stat(marker), { code: 'ENOENT' });
  });
});

test('resume reports failures per chat, rolls back partial joins, and checks capabilities first', async () => {
  await fixture(async (dir) => {
    const store = new persistence.StateStore(join(dir, 'state.json'));
    const groups = ['-1001', '-1002', '-1003'].map((id) => ({ ...group(id), recording: undefined }));
    await store.save(groups);
    const fake = fakePorts();
    const noCall = new Error('No active group call');
    const queueFailure = new Error('Playlist update failed');
    const joinGroup = fake.ports.joinGroup;
    const restore = fake.ports.restorePlaylist;
    fake.ports.joinGroup = async (id, source, options) => {
      if (id === -1001n) { throw noCall; }
      return joinGroup(id, source, options);
    };
    fake.ports.restorePlaylist = async (id, playlist) => {
      if (id === -1002n) { throw queueFailure; }
      return restore(id, playlist);
    };
    const report = await new persistence.ResumeController(store, fake.ports).resume();
    assert.deepEqual(report.restored, [-1003n]);
    assert.deepEqual(report.failed, [{ chatId: -1001n, error: noCall }, { chatId: -1002n, error: queueFailure }]);
    assert.equal(fake.active.has(-1001n), false);
    assert.equal(fake.active.has(-1002n), false);
    assert.equal(fake.events.filter((event) => event.op === 'rollback').length, 2);
    await store.save([group('-1004')]);
    const unsupported = fakePorts();
    delete unsupported.ports.startRecording;
    const blocked = await new persistence.ResumeController(store, unsupported.ports).resume();
    assert.equal((blocked.failed[0].error as { code?: string }).code, 'UNSUPPORTED_CAPABILITY');
    assert.deepEqual(unsupported.events, []);
    await store.save([{ ...groups[0], kind: 'group-viewer', source: null, video: undefined,
      playlist: { queue: [], hold: null } }]);
    delete unsupported.ports.joinViewer;
    const viewer = await new persistence.ResumeController(store, unsupported.ports).resume();
    assert.equal((viewer.failed[0].error as { code?: string }).code, 'UNSUPPORTED_CAPABILITY');
    assert.deepEqual(unsupported.events, []);
  });
});

test('abort stops replay, rolls back the current bootstrap, and is safe before the first join', async () => {
  await fixture(async (dir) => {
    const store = new persistence.StateStore(join(dir, 'state.json'));
    await store.save(['-1001', '-1002', '-1003'].map((id) => ({ ...group(id), recording: undefined })));
    const abort = new AbortController();
    const fake = fakePorts();
    const joinGroup = fake.ports.joinGroup;
    fake.ports.joinGroup = async (...args) => { await joinGroup(...args); abort.abort(); };
    const report = await new persistence.ResumeController(store, fake.ports).resume({ signal: abort.signal });
    assert.equal(report.failed[0].chatId, -1001n);
    assert.equal(report.failed[0].error.name, 'AbortError');
    assert.deepEqual(report.skipped, [-1002n, -1003n].map((chatId) => ({ chatId, reason: 'ABORTED' })));
    assert.equal(fake.active.size, 0);
    assert.deepEqual(fake.events.map((event) => event.op), ['join', 'rollback']);
    const inactive = fakePorts();
    const before = await new persistence.ResumeController(store, inactive.ports).resume({ signal: abort.signal });
    assert.equal(before.skipped.length, 3);
    assert.deepEqual(inactive.events, []);
  });
});

test('source resolver refreshes current/queue/hold and revalidates without bypassing shell policy', async () => {
  await fixture(async (dir) => {
    const store = new persistence.StateStore(join(dir, 'state.json'));
    const original = { ...group(), recording: undefined };
    await store.save([original]);
    const fake = fakePorts();
    const resolved: string[] = [];
    const controller = new persistence.ResumeController(store, fake.ports, {
      resolveSource(source, context) {
        resolved.push(context.position);
        return source.kind === 'url' ? { ...source, url: 'https://fresh.test/media' } : source;
      },
    });
    assert.equal((await controller.resume()).restored.length, 1);
    assert.deepEqual(resolved, ['current', 'queue', 'queue', 'hold']);
    assert.deepEqual(fake.active.get(BigInt(original.chatId))?.playlist?.queue[1],
      { kind: 'url', url: 'https://fresh.test/media', audioUrl: 'https://example.test/audio' });
    const unsafe = fakePorts();
    const report = await new persistence.ResumeController(store, unsafe.ports, {
      resolveSource: (source, context) => context.position === 'queue'
        ? { kind: 'shell', command: 'touch /never-execute' } : source,
    }).resume();
    assert.deepEqual(report.skipped, [{ chatId: BigInt(original.chatId), reason: 'SHELL_DISABLED' }]);
    assert.equal(unsafe.events.length, 0);
  });
});

const restartWorker = String.raw`
import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NTgCalls } from 'ntgcalls';
const [stage, dir, moduleUrl, json] = process.argv.slice(1);
const { StateStore, ResumeController } = await import(moduleUrl);
const desired = JSON.parse(json);
const ntg = new NTgCalls();
const id = BigInt(desired.chatId);
let allocated = false;
try {
  const store = new StateStore(join(dir, 'state.json'));
  if (stage === 'save') {
    const params = await ntg.createCall(id);
    allocated = true;
    const ssrc = Number(JSON.parse(params).ssrc) >>> 0;
    assert.ok(ssrc > 0);
    await writeFile(desired.recording.target, 'previous-process-recording', { flag: 'wx' });
    await store.save([desired]);
    await writeFile(join(dir, 'save-result.json'), JSON.stringify({ pid: process.pid, ssrc }));
  } else {
    const active = new Map();
    let refetches = 0;
    let recording;
    const adapter = {
      async getGroupCall(chatId, allowCreate) {
        assert.equal(chatId, id);
        assert.equal(allowCreate, false);
        refetches++;
        return { ephemeralTlCall: true, accessHash: 'DO_NOT_PERSIST' };
      },
    };
    const ports = {
      isActive: (chatId) => active.has(chatId),
      async joinGroup(chatId, source, options) {
        await adapter.getGroupCall(chatId, options.allowCreate);
        const params = await ntg.createCall(chatId);
        allocated = true;
        active.set(chatId, { source, ssrc: Number(JSON.parse(params).ssrc) >>> 0, options });
      },
      async restorePlaylist(chatId, playlist) { active.get(chatId).playlist = playlist; },
      async setPaused(chatId, paused) { active.get(chatId).paused = paused; },
      async setMuted(chatId, muted) { active.get(chatId).muted = muted; },
      async setAutoLeave(chatId, autoLeave) { active.get(chatId).autoLeave = autoLeave; },
      async startRecording(chatId, target, options) {
        assert.equal(options.noOverwrite, true);
        assert.equal(options.interrupted, true);
        await writeFile(target, 'fresh-process-segment', { flag: 'wx' });
        recording = { target, segment: options.segment };
      },
      async rollback(chatId) { active.delete(chatId); },
    };
    const controller = new ResumeController(store, ports);
    assert.equal(refetches, 0);
    const report = await controller.resume();
    assert.deepEqual(report.restored, [id]);
    assert.deepEqual(report.failed, []);
    await writeFile(join(dir, 'resume-result.json'), JSON.stringify({
      pid: process.pid, refetches, ...active.get(id), recording,
    }));
  }
} finally { if (allocated) { await ntg.stop(id); } }
process.exit(0);
`;

async function worker(code: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', code, ...args], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (part: Buffer) => { output += part.toString(); });
    child.stderr.on('data', (part: Buffer) => { output += part.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Persistence worker exceeded 20s')); }, 20000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) { resolve(); }
      else { reject(new Error(`Persistence worker exit=${code} signal=${signal}\n${output}`)); }
    });
  });
}

test('two real processes save/load/resume using fake RPC ports and fresh native SSRC', async () => {
  await fixture(async (dir) => {
    const desired = { ...group('-1001234567890'), recording: { target: join(dir, 'call.wav'), segment: 1 } };
    const url = new URL('../src/persistence.ts', import.meta.url).href;
    const args = [dir, url, JSON.stringify(desired)];
    await worker(restartWorker, ['save', ...args]);
    const original = JSON.parse(await readFile(join(dir, 'save-result.json'), 'utf8'));
    await worker(restartWorker, ['resume', ...args]);
    const resumed = JSON.parse(await readFile(join(dir, 'resume-result.json'), 'utf8'));
    assert.notEqual(original.pid, resumed.pid);
    assert.notEqual(original.ssrc, resumed.ssrc);
    assert.ok(resumed.ssrc > 0);
    assert.equal(resumed.refetches, 1);
    assert.equal(resumed.options.allowCreate, false);
    assert.equal(resumed.options.paused, true);
    assert.deepEqual(resumed.options.video, desired.video);
    assert.deepEqual(resumed.source, desired.source);
    assert.deepEqual(resumed.playlist, desired.playlist);
    assert.equal(resumed.paused, desired.paused);
    assert.equal(resumed.muted, desired.join.muted);
    assert.equal(resumed.autoLeave, desired.join.autoLeave);
    assert.equal(resumed.recording.segment, 2);
    assert.notEqual(resumed.recording.target, desired.recording.target);
    assert.equal(await readFile(desired.recording.target, 'utf8'), 'previous-process-recording');
    assert.equal(await readFile(resumed.recording.target, 'utf8'), 'fresh-process-segment');
    const state = await readFile(join(dir, 'state.json'), 'utf8');
    for (const secret of ['ssrc', 'accessHash', 'DO_NOT_PERSIST', 'native', 'auth', 'p2p', 'conference', 'rtmpKey']) {
      assert.equal(state.includes(secret), false, `state must exclude ${secret}`);
    }
    assert.equal((await stat(join(dir, 'state.json'))).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(state), { version: 1, groups: [desired] });
  });
});

test('directory fsync failure is reported after commit and invalid state never calls ports', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    const expected = group();
    const io = {
      ...fs,
      async open(...args: Parameters<typeof fs.open>) {
        const handle = await fs.open(...args);
        if (args[0] !== dir) { return handle; }
        return new Proxy(handle, { get(target, key) {
          if (key === 'sync') { return async () => { throw new Error('directory sync failed'); }; }
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      },
    };
    await assert.rejects(new persistence.StateStore(path, { io }).save([expected]), { code: 'IO_ERROR' });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, groups: [expected] });
    assert.deepEqual(await readdir(dir), ['state.json']);
    const fake = fakePorts();
    await writeFile(path, JSON.stringify({ version: 9, groups: [] }));
    await assert.rejects(new persistence.ResumeController(new persistence.StateStore(path), fake.ports).resume(),
      { code: 'UNSUPPORTED_VERSION' });
    assert.deepEqual(fake.events, []);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 9);
  });
});

test('two writers in different processes cannot silently replace each other', async () => {
  await fixture(async (dir) => {
    const path = join(dir, 'state.json');
    await new persistence.StateStore(path).save([group('-1000')]);
    const code = String.raw`
      import { readFile, writeFile, stat } from 'node:fs/promises';
      import { join } from 'node:path';
      import { setTimeout as delay } from 'node:timers/promises';
      const [dir, url, name, encoded] = process.argv.slice(1);
      const { StateStore } = await import(url);
      const store = new StateStore(join(dir, 'state.json'));
      await store.load();
      await writeFile(join(dir, name + '.ready'), 'ready');
      const peer = join(dir, name === 'a' ? 'b.ready' : 'a.ready');
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await stat(peer).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });
        if (!ready) await delay(10);
      }
      if (!ready) throw new Error('Peer process did not reach barrier');
      let result;
      try { await store.save([JSON.parse(encoded)]); result = { status: 'saved' }; }
      catch (error) { result = { status: 'rejected', code: error.code }; }
      await writeFile(join(dir, name + '.result'), JSON.stringify(result));
    `;
    const url = new URL('../src/persistence.ts', import.meta.url).href;
    await Promise.all(['a', 'b'].map((name, index) => worker(code,
      [dir, url, name, JSON.stringify(group(String(-1001 - index)))])));
    const results = await Promise.all(['a', 'b'].map(async (name) => JSON.parse(await readFile(join(dir, name + '.result'), 'utf8'))));
    assert.equal(results.filter((value) => value.status === 'saved').length, 1);
    assert.equal(results.filter((value) => value.status === 'rejected').length, 1);
    assert.ok(['STATE_LOCKED', 'STATE_CONFLICT'].includes(results.find((value) => value.status === 'rejected').code));
    const state = await new persistence.StateStore(path).load();
    const winner = results.findIndex((value) => value.status === 'saved');
    assert.equal(state.groups[0].chatId, String(-1001 - winner));
    assert.equal((await readdir(dir)).some((name) => name.endsWith('.tmp') || name.endsWith('.lock')), false);
  });
});

test('folder recording restarts in a fresh child directory and preserves prior artifacts', async () => {
  await fixture(async (dir) => {
    const folder = join(dir, 'participant-recordings');
    await fs.mkdir(folder);
    await writeFile(join(folder, 'prior.wav'), 'prior-participant-media');
    const store = new persistence.StateStore(join(dir, 'state.json'));
    await store.save([{ ...group(), recording: { target: { dir: folder, video: true }, segment: 8 } }]);
    const fake = fakePorts();
    const report = await new persistence.ResumeController(store, fake.ports).resume();
    assert.equal(report.restored.length, 1);
    const value = fake.events.find((event) => event.op === 'record')!.value as {
      target: { dir: string; video: boolean }; options: { segment: number; previousTarget: { dir: string } };
    };
    assert.notEqual(value.target.dir, folder);
    assert.equal(value.target.video, true);
    assert.equal(value.options.segment, 9);
    assert.equal(value.options.previousTarget.dir, folder);
    assert.equal(await readFile(join(folder, 'prior.wav'), 'utf8'), 'prior-participant-media');
    assert.ok((await stat(value.target.dir)).isDirectory());
  });
});

