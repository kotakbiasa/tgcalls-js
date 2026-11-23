import assert from 'node:assert/strict';
import { MediaSource, StreamDevice, StreamMode } from 'ntgcalls';
import {
  TgCallsClient,
  audioDescription,
  pushExternalAudioFrame,
  pushExternalVideoFrame,
  type ExternalAudioFrame,
} from '../src/index.js';

// 1. audioDescription({ kind: 'external' }) requires zero ffmpeg binary
{
  const desc = audioDescription(
    { kind: 'external', sampleRate: 48000, channels: 1 },
    { client: {} as never, ffmpegPath: '/nonexistent-ffmpeg-binary' },
  );
  assert.equal(desc.mediaSource, MediaSource.EXTERNAL);
  assert.equal(desc.sampleRate, 48000);
  assert.equal(desc.channelCount, 1);
  assert.equal(desc.keepOpen, true);
}

// 2. pushExternalAudioFrame 10ms slicing, JS Array N-API boundary, and validation
{
  const sent: Array<{ id: bigint; device: StreamDevice; data: unknown; frameData: any }> = [];
  const fakeNative = {
    sendExternalFrame: async (id: bigint, device: StreamDevice, data: Buffer, frameData: any) => {
      sent.push({ id, device, data, frameData });
    },
  };

  // 25ms @ 48kHz mono s16le = 2400 bytes -> 3 x 10ms (960 bytes each, last padded)
  const pcm25ms = Buffer.alloc(2400, 0x11);
  await pushExternalAudioFrame(fakeNative, -1001n, pcm25ms, {
    sampleRate: 48000,
    channels: 1,
    timestampMs: 1000n,
  });
  assert.equal(sent.length, 3, '25ms buffer is sliced into 3 x 10ms frames');
  for (let i = 0; i < 3; i++) {
    assert.equal(sent[i]!.id, -1001n);
    assert.equal(sent[i]!.device, StreamDevice.MICROPHONE);
    assert.ok(Array.isArray(sent[i]!.data), 'data must be plain JS Array for ntgcalls N-API');
    assert.equal((sent[i]!.data as number[]).length, 960);
    assert.equal(sent[i]!.frameData.absoluteCaptureTimestampMs, 1000n + BigInt(i) * 10n);
    assert.equal(sent[i]!.frameData.rotation, 0);
  }
  assert.equal((sent[2]!.data as number[])[479], 0x11);
  assert.equal((sent[2]!.data as number[])[480], 0, 'trailing partial 10ms chunk is zero-padded');

  // Misaligned PCM rejected
  await assert.rejects(
    () => pushExternalAudioFrame(fakeNative, -1001n, Buffer.alloc(3), { channels: 1 }),
    /aligned/i,
  );
  // Empty PCM rejected
  await assert.rejects(
    () => pushExternalAudioFrame(fakeNative, -1001n, Buffer.alloc(0)),
    /non-empty/i,
  );
}

// 3. pushExternalVideoFrame validation & N-API contract
{
  const sent: Array<{ device: StreamDevice; data: unknown; frameData: any }> = [];
  const fakeNative = {
    sendExternalFrame: async (_id: bigint, device: StreamDevice, data: Buffer, frameData: any) => {
      sent.push({ device, data, frameData });
    },
  };
  const i420 = Buffer.alloc((16 * 16 * 3) / 2, 128);
  await pushExternalVideoFrame(fakeNative, -1001n, i420, { width: 16, height: 16, rotation: 90, timestampMs: 55n });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.device, StreamDevice.CAMERA);
  assert.ok(Array.isArray(sent[0]!.data));
  assert.equal((sent[0]!.data as number[]).length, 384);
  assert.equal(sent[0]!.frameData.width, 16);
  assert.equal(sent[0]!.frameData.height, 16);
  assert.equal(sent[0]!.frameData.rotation, 90);
  assert.equal(sent[0]!.frameData.absoluteCaptureTimestampMs, 55n);

  await assert.rejects(
    () => pushExternalVideoFrame(fakeNative, -1001n, Buffer.alloc(10), { width: 16, height: 16 }),
    /384/,
  );
}

// 4. TgCallsClient facade: join({ kind: 'external' }) + pushAudioFrame + onAudioFrame (real ntgcalls createCall/sendExternalFrame!)
{
  const chatId = -1005556667778n;
  const adapter: any = {
    isAdapter: true,
    resolveChatId: async () => chatId,
    getGroupCall: async () => ({ id: 1n, accessHash: 2n }),
    joinGroupCall: async () => ({ params: '{"transport":"fixture"}' }),
    leaveGroupCall: async () => {},
    joinPresentationCall: async () => {},
    leavePresentationCall: async () => {},
    extractConnectionParams: (r: any) => r.params,
    installUpdateHandler: () => () => {},
    dispose: () => {},
  };
  const tg = new TgCallsClient({ client: adapter, ffmpegPath: '/nonexistent-ffmpeg' });
  let onFramesCb: ((id: bigint, mode: StreamMode, device: StreamDevice, frames: any[]) => void) | undefined;
  const playbackConfigs: any[] = [];
  const origSetSources = tg.ntg.setStreamSources.bind(tg.ntg);
  Object.defineProperty(tg.ntg, 'connect', { configurable: true, value: async () => {} });
  Object.defineProperty(tg.ntg, 'onFrames', {
    configurable: true,
    value: (cb: typeof onFramesCb) => { onFramesCb = cb; },
  });
  Object.defineProperty(tg.ntg, 'setStreamSources', {
    configurable: true,
    value: async (id: bigint, mode: StreamMode, media: any) => {
      if (mode === StreamMode.PLAYBACK) {playbackConfigs.push(media);}
      return await origSetSources(id, mode, media);
    },
  });

  try {
    await tg.join(chatId, { kind: 'external', sampleRate: 48000, channels: 1 });
    // Real native ntgcalls.sendExternalFrame call!
    await tg.pushAudioFrame(chatId, Buffer.alloc(1920, 0), { sampleRate: 48000, channels: 1 });

    const received: ExternalAudioFrame[] = [];
    const unsub = await tg.onAudioFrame(chatId, (frame) => { received.push(frame); }, { sampleRate: 48000, channels: 1 });
    assert.equal(playbackConfigs.length, 1, 'onAudioFrame configures EXTERNAL playback microphone automatically');
    assert.equal(playbackConfigs[0].microphone.mediaSource, MediaSource.EXTERNAL);

    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [
      { ssrc: -5n, data: Buffer.from([1, 2, 3, 4]), frameData: { absoluteCaptureTimestampMs: 777n } },
    ]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(received.length, 1);
    assert.equal(received[0]!.ssrc, 0xfffffffb, 'signed SSRC normalized to uint32');
    assert.deepEqual(received[0]!.pcm, Buffer.from([1, 2, 3, 4]));
    assert.equal(received[0]!.timestampMs, 777n);

    unsub();
    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [
      { ssrc: 10n, data: Buffer.from([5, 6]), frameData: { absoluteCaptureTimestampMs: 888n } },
    ]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(received.length, 1, 'unsubscribe stops delivering frames');

    await tg.leave(chatId);
  } finally {
    await tg.dispose();
  }
}

console.log('External frame bridge (external source, 10ms slicing, real ntgcalls sendExternalFrame, onAudioFrame) passed.');
process.exit(0);
