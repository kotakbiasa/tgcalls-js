import assert from 'node:assert/strict';
import { TgCallsClient } from '../src/index.js';
import { ConnectionMode, MediaSegmentQuality, MediaSegmentPartStatus, StreamMode } from 'ntgcalls';
const chat = -1002223334445n;
const call = { id: 41n, accessHash: 42n };
let params = '{"stream":true,"rtmp":true}';
const callbacks = new Map<string, Function>(), trace: any[] = [];
let creates = 0;
const adapter: any = {
  isAdapter: true, resolveChatId: async (id: bigint) => id,
  getGroupCall: async (_id: bigint, create: boolean) => {trace.push(['lookup', create]); if (create) creates++; return call;},
  getParticipants: async () => ({ participants: [], version: 1, nextOffset: '', count: 0 }),
  getGroupCallInfo: async () => ({ call, id: 41n, accessHash: 42n, rtmpStream: true, conference: false, streamDcId: 4, version: 1 }),
  joinGroupCall: async (_call: unknown, payload: string, opts: any) => {trace.push(['join', payload, opts]); return { params };},
  leaveGroupCall: async (_call: unknown, source: number) => {trace.push(['leave', source]);},
  joinPresentationCall: async () => {}, leavePresentationCall: async () => {},
  extractConnectionParams: (value: any) => value.params,
  installUpdateHandler: () => () => {}, dispose: () => {},
  getStreamChannels: async (_call: unknown, dc: number) => {trace.push(['channels', dc]); return [{ channel: 1, lastTimestampMs: 12345n }];},
  downloadStreamChunk: async (_call: unknown, req: any, dc: number) => {trace.push(['download', req, dc]); return { bytes: new Uint8Array([1, 2, 3]) };},
};
const tg = new TgCallsClient({ client: adapter });
for (const [name, value] of Object.entries({
  createCall: async (id: bigint) => {trace.push(['native.create', id]); return '{"ssrc":700}';},
  connect: async (id: bigint, value: string) => {trace.push(['connect', id, value]);},
  stop: async (id: bigint) => {trace.push(['stop', id]);},
  mute: async () => true, pause: async () => true,
  getConnectionMode: async () => params.includes('stream') ? ConnectionMode.RTMP : ConnectionMode.RTC,
  setStreamSources: async (id: bigint, mode: number, media: any) => {trace.push(['source', id, mode, media]);},
  sendBroadcastPart: async (...args: any[]) => {trace.push(['reply', ...args]);},
  sendBroadcastTimestamp: async (...args: any[]) => {trace.push(['timestamp', ...args]);},
  onStreamEnd: (cb: Function) => callbacks.set('end', cb),
  onConnectionChange: (cb: Function) => callbacks.set('connection', cb),
  onRemoteSourceChange: () => {},
  onRequestBroadcastPart: (cb: Function) => callbacks.set('part', cb),
  onRequestBroadcastTimestamp: (cb: Function) => callbacks.set('timestamp', cb),
})) Object.defineProperty(tg.ntg, name, { configurable: true, value });
try {
  assert.equal(typeof tg.joinStreamMode, 'function', 'facade must expose stream viewer');
  const result = await tg.joinStreamMode(chat);
  assert.equal(result.mode, 'RTMP');
  assert.equal(creates, 0, 'viewer does not create a call');
  const handle = trace.find((value) => value[0] === 'native.create')[1];
  callbacks.get('timestamp')!(handle);
  callbacks.get('part')!(handle, { segmentId: 17n, partId: 9, timestamp: 12000n, quality: MediaSegmentQuality.NONE, channelId: 0, limit: 131072, qualityUpdate: false });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(trace.find((value) => value[0] === 'timestamp').slice(1), [handle, 12345n]);
  const download = trace.find((value) => value[0] === 'download');
  assert.equal(download[2], 4); assert.equal(download[1].limit, 1048576);
  assert.deepEqual(trace.find((value) => value[0] === 'reply').slice(1), [handle, 17n, 9, MediaSegmentPartStatus.SUCCESS, false, [1, 2, 3]]);
  assert.ok(trace.find((value) => value[0] === 'source' && value[2] === StreamMode.PLAYBACK)[3].microphone);
  await assert.rejects(() => tg.startRecording(chat, { dir: '/must-not-create-rtmp-folder' }), /RTMP/);
  await tg.leave(chat);
  assert.equal(trace.filter((value) => value[0] === 'leave').length, 1);
  params = '{"transport":"fixture"}';
  await assert.rejects(() => tg.joinStreamMode(chat), /stream/i);
  assert.equal(tg.isActive(chat), false);
  assert.equal(trace.filter((value) => value[0] === 'leave').length, 2, 'RTC refusal cleans membership');
  const fallback = await tg.joinStreamMode(chat, { requireStream: false });
  assert.equal(fallback.mode, 'RTC');
  await tg.leave(chat);
  const publisher = await tg.joinRtmp(chat, 'rtmp://localhost/live', 'fixture-key');
  assert.equal(publisher.state, 'ready');
  await publisher.close();
  assert.equal(creates, 0);
  console.log('Client broadcast facade: DC download, router replies, native playback, RTC refusal/cleanup and RTMP ready target passed.');
} finally { await tg.dispose(); }
