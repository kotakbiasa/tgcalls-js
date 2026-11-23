import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TgCallsClient } from '../src/index.js';
import { ConnectionMode, StreamDevice, StreamMode } from 'ntgcalls';

const dir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-client-state-'));
const statePath = path.join(dir, 'state.json');
const chat = -1001112223334n;
let serial = 100;
function client() {
  const events = new Map<string, Function>();
  const order: string[] = [];
  const adapter: any = {
    isAdapter: true, resolveChatId: async (id: bigint) => id,
    getGroupCall: async (_id: bigint, create: boolean) => {assert.equal(create, false); order.push('refetch'); return { id: 9n, accessHash: 8n };},
    getParticipants: async () => ({ participants: [{ peer: { kind: 'user', id: 42n }, source: 71 }], version: 1, nextOffset: '', count: 1 }),
    normalizeParticipants: (raw: unknown[]) => raw,
    joinGroupCall: async (_call: unknown, _params: string, options: any) => {order.push('rpc-join'); return { params: options };},
    leaveGroupCall: async () => {}, joinPresentationCall: async () => {}, leavePresentationCall: async () => {},
    extractConnectionParams: () => '{"transport":"fixture"}',
    installUpdateHandler: () => () => {}, dispose: () => {},
  };
  const tg = new TgCallsClient({ client: adapter, statePath } as any);
  const native: Record<string, (...args: any[]) => unknown> = {
    createCall: async () => JSON.stringify({ ssrc: ++serial }), setStreamSources: async () => {},
    connect: async () => {order.push('connect');}, stop: async () => {},
    pause: async () => {order.push('pause'); return true;}, resume: async () => {order.push('resume'); return true;},
    mute: async () => {order.push('mute'); return true;}, unmute: async () => {order.push('unmute'); return true;},
    onStreamEnd: (fn: Function) => events.set('streamEnd', fn),
    onConnectionChange: (fn: Function) => events.set('connectionChange', fn),
    onRemoteSourceChange: () => {},
    onFrames: (fn: Function) => events.set('frames', fn),
    getConnectionMode: async () => ConnectionMode.RTC,
    addIncomingVideo: async () => 77, removeIncomingVideo: async () => true,
  };
  for (const [name, value] of Object.entries(native)) {Object.defineProperty(tg.ntg, name, { configurable: true, value });}
  return { tg, order, events };
}
try {
  const a = client();
  const first = await a.tg.play(chat, { kind: 'file', path: '/fixtures/first.mp3' }, { autoLeave: false });
  await a.tg.enqueue(chat, { kind: 'file', path: '/fixtures/second.mp3' });
  await a.tg.playOnHold(chat, { kind: 'file', path: '/fixtures/hold.mp3' });
  await a.tg.pause(chat);
  await a.tg.mute(chat);
  const folder = path.join(dir, 'recordings');
  await a.tg.startRecording(chat, { dir: folder });
  const pcm = Buffer.alloc(9600); for (let i = 0; i < 4800; i++) pcm.writeInt16LE(1234, i * 2);
  a.events.get('frames')!(chat, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 71n, data: pcm }]);
  await a.tg.flushState();
  const saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(saved.groups.length, 1);
  assert.equal(saved.groups[0].chatId, chat.toString());
  assert.equal(saved.groups[0].playlist.queue[0].path, '/fixtures/second.mp3');
  assert.equal(saved.groups[0].playlist.hold.path, '/fixtures/hold.mp3');
  assert.equal(saved.groups[0].paused, true);
  assert.equal(saved.groups[0].join.muted, true);
  assert.equal('ssrc' in saved.groups[0], false);
  await a.tg.dispose({ preserveState: true });
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).groups.length, 1, 'planned restart retains desired group');

  const oldManifest = await fs.readFile(path.join(folder, 'manifest.json'));
  const oldFiles = (await fs.readdir(folder)).filter((file) => file.endsWith('.wav'));
  assert.equal(oldFiles.length, 1);
  const oldWav = await fs.readFile(path.join(folder, oldFiles[0]));
  const b = client();
  assert.deepEqual(b.tg.activeCalls(), [], 'constructing a client never auto-joins');
  const report = await b.tg.resumeFromState();
  assert.deepEqual(report.restored, [chat]);
  assert.deepEqual(report.failed, []);
  assert.notEqual(b.tg.getCall(chat)?.ssrc, first.ssrc, 'resume allocates a fresh SSRC');
  assert.equal(b.tg.getQueue(chat)[0]?.kind, 'file');
  assert.equal(b.tg.getCall(chat)?.muted, true);
  assert.ok(b.order.indexOf('pause') < b.order.indexOf('connect'), 'restore pauses capture BEFORE connecting');
  assert.ok(b.order.indexOf('mute') < b.order.indexOf('connect'), 'restore mutes native BEFORE connecting');
  const nextFolder = b.tg.getRecording(chat)!.path;
  assert.notEqual(nextFolder, folder);
  assert.ok(path.basename(nextFolder).startsWith('resume-1-'));
  b.events.get('frames')!(chat, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 71n, data: pcm }]);
  await b.tg.leave(chat);
  assert.deepEqual(await fs.readFile(path.join(folder, 'manifest.json')), oldManifest);
  assert.deepEqual(await fs.readFile(path.join(folder, oldFiles[0])), oldWav, 'previous segment survives resume unchanged');
  assert.equal(JSON.parse(await fs.readFile(path.join(nextFolder, 'manifest.json'), 'utf8')).segments.length, 1);
  assert.equal(JSON.parse(await fs.readFile(statePath, 'utf8')).groups.length, 0, 'explicit leave removes saved desired group');
  await b.tg.dispose();
  console.log('Client persistence facade: snapshot, preserved dispose, fresh safe resume and explicit leave passed.');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
