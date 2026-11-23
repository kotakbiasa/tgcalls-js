import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ConnectionState, StreamDevice, StreamMode } from 'ntgcalls';
import { P2PCallManager, type CallRecordingStopped } from '../src/calls.js';

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-p2p-finalization-'));
const tick = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

function makeHarness(opts: {
  record?: string | { path: string; video?: boolean | { width?: number; height?: number; fps?: number } };
  ffmpegPath?: string;
  failConfirm?: boolean;
  failConnect?: boolean;
} = {}) {
  let onCall: ((call: any) => void) | undefined;
  let onFrames: ((chat: bigint, mode: StreamMode, device: StreamDevice, frames: any[]) => void) | undefined;
  const order: string[] = [];
  const stoppedEvents: Array<{ peerId: bigint; info: CallRecordingStopped }> = [];
  const states: Array<{ peerId: bigint; state: ConnectionState }> = [];
  let pcmCommand: string | undefined;

  const native = {
    onSignalingData: () => {},
    onFrames: (cb: typeof onFrames) => { onFrames = cb; },
    createP2pCall: async (id: bigint) => { order.push(`create:${id}`); },
    setStreamSources: async (_id: bigint, mode: StreamMode, media: any) => {
      if (mode === StreamMode.PLAYBACK) {
        if (Object.keys(media).length === 0) {
          order.push('playback:close');
        } else {
          pcmCommand = media.microphone?.input;
          order.push('playback:open');
        }
      }
    },
    initExchange: async () => Buffer.alloc(32, 1),
    exchangeKeys: async () => ({ keyFingerprint: 33n, gAOrB: Buffer.alloc(256, 2) }),
    connectP2p: async () => {
      if (opts.failConnect) {throw new Error('connectP2p transport error');}
      order.push('connectP2p');
    },
    sendSignalingData: async () => {},
    unmute: async () => {},
    resume: async () => {},
    stop: async (id: bigint) => { order.push(`stop:${id}`); },
  };

  let nextCallId = 500n;
  const adapter = {
    isAdapter: true,
    getDhConfig: async () => ({ g: 3, p: Buffer.alloc(256, 3), random: Buffer.alloc(256, 4) }),
    requestCall: async () => ({ phoneCall: { id: nextCallId++, accessHash: 88n }, users: [] }),
    confirmCall: async (id: bigint) => {
      if (opts.failConfirm) {throw new Error('confirmCall RPC failure');}
      return {
        phoneCall: { id, accessHash: 88n, connections: [], protocol: { libraryVersions: ['8.0.0'] } },
        users: [],
      };
    },
    acceptCall: async () => {},
    discardCall: async (id: bigint) => { order.push(`discard:${id}`); },
    sendSignalingData: async () => {},
    installCallHandler: (cb: (call: unknown) => void) => {
      onCall = cb;
      return () => {};
    },
  };

  const manager = new P2PCallManager(
    native as never,
    adapter as never,
    {
      source: { kind: 'file', path: '/unused-fixture.mp3' },
      record: opts.record,
      ffmpegPath: opts.ffmpegPath,
      logger: { error: () => {} },
    },
    (peerId, state) => states.push({ peerId, state }),
    undefined,
    (peerId, info) => stoppedEvents.push({ peerId, info }),
  );
  manager.start();
  return {
    manager,
    order,
    stoppedEvents,
    states,
    getPcmCommand: () => pcmCommand,
    emitCall: (pc: unknown) => onCall!(pc),
    emitFrames: (peerId: bigint, frames: any[]) => onFrames!(peerId, StreamMode.PLAYBACK, StreamDevice.CAMERA, frames),
  };
}

try {
  // 1. Reject .webm container because P2P muxer uses H.264/AAC
  assert.throws(
    () => makeHarness({ record: path.join(dir, 'invalid.webm') }),
    /webm/i,
    '.webm container must be rejected for H.264/AAC P2P recording',
  );
  {
    const h = makeHarness();
    await assert.rejects(
      () => h.manager.call(10n, { record: path.join(dir, 'call.webm') }),
      /webm/i,
      'per-call .webm override is rejected',
    );
    await h.manager.stop();
  }

  // 2. Zero video frames -> status: 'empty' (never falsely reported as 'saved'), audio recovery file retained
  {
    const outMp4 = path.join(dir, 'no-video.mp4');
    const h = makeHarness();
    await h.manager.call(20n, { record: { path: outMp4, video: true } });
    h.emitCall({ _: 'phoneCallAccepted', id: 500n, gB: Buffer.alloc(256) });
    await tick();
    // Write intermediate audio file to verify it is retained when video is empty
    fs.writeFileSync(`${outMp4}.audio.wav`, Buffer.from('RIFF-audio-recovery'));
    h.emitCall({ _: 'phoneCallDiscarded', id: 500n });
    // Duplicate discard + stop must dedupe teardown and finalization
    h.emitCall({ _: 'phoneCallDiscarded', id: 500n });
    await tick();
    await h.manager.stop();

    assert.equal(h.stoppedEvents.length, 1, 'recordingStopped fires exactly once despite duplicate discard/stop');
    assert.equal(h.stoppedEvents[0]!.peerId, 20n);
    assert.equal(h.stoppedEvents[0]!.info.status, 'empty', 'zero video frames reports empty, not saved');
    assert.equal(h.stoppedEvents[0]!.info.device, 'camera');
    assert.equal(fs.existsSync(outMp4), false, 'no bogus mp4 created when 0 video frames arrived');
    assert.equal(fs.existsSync(`${outMp4}.audio.wav`), true, 'intermediate audio file retained when video is empty');
    assert.equal(h.order.filter((x) => x === 'discard:500').length, 1, 'remote discard deduped');
  }

  // 3. Mux failure -> status: 'failed', error observable, raw I420 + audio recovery files retained
  {
    const outMp4 = path.join(dir, 'mux-fail.mp4');
    const h = makeHarness({ ffmpegPath: '/bin/false' });
    await h.manager.call(30n, { record: { path: outMp4, video: { fps: 25 } } });
    h.emitCall({ _: 'phoneCallAccepted', id: 500n, gB: Buffer.alloc(256) });
    await tick();
    fs.writeFileSync(`${outMp4}.audio.wav`, Buffer.from('RIFF-recovery-audio'));
    const frame = Buffer.alloc(16 * 16 * 3 / 2, 100);
    h.emitFrames(30n, [{ data: frame, frameData: { width: 16, height: 16 } }]);
    await h.manager.stop();

    assert.equal(h.stoppedEvents.length, 1);
    assert.equal(h.stoppedEvents[0]!.info.status, 'failed');
    assert.ok(h.stoppedEvents[0]!.info.error instanceof Error, 'mux error attached to CallRecordingStopped');
    assert.equal(fs.existsSync(`${outMp4}.video.i420`), true, 'raw I420 retained on mux failure');
    assert.equal(fs.existsSync(`${outMp4}.audio.wav`), true, 'audio wav retained on mux failure');
  }

  // 4. Failed confirm/transport after p2pStarted claimed cleans up session, stops native, discards remote, frees peer & record path
  {
    const outWav = path.join(dir, 'failed-setup.wav');
    const h = makeHarness({ failConfirm: true });
    await h.manager.call(40n, { record: outWav });
    h.emitCall({ _: 'phoneCallAccepted', id: 500n, gB: Buffer.alloc(256) });
    await tick();

    assert.deepEqual(h.manager.activePeers(), [], 'failed confirm cleans up active peer session');
    assert.ok(h.order.includes('stop:40'), 'native slot stopped on confirm failure');
    assert.ok(h.order.includes('discard:500'), 'remote call discarded on confirm failure');
    assert.equal(h.stoppedEvents.length, 1);
    assert.equal(h.stoppedEvents[0]!.info.status, 'failed');

    // Peer 40n and recording path outWav are no longer locked: a new call can reuse both
    const h2 = makeHarness();
    const nextId = await h2.manager.call(40n, { record: outWav });
    assert.equal(nextId, 500n);
    await h2.manager.stop();
  }

  // 5. Real H.264/AAC mux success -> status: 'saved', recovery files cleaned, ffprobe verified
  {
    const outMp4 = path.join(dir, 'saved-final.mp4');
    const h = makeHarness();
    await h.manager.call(50n, { record: { path: outMp4, video: { fps: 25 } } });
    h.emitCall({ _: 'phoneCallAccepted', id: 500n, gB: Buffer.alloc(256) });
    await tick();

    const pcm = Buffer.alloc(48000 * 2);
    for (let i = 0; i < 48000; i++) {
      pcm.writeInt16LE(Math.round(Math.sin((i * 440 * 2 * Math.PI) / 48000) * 4000), i * 2);
    }
    const audioRes = spawnSync('sh', ['-c', h.getPcmCommand()!], { input: pcm, timeout: 15000 });
    assert.equal(audioRes.status, 0, audioRes.stderr?.toString());

    const frame = Buffer.alloc((16 * 16 * 3) / 2, 128);
    for (let i = 0; i < 25; i++) {
      h.emitFrames(50n, [{ data: frame, frameData: { width: 16, height: 16 } }]);
    }
    await h.manager.stop();

    assert.equal(h.stoppedEvents.length, 1);
    assert.equal(h.stoppedEvents[0]!.info.status, 'saved');
    assert.equal(h.stoppedEvents[0]!.info.path, outMp4);
    assert.equal(fs.existsSync(outMp4), true);
    assert.equal(fs.existsSync(`${outMp4}.video.i420`), false);
    assert.equal(fs.existsSync(`${outMp4}.audio.wav`), false);
  }

  console.log('P2P finalization (recordingStopped callback, .webm rejection, empty/failed retention, setup-error cleanup) passed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
