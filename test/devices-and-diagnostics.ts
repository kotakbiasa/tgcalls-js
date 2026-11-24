import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { MediaSource, StreamMode } from 'ntgcalls';
import {
  GramjsAdapter,
  LogLevel,
  MtcuteAdapter,
  TgCallsClient,
  audioDescription,
  deviceVideoDescription,
  resolveDeviceMetadata,
} from '../src/index.js';

const require = createRequire(import.meta.url);
const { Api } = require('teleproto');

// 1. Static native helpers (real ntgcalls)
{
  assert.equal(TgCallsClient.nativePing(), 'pong');
  const devices = TgCallsClient.getMediaDevices();
  assert.ok(Array.isArray(devices.microphone));
  assert.ok(Array.isArray(devices.speaker));
  assert.ok(Array.isArray(devices.camera));
  assert.ok(Array.isArray(devices.screen));
  TgCallsClient.setNativeLogLevel(LogLevel.SILENT);
}

// 2. Device metadata resolution & MediaSource.DEVICE / DESKTOP descriptions (zero ffmpeg)
{
  const fakeDevices = {
    microphone: [{ name: 'USB Mic', metadata: '{"id":"mic-1"}' }],
    speaker: [{ name: 'Laptop Speakers', metadata: '{"id":"spk-1"}' }],
    camera: [{ name: 'HD Webcam', metadata: '{"id":"cam-1"}' }],
    screen: [{ name: 'Primary Monitor', metadata: '{"id":1,"display_id":0}' }],
  };

  assert.equal(resolveDeviceMetadata('microphone', undefined, fakeDevices), '{"id":"mic-1"}');
  assert.equal(resolveDeviceMetadata('microphone', 'default', fakeDevices), '{"id":"mic-1"}');
  assert.equal(resolveDeviceMetadata('microphone', 'usb mic', fakeDevices), '{"id":"mic-1"}');
  assert.equal(resolveDeviceMetadata('camera', fakeDevices.camera[0], fakeDevices), '{"id":"cam-1"}');
  assert.equal(resolveDeviceMetadata('screen', '{"custom":true}', fakeDevices), '{"custom":true}');
  assert.throws(() => resolveDeviceMetadata('camera', 'default', { ...fakeDevices, camera: [] }), /No local camera/i);

  const micDesc = audioDescription(
    { kind: 'device', microphone: fakeDevices.microphone[0], sampleRate: 48000, channels: 2 },
    { client: {} as never, ffmpegPath: '/nonexistent-ffmpeg' },
  );
  assert.equal(micDesc.mediaSource, MediaSource.DEVICE);
  assert.equal(micDesc.input, '{"id":"mic-1"}');
  assert.throws(() => audioDescription({ kind: 'device', microphone: false }, { client: {} as never }), /disabled/i);

  const camDesc = deviceVideoDescription('camera', 'HD Webcam', { width: 1280, height: 720, fps: 30 }, fakeDevices);
  assert.equal(camDesc.mediaSource, MediaSource.DEVICE);
  assert.equal(camDesc.input, '{"id":"cam-1"}');

  const scrDesc = deviceVideoDescription('screen', 'Primary Monitor', { width: 1920, height: 1080, fps: 25 }, fakeDevices);
  assert.equal(scrDesc.mediaSource, MediaSource.DESKTOP);
  assert.equal(scrDesc.input, '{"id":1,"display_id":0}');
}

// 3. GramjsAdapter & MtcuteAdapter ping() with real teleproto Api.Ping serialization
{
  let gramPingCalled = false;
  const gramAdapter = new GramjsAdapter(
    {
      invoke: async (req: any) => {
        assert.equal(req.className, 'Ping');
        assert.ok(Buffer.from(req.getBytes()).length > 0, 'Api.Ping serializes cleanly');
        gramPingCalled = true;
        return {};
      },
    } as never,
    { Api },
  );
  const gramRtt = await gramAdapter.ping();
  assert.equal(gramPingCalled, true);
  assert.ok(Number.isFinite(gramRtt) && gramRtt >= 0);

  let mtPingCalled = false;
  const mtAdapter = new MtcuteAdapter({
    call: async (req: any) => {
      assert.equal(req._, 'ping');
      mtPingCalled = true;
      return {};
    },
    onRawUpdate: { add: () => () => {} },
  } as never);
  const mtRtt = await mtAdapter.ping();
  assert.equal(mtPingCalled, true);
  assert.ok(Number.isFinite(mtRtt) && mtRtt >= 0);
}

// 4. TgCallsClient facade: ping(), cpuUsage(), getMediaState(), enableSpeakerOutput()
{
  const chatId = -1004445556667n;
  const playbackCalls: any[] = [];
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
    ping: async () => 12.34,
    dispose: () => {},
  };
  const tg = new TgCallsClient({ client: adapter });
  Object.defineProperty(tg.ntg, 'setStreamSources', {
    configurable: true,
    value: async (_id: bigint, mode: StreamMode, media: any) => {
      if (mode === StreamMode.PLAYBACK) {playbackCalls.push(media);}
    },
  });
  Object.defineProperty(tg.ntg, 'getState', {
    configurable: true,
    value: async () => ({
      muted: false,
      videoPaused: false,
      videoStopped: true,
      presentationPaused: false,
      presentationStopped: true,
    }),
  });

  try {
    assert.equal(await tg.ping(), 12.34);
    const cpu = await tg.cpuUsage();
    assert.equal(typeof cpu, 'number');

    const state = await tg.getMediaState(chatId);
    assert.equal(state?.muted, false);
    assert.equal(state?.videoStopped, true);

    await tg.enableSpeakerOutput(chatId, { name: 'Test Speaker', metadata: '{"id":"spk-test"}' });
    assert.equal(playbackCalls.length, 1);
    assert.equal(playbackCalls[0].microphone.mediaSource, MediaSource.DEVICE);
    assert.equal(playbackCalls[0].microphone.input, '{"id":"spk-test"}');
  } finally {
    await tg.dispose();
  }
}

console.log('Hardware MediaDevices, device/desktop sources, ping(), cpuUsage(), getMediaState(), and speaker output passed.');
process.exit(0);
