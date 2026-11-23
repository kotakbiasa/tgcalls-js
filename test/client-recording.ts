import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConnectionMode, StreamMode, StreamDevice, StreamStatus } from 'ntgcalls';
import { TgCallsClient } from '../src/index.js';

const dir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-client-folder-'));
const chat = -1001112223334n;
const call = { id: 7654321n, accessHash: 8n };
let update: (value: unknown) => void = () => {};
let frames: (...args: any[]) => void = () => {};
let frameRegistrations = 0;
let snapshotPages = 0;
const sourceEvents: any[] = [], stopped: any[] = [], trace: any[] = [];
const peerA = { peer: { kind: 'user', id: 21n }, source: 101 };
const peerB = { peer: { kind: 'channel', id: 21n }, source: 202 };
const adapter: any = {
  isAdapter: true, resolveChatId: async (id: bigint) => id,
  getGroupCall: async () => call,
  getGroupCallInfo: async () => ({ call, id: call.id, accessHash: call.accessHash, version: 1, conference: false, rtmpStream: false }),
  getParticipants: async (_call: unknown, opts: any) => {
    snapshotPages++;
    if (opts.offset === '') return { participants: [peerA], version: 1, nextOffset: 'second', count: 2 };
    return { participants: [peerB], version: 1, nextOffset: '', count: 2 };
  },
  normalizeParticipants: (value: any) => value,
  joinGroupCall: async () => ({ params: '{"transport":"fixture"}' }),
  leaveGroupCall: async () => {trace.push('leave');},
  joinPresentationCall: async () => {}, leavePresentationCall: async () => {},
  extractConnectionParams: (value: any) => value.params,
  installUpdateHandler: (cb: any) => {update = cb; return () => {};}, dispose: () => {},
};
const tg = new TgCallsClient({ client: adapter });
for (const [name, fn] of Object.entries({
  createCall: async () => '{"ssrc":999}', connect: async () => {},
  setStreamSources: async (_id: bigint, mode: number, media: any) => { trace.push({ mode, media }); },
  stop: async () => {trace.push('native.stop');}, mute: async () => true,
  getConnectionMode: async () => ConnectionMode.RTC,
  onStreamEnd: () => {}, onConnectionChange: () => {}, onRemoteSourceChange: () => {},
  onFrames: (fn: any) => {frames = fn; frameRegistrations++;},
  addIncomingVideo: async () => 777, removeIncomingVideo: async () => true,
})) Object.defineProperty(tg.ntg, name, { configurable: true, value: fn });
try {
  tg.on('recordingStopped', (_id: bigint, info: any) => {stopped.push(info);});
  tg.on('remoteSourceChange', (_id: bigint, info: any) => {sourceEvents.push(info);});
  await tg.joinIdle(chat);
  await tg.startRecording(chat, { dir, video: false });
  assert.equal(snapshotPages, 2, 'folder start paginates the actual adapter');
  assert.equal(tg.getRecording(chat)?.mode, 'folder');
  assert.equal(frameRegistrations, 1, 'router owns the native frame callback');
  const a = Buffer.alloc(9600), b = Buffer.alloc(9600);
  for (let i = 0; i < 4800; i++) { a.writeInt16LE(1000, i * 2); b.writeInt16LE(-2000, i * 2); }
  frames(chat, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 101n, data: a }, { ssrc: 202n, data: b }]);
  update({ _: 'updateGroupCallParticipants', call, version: 2,
    participants: [{ ...peerA, left: true, versioned: true }] });
  const savedDir = await tg.stopRecording(chat);
  assert.equal(savedDir, dir);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.segments.length, 2);
  const saved = stopped.filter((value) => value.status === 'saved');
  assert.equal(saved.length, 2);
  const values: Record<string, number> = {};
  for (const item of saved) {
    const wav = await fs.readFile(item.path);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    values[item.peer.kind] = wav.readInt16LE(44);
  }
  assert.deepEqual(values, { user: 1000, channel: -2000 });
  assert.ok(sourceEvents.some((value) => value.origin === 'mtproto' && value.peer?.kind === 'user'
    && value.state === StreamStatus.IDLING), 'participant departure produces an attributed stream event');
  assert.equal(tg.isRecording(chat), false);
  await tg.startRecording(chat, { dir: path.join(dir, 'second'), video: false });
  frames(chat, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 202n, data: b }]);
  await tg.leave(chat);
  assert.equal(stopped.filter((value) => value.status === 'saved').length, 3, 'leave finalizes folder before native teardown');
  assert.equal(frameRegistrations, 1, 'new recorder reuses the router');
  await tg.dispose();
  console.log('Client folder recording: paginated peers, separated WAVs, attributed events, exclusive sink and leave finalization passed.');
} finally { await tg.dispose(); await fs.rm(dir, { recursive: true, force: true }); }
