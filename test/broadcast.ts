import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MediaSegmentPartStatus, MediaSegmentQuality } from 'ntgcalls';
import { BroadcastController, type BroadcastChunkRequest, type BroadcastNativePort } from '../src/broadcast.js';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test('broadcast timestamp forwards raw milliseconds once and safely handles empty channels', async () => {
  const { controller, timestamps, adapter } = fixture();
  const first = controller.requestTimestamp();
  const duplicate = controller.requestTimestamp();
  await Promise.all([first, duplicate]);
  assert.deepEqual(timestamps, [9_876_543n], 'native performs rounding and buffering itself');
  adapter.getStreamChannels = async () => [];
  await controller.requestTimestamp();
  assert.deepEqual(timestamps, [9_876_543n, 0n]);
  await controller.stop();
});

test('broadcast paginates full RPC pages by byte offset and refuses capped or redirected parts', async () => {
  const { controller, parts, adapter } = fixture({ maxPartBytes: 2 * 1048576 });
  const offsets: bigint[] = [];
  adapter.downloadStreamChunk = async (_call, chunk, dc) => {
    assert.equal(dc, 4); offsets.push(chunk.offset);
    return { bytes: Buffer.alloc(chunk.offset === 0n ? chunk.limit : 17, chunk.offset === 0n ? 1 : 2) };
  };
  await controller.requestPart(request());
  assert.deepEqual(offsets, [0n, 1048576n]);
  assert.equal(parts[0][5].length, 1048576 + 17);
  assert.equal(parts[0][5].at(-1), 2);
  adapter.downloadStreamChunk = async () => ({ bytes: Buffer.alloc(1048576) });
  await controller.requestPart(request({ partId: 10 }));
  assert.equal(parts[1][3], MediaSegmentPartStatus.RESYNC_NEEDED);
  assert.equal(parts[1][5].length, 0, 'a cap must not report truncated SUCCESS');
  adapter.downloadStreamChunk = async () => ({ redirect: { dcId: 9 } }) as never;
  await controller.requestPart(request({ partId: 11 }));
  assert.equal(parts[2][3], MediaSegmentPartStatus.RESYNC_NEEDED);
  await controller.stop();
});

test('broadcast maps transient/fatal RPC errors and serializes a bounded fresh rejoin', async () => {
  const errors: Error[] = [];
  let rejoins = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const joinedCall = { id: 90n };
  const { controller, parts, adapter } = fixture({
    onError: (error: Error) => errors.push(error),
    maxRejoins: 1,
    rejoin: async (signal: AbortSignal) => {
      rejoins++; assert.equal(signal.aborted, false); await gate;
      return { call: joinedCall, dcId: 5 };
    },
  });
  for (const message of ['TIME_TOO_BIG', 'FLOOD_WAIT_60']) {
    adapter.downloadStreamChunk = async () => { throw Object.assign(new Error(message), { errorMessage: message }); };
    await controller.requestPart(request());
    assert.equal(parts.at(-1)![3], MediaSegmentPartStatus.NOT_READY);
  }
  adapter.downloadStreamChunk = async () => { throw new Error('GROUPCALL_JOIN_MISSING'); };
  const a = controller.requestPart(request({ partId: 11 }));
  const b = controller.requestPart(request({ partId: 12 }));
  await turn();
  assert.equal(rejoins, 1);
  release();
  await Promise.all([a, b]);
  assert.equal(parts.length, 4);
  assert.ok(parts.slice(2).every(part => part[3] === MediaSegmentPartStatus.RESYNC_NEEDED));
  adapter.downloadStreamChunk = async (call, _chunk, dc) => {
    assert.strictEqual(call, joinedCall); assert.equal(dc, 5); return { bytes: Buffer.of(3) };
  };
  await controller.requestPart(request({ partId: 13 }));
  assert.equal(parts.at(-1)![3], MediaSegmentPartStatus.SUCCESS);
  adapter.downloadStreamChunk = async () => { throw new Error('GROUPCALL_FORBIDDEN'); };
  await controller.requestPart(request({ partId: 14 }));
  assert.equal(rejoins, 1, 'rejoin budget is finite even after successful parts');
  assert.equal(parts.at(-1)![3], MediaSegmentPartStatus.RESYNC_NEEDED);
  assert.ok(errors.length > 0);
  await controller.stop();
});

test('broadcast timeout, stop, duplicate, capacity and stale completions terminate active requests exactly once', async () => {
  const { controller, parts, adapter } = fixture({ requestTimeoutMs: 25, maxConcurrentRequests: 1 });
  let complete!: (value: { bytes: Buffer<ArrayBuffer> }) => void;
  let signal!: AbortSignal;
  adapter.downloadStreamChunk = (_call, _chunk, _dc, abort) => {
    signal = abort; return new Promise(resolve => { complete = resolve; });
  };
  const a = controller.requestPart(request());
  const duplicate = controller.requestPart(request());
  await controller.requestPart(request({ partId: 10 }));
  assert.equal(parts[0][3], MediaSegmentPartStatus.NOT_READY);
  await Promise.all([a, duplicate]);
  assert.equal(signal.aborted, true);
  assert.equal(parts.length, 2);
  assert.equal(parts[1][3], MediaSegmentPartStatus.RESYNC_NEEDED);
  complete({ bytes: Buffer.of(8) });
  await turn();
  assert.equal(parts.length, 2);

  const b = controller.requestPart(request({ partId: 11 }));
  await controller.stop();
  await b;
  assert.equal(parts.length, 3);
  assert.equal(parts[2][3], MediaSegmentPartStatus.RESYNC_NEEDED);
  complete({ bytes: Buffer.of(9) });
  await turn();
  await controller.requestPart(request({ partId: 12 }));
  assert.equal(parts.length, 3, 'callbacks after stop must not touch a stopped native handle');
});

test('broadcast reports timestamp/native errors, aborts timestamp work and rejects invalid DC before work', async () => {
  const errors: Error[] = [];
  const { controller, adapter, timestamps } = fixture({ requestTimeoutMs: 25, onError: (error: Error) => errors.push(error) });
  adapter.getStreamChannels = async () => { throw new Error('media DC unavailable'); };
  await controller.requestTimestamp();
  assert.deepEqual(timestamps, [0n]);
  assert.match(errors[0].message, /media DC unavailable/);
  adapter.getStreamChannels = async () => new Promise(() => {});
  const pending = controller.requestTimestamp();
  await controller.stop();
  await pending;
  assert.deepEqual(timestamps, [0n, 0n], 'active timestamp receives its terminal value before teardown');
  assert.throws(() => fixture({ dcId: 0 }), /DC/i);
  const broken = fixture({ native: {
    async sendBroadcastPart() { throw new Error('native stopped unexpectedly'); },
    async sendBroadcastTimestamp() {},
  } });
  await assert.rejects(broken.controller.requestPart(request()), /native stopped/);
  await broken.controller.stop();
});

test('broadcast rejoin drains timestamp work before parent teardown and remains bounded when the hook hangs', async () => {
  let timestampDone = false;
  let drainedBeforeRejoin = false;
  let rejoins = 0;
  const { controller, timestamps, adapter } = fixture({
    requestTimeoutMs: 20,
    maxRejoins: 1,
    rejoin: async () => {
      rejoins++;
      drainedBeforeRejoin = timestampDone && timestamps.length === 1 && timestamps[0] === 0n;
      return new Promise(() => {});
    },
    onError() {},
  });
  adapter.getStreamChannels = async () => new Promise(() => {});
  const timestamp = controller.requestTimestamp().then(() => { timestampDone = true; });
  adapter.downloadStreamChunk = async () => { throw new Error('GROUPCALL_JOIN_MISSING'); };
  await controller.requestPart(request());
  await timestamp;
  assert.equal(rejoins, 1);
  assert.equal(drainedBeforeRejoin, true, 'timestamp must receive terminal reply before parent rejoin');
  await controller.stop();
});

test('broadcast timestamp membership errors receive zero before a bounded fresh rejoin', async () => {
  let rejoins = 0;
  const nextCall = { id: 112n };
  const { controller, adapter, timestamps } = fixture({
    rejoin: async () => { rejoins++; assert.deepEqual(timestamps, [0n]); return { call: nextCall, dcId: 5 }; },
    onError() {},
  });
  adapter.getStreamChannels = async () => { throw new Error('GROUPCALL_FORBIDDEN'); };
  await controller.requestTimestamp();
  assert.equal(rejoins, 1);
  adapter.getStreamChannels = async (call, dc) => {
    assert.strictEqual(call, nextCall); assert.equal(dc, 5);
    return [{ channel: 1, lastTimestampMs: 777n }];
  };
  await controller.requestTimestamp();
  assert.deepEqual(timestamps, [0n, 777n]);
  await controller.close();
});

const request = (overrides = {}) => ({
  segmentId: 7001n, partId: 9, timestamp: 1_234_567n, limit: 131072,
  qualityUpdate: true, channelId: 1, quality: MediaSegmentQuality.FULL, ...overrides,
});
function fixture(extra = {}) {
  const parts: Parameters<BroadcastNativePort['sendBroadcastPart']>[] = [];
  const timestamps: bigint[] = [];
  const reads: Array<{ call: unknown; request: BroadcastChunkRequest; dc: number; signal: AbortSignal }> = [];
  const call = { id: 88n, accessHash: 99n };
  const native: BroadcastNativePort = {
    async sendBroadcastPart(...args) { parts.push(args); },
    async sendBroadcastTimestamp(_handle, timestamp) { timestamps.push(timestamp); },
  };
  const adapter = {
    async getStreamChannels(_call: unknown, dc: number, _signal: AbortSignal) {
      assert.equal(dc, 4); return [{ channel: 1, lastTimestampMs: 9_876_543n }];
    },
    async downloadStreamChunk(inputCall: unknown, chunk: BroadcastChunkRequest, dc: number, signal: AbortSignal) {
      reads.push({ call: inputCall, request: chunk, dc, signal });
      return { bytes: Buffer.alloc(256 * 1024, 7) };
    },
  };
  const errors: Error[] = [];
  const controller = new BroadcastController({ handle: -10077n, call, dcId: 4, native, adapter, onError: error => errors.push(error), ...extra });
  return { controller, parts, timestamps, reads, adapter, call, errors };
}

test('broadcast downloads a complete >128KiB part from the exact media DC with TL quality mapping', async () => {
  const { controller, parts, reads, call } = fixture();
  for (const [quality, expected] of [[MediaSegmentQuality.THUMBNAIL, 0], [MediaSegmentQuality.MEDIUM, 1], [MediaSegmentQuality.FULL, 2]] as const) {
    await controller.requestPart(request({ quality }));
    assert.equal(reads.length, parts.length, 'each request must perform a download before its terminal reply');
    assert.ok(reads.length > 0, 'request must download a part');
    const read = reads.at(-1)!;
    assert.strictEqual(read.call, call);
    assert.equal(read.dc, 4);
    assert.deepEqual(read.request, { timeMs: 1_234_567n, scale: 0, videoChannel: 1, videoQuality: expected, offset: 0n, limit: 1048576 });
    const part = parts.at(-1)!;
    assert.deepEqual(part.slice(0, 5), [-10077n, 7001n, 9, MediaSegmentPartStatus.SUCCESS, true]);
    assert.ok(Array.isArray(part[5]), 'native bytes require a JS Array');
    assert.equal(part[5].length, 256 * 1024, 'native limit does not truncate a media part');
  }
  await controller.requestPart(request({ quality: MediaSegmentQuality.NONE, channelId: 0 }));
  assert.deepEqual(reads.at(-1)!.request, { timeMs: 1_234_567n, scale: 0, offset: 0n, limit: 1048576 });
  await controller.stop();
});
