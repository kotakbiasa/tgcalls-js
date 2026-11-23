import assert from 'node:assert/strict';
import { StreamDevice, StreamMode } from 'ntgcalls';
import {
  TgCallsClient,
  computePcmRms,
  i420ToBmp,
  resamplePcmS16le,
  type ExternalVideoFrame,
  type VoiceActivityEvent,
} from '../src/index.js';

// 1. Pure-JS PCM resampler (48kHz <-> 16kHz / 24kHz, mono <-> stereo) + RMS calculation
{
  // 10ms of 48kHz mono sine wave (480 samples = 960 bytes)
  const samples48k = 480;
  const pcm48k = Buffer.alloc(samples48k * 2);
  for (let i = 0; i < samples48k; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * 440 * i) / 48000) * 16384);
    pcm48k.writeInt16LE(val, i * 2);
  }
  const rms48k = computePcmRms(pcm48k);
  assert.ok(rms48k > 0.3 && rms48k < 0.4, `sine RMS expected ~0.35, got ${rms48k}`);

  // Downsample 48kHz -> 16kHz (160 samples = 320 bytes)
  const pcm16k = resamplePcmS16le(pcm48k, 48000, 16000, 1, 1);
  assert.equal(pcm16k.byteLength, 320);
  const rms16k = computePcmRms(pcm16k);
  assert.ok(Math.abs(rms16k - rms48k) < 0.05, 'downsampled sine preserves RMS energy');

  // Upsample 24kHz -> 48kHz mono -> stereo (240 samples -> 480 stereo frames = 1920 bytes)
  const pcm24k = resamplePcmS16le(pcm48k, 48000, 24000, 1, 1);
  assert.equal(pcm24k.byteLength, 480);
  const pcm48kStereo = resamplePcmS16le(pcm24k, 24000, 48000, 1, 2);
  assert.equal(pcm48kStereo.byteLength, 1920);
}

// 2. Pure-JS I420 -> 24-bit RGB BMP converter
{
  const w = 4;
  const h = 4;
  const i420 = Buffer.alloc((w * h * 3) / 2, 128);
  const bmp = i420ToBmp(i420, w, h);
  assert.equal(bmp.toString('ascii', 0, 2), 'BM');
  assert.equal(bmp.readUInt32LE(2), 54 + 12 * 4);
  assert.equal(bmp.readInt32LE(18), 4);
  assert.equal(bmp.readInt32LE(22), -4);
}

// 3. GeminiLiveSession + VAD + Paced Barge-In + onVideoFrame + idleTimeoutMs end-to-end test
{
  const chatId = -1009998887776n;
  const adapter: any = {
    isAdapter: true,
    resolveChatId: async () => chatId,
    getGroupCall: async () => ({ id: 9n, accessHash: 10n }),
    joinGroupCall: async () => ({ params: '{"transport":"fixture"}' }),
    leaveGroupCall: async () => {},
    joinPresentationCall: async () => {},
    leavePresentationCall: async () => {},
    extractConnectionParams: (r: any) => r.params,
    installUpdateHandler: () => () => {},
    editGroupCallTitle: async () => ({}),
    exportGroupCallInvite: async () => 'https://t.me/test?videochat=abc',
    toggleGroupCallRecord: async () => ({}),
    discardGroupCall: async () => ({}),
    dispose: () => {},
  };

  const tg = new TgCallsClient({ client: adapter });
  let onFramesCb: ((id: bigint, mode: StreamMode, device: StreamDevice, frames: any[]) => void) | undefined;
  const sentToNative: Array<{ device: StreamDevice; bytes: number }> = [];

  for (const [name, fn] of Object.entries({
    createCall: async () => '{"ssrc":777}',
    connect: async () => {},
    stop: async () => {},
    mute: async () => true,
    setStreamSources: async () => {},
    sendExternalFrame: async (_id: bigint, device: StreamDevice, data: any) => {
      sentToNative.push({ device, bytes: (data as number[]).length });
    },
    onFrames: (cb: typeof onFramesCb) => { onFramesCb = cb; },
    onStreamEnd: () => {},
    onConnectionChange: () => {},
    onRemoteSourceChange: () => {},
  })) {
    Object.defineProperty(tg.ntg, name, { configurable: true, value: fn });
  }

  try {
    await tg.join(chatId, { kind: 'external', sampleRate: 48000, channels: 1 });

    // Test Voice Chat management facade methods
    await tg.setCallTitle(chatId, 'Gemini Live Voice Assistant');
    const invite = await tg.exportCallInvite(chatId, { canSelfUnmute: true });
    assert.equal(invite, 'https://t.me/test?videochat=abc');
    await tg.toggleNativeRecording(chatId, true, { title: 'AI Call' });

    // Test VAD (onVoiceActivity)
    const vadEvents: VoiceActivityEvent[] = [];
    const offVad = await tg.onVoiceActivity(
      chatId,
      (ev) => { vadEvents.push(ev); },
      { thresholdRms: 0.05, speechFrames: 2, silenceFrames: 2 },
    );

    const loudFrame = Buffer.alloc(960);
    for (let i = 0; i < 480; i++) {loudFrame.writeInt16LE(12000, i * 2);}
    const silentFrame = Buffer.alloc(960, 0);

    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [
      { ssrc: 42n, data: loudFrame, frameData: { absoluteCaptureTimestampMs: 10n } },
      { ssrc: 42n, data: loudFrame, frameData: { absoluteCaptureTimestampMs: 20n } },
      { ssrc: 42n, data: silentFrame, frameData: { absoluteCaptureTimestampMs: 30n } },
      { ssrc: 42n, data: silentFrame, frameData: { absoluteCaptureTimestampMs: 40n } },
    ]);
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(vadEvents.length, 2);
    assert.equal(vadEvents[0]!.type, 'speechStart');
    assert.equal(vadEvents[1]!.type, 'speechEnd');
    offVad();

    // Test onVideoFrame
    const videoFrames: ExternalVideoFrame[] = [];
    const offVid = await tg.onVideoFrame(chatId, (vf) => { videoFrames.push(vf); });
    const rawI420 = Buffer.alloc((4 * 4 * 3) / 2, 128);
    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.CAMERA, [
      { ssrc: 42n, data: rawI420, frameData: { width: 4, height: 4, rotation: 0, absoluteCaptureTimestampMs: 99n } },
    ]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(videoFrames.length, 1);
    assert.equal(videoFrames[0]!.width, 4);
    assert.equal(videoFrames[0]!.device, 'camera');
    offVid();

    // Test GeminiLiveSession WebSocket BidiGenerateContent flow
    const wsSent: any[] = [];
    const wsListeners: Record<string, Array<(ev: any) => void>> = {};
    const fakeWs = {
      send: (raw: string) => {
        const parsed = JSON.parse(raw);
        wsSent.push(parsed);
        // Respond to setup immediately with setupComplete
        if (parsed.setup) {
          queueMicrotask(() => {
            for (const cb of wsListeners.message ?? []) {
              cb({ data: JSON.stringify({ setupComplete: {} }) });
            }
          });
        }
      },
      close: () => {},
      addEventListener: (type: string, cb: (ev: any) => void) => {
        (wsListeners[type] ??= []).push(cb);
        if (type === 'open') {
          queueMicrotask(() => cb({}));
        }
      },
    };

    const transcripts: string[] = [];
    let interruptedCount = 0;
    const session = await tg.connectGeminiLive(chatId, {
      apiKey: 'test-key-never-sent-over-network',
      systemInstruction: 'You are a helpful Telegram voice assistant.',
      voiceName: 'Aoede',
      videoFrameIntervalMs: 10,
      paceIntervalMs: 50, // slow pacing so we can test barge-in interrupt
      createWebSocket: () => fakeWs,
      onTextOutput: (t) => transcripts.push(t),
      onInterrupted: () => { interruptedCount++; },
    });

    assert.equal(session.isReady, true);
    assert.equal(wsSent[0].setup.model, 'models/gemini-2.5-flash-native-audio-preview-12-2025');
    assert.equal(wsSent[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');

    // 1) Simulate incoming 48kHz Telegram voice frame -> Gemini receives 16kHz PCM (320 bytes)
    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [
      { ssrc: 42n, data: loudFrame, frameData: { absoluteCaptureTimestampMs: 100n } },
    ]);
    await new Promise((r) => setTimeout(r, 10));
    const audioMsg = wsSent.find((m) => m.realtimeInput?.audio);
    assert.ok(audioMsg, 'Telegram audio forwarded to Gemini Live');
    assert.equal(audioMsg.realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
    assert.equal(Buffer.from(audioMsg.realtimeInput.audio.data, 'base64').byteLength, 320);

    // 2) Simulate incoming Telegram camera frame -> Gemini receives BMP image chunk
    onFramesCb!(chatId, StreamMode.PLAYBACK, StreamDevice.CAMERA, [
      { ssrc: 42n, data: rawI420, frameData: { width: 4, height: 4, rotation: 0, absoluteCaptureTimestampMs: 110n } },
    ]);
    await new Promise((r) => setTimeout(r, 10));
    const videoMsg = wsSent.find((m) => m.realtimeInput?.mediaChunks);
    assert.ok(videoMsg, 'Telegram video frame forwarded to Gemini Live as image/bmp');
    assert.equal(videoMsg.realtimeInput.mediaChunks[0].mimeType, 'image/bmp');

    // 3) Simulate Gemini Live returning 100ms of 24kHz PCM audio (2400 samples = 4800 bytes -> 10 x 10ms 48kHz frames)
    const gemini24kPcm = Buffer.alloc(4800, 0x22);
    for (const cb of wsListeners.message ?? []) {
      cb({
        data: JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [
                { text: 'Halo dari Gemini Live!' },
                {
                  inlineData: {
                    mimeType: 'audio/pcm;rate=24000',
                    data: gemini24kPcm.toString('base64'),
                  },
                },
              ],
            },
          },
        }),
      });
    }
    await new Promise((r) => setTimeout(r, 15));
    assert.deepEqual(transcripts, ['Halo dari Gemini Live!']);
    assert.ok(sentToNative.length >= 1, 'first 10ms frame sent to ntgcalls');
    assert.equal(sentToNative[0]!.bytes, 960, '24kHz resampled to 48kHz 10ms frame (960 bytes)');

    // 4) Simulate Gemini Live barge-in interruption -> drops remaining queued frames
    for (const cb of wsListeners.message ?? []) {
      cb({ data: JSON.stringify({ serverContent: { interrupted: true } }) });
    }
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(interruptedCount, 1);
    const countAfterInterrupt = sentToNative.length;
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentToNative.length, countAfterInterrupt, 'paced queue stopped sending after interrupt');

    await session.close();
    await tg.endGroupCall(chatId);
    assert.equal(tg.isActive(chatId), false, 'endGroupCall discards and leaves active call');
  } finally {
    await tg.dispose();
  }
}

console.log('Gemini Live bridge, PCM resampler, VAD, paced barge-in, onVideoFrame, and call admin RPCs passed.');
process.exit(0);
