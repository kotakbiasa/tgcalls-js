import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { StreamDevice, StreamMode } from 'ntgcalls';
import { P2PCallManager } from '../src/calls.js';

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-out-record-'));
const outPath = path.join(dir, 'outgoing.mp4');
const order: string[] = [];
let onCall: ((call: any) => void) | undefined;
let onFrames: ((chat: bigint, mode: StreamMode, device: StreamDevice, frames: any[]) => void) | undefined;
let hasVideoWriter = false;
let pcmWriter: string | undefined;
const native = {
  onSignalingData: () => {},
  onFrames: (cb: typeof onFrames) => {onFrames = cb;},
  createP2pCall: async () => {},
  setStreamSources: async (_id: bigint, mode: StreamMode, media: any) => {
    if (mode !== StreamMode.PLAYBACK) {return;}
    if (media.camera) {
      hasVideoWriter = true;
      pcmWriter = media.microphone.input;
      order.push('writer-start');
    } else if (Object.keys(media).length === 0) {order.push('writer-close');}
  },
  initExchange: async () => Buffer.alloc(32),
  exchangeKeys: async () => ({ keyFingerprint: 33n, gAOrB: Buffer.alloc(256) }),
  connectP2p: async () => {}, sendSignalingData: async () => {}, unmute: async () => {}, resume: async () => {},
  stop: async () => {order.push('stop');},
};
const adapter = {
  isAdapter: true,
  getDhConfig: async () => ({ g: 3, p: Buffer.alloc(256), random: Buffer.alloc(256) }),
  requestCall: async () => ({ phoneCall: { id: 99n, accessHash: 88n }, users: [] }),
  confirmCall: async () => ({ phoneCall: { id: 99n, accessHash: 88n, connections: [], protocol: { libraryVersions: ['8.0.0'] } }, users: [] }),
  acceptCall: async () => {}, discardCall: async () => {}, sendSignalingData: async () => {},
  installCallHandler: (cb: (call: unknown) => void) => {onCall = cb; return () => {};},
};
const errors: unknown[][] = [];
const manager = new P2PCallManager(native as never, adapter as never, {
  source: { kind: 'file', path: '/unused-fixture.mp3' },
  logger: { error: (...args) => errors.push(args) },
});
try {
  manager.start();
  await manager.call(77n, { record: { path: outPath, video: { fps: 25 } } });
  onCall!({ _: 'phoneCallAccepted', id: 99n, gB: Buffer.alloc(256) });
  for (let i = 0; i < 8; i++) {await new Promise<void>((resolve) => setImmediate(resolve));}
  assert.equal(hasVideoWriter, true, 'per-call recording starts the outgoing PLAYBACK camera');
  assert.ok(pcmWriter, 'outgoing remote audio writer is configured');
  // Exercise the actual ffmpeg writer command with 1 second of synthetic PCM.
  // No native worker has been created by this stub, so process spawning is safe.
  const pcm = Buffer.alloc(48000 * 2);
  for (let i = 0; i < 48000; i++) {pcm.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / 48000) * 5000), i * 2);}
  const audio = spawnSync('sh', ['-c', pcmWriter!], { input: pcm, timeout: 15000 });
  assert.equal(audio.status, 0, audio.stderr?.toString());
  const frame = Buffer.alloc(16 * 16 * 3 / 2, 128);
  frame.fill(80, 0, 16 * 16);
  for (let i = 0; i < 25; i++) {
    onFrames!(77n, StreamMode.PLAYBACK, StreamDevice.CAMERA, [{ data: frame, frameData: { width: 16, height: 16 } }]);
  }
  await manager.stop();
  assert.ok(order.indexOf('writer-close') < order.indexOf('stop'), 'writer closes before stopping native call');
  assert.ok(fs.existsSync(outPath), 'outgoing recording is finalized to a real file');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', outPath], { encoding: 'utf8', timeout: 15000 });
  assert.equal(probe.status, 0, probe.stderr);
  const media = JSON.parse(probe.stdout);
  assert.ok(media.streams.some((s: any) => s.codec_name === 'h264'), 'recording has playable H264 video');
  assert.ok(media.streams.some((s: any) => s.codec_name === 'aac'), 'recording has AAC audio');
  assert.ok(Number(media.format.duration) >= 0.9);
  assert.equal(fs.existsSync(`${outPath}.video.i420`), false, 'raw video is cleaned after successful mux');
  assert.equal(fs.existsSync(`${outPath}.audio.wav`), false, 'intermediate audio is cleaned');
  assert.ok(!errors.some((a) => String(a[0]).includes('failed')), 'recording did not hide a writer or mux error');
  console.log('Outgoing recording finalized: H264 + AAC, 1 second; source is synthetic test media.');
} finally {
  await manager.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}
