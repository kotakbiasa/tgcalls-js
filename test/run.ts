import { strict as assert } from 'assert';
import { spawnSync } from 'child_process';
import { ConnectionState, StreamMode, StreamType } from 'ntgcalls';
import { GramjsAdapter, MtcuteAdapter, TgCallsClient, loadTl, resetTlCache } from '../src/index.js';
import { recordingDescription } from '../src/media.js';
import { P2PCallManager } from '../src/calls.js';
import type { MTProtoLike } from '../src/index.js';

/**
 * Offline unit test: fake MTProto client + real ntgcalls native lib.
 * Verifies the TL orchestration logic without a real Telegram connection.
 */

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

// Minimal fake of the generated TL namespace (only what join/leave touch).
class Fake {
  args: Record<string, unknown>;
  className: string;
  constructor(args: Record<string, unknown>) {
    // Real GramJS classes expose fields as instance properties.
    Object.assign(this, args);
    this.args = args;
    this.className = new.target.name;
    calls.push({ name: this.className, args });
  }
}
const Api = {
  channels: Object.assign(
    class channels {},
    {
      GetFullChannel: class GetFullChannel extends Fake {},
    },
  ),
  phone: Object.assign(
    class phone {},
    {
      JoinGroupCall: class JoinGroupCall extends Fake {},
      LeaveGroupCall: class LeaveGroupCall extends Fake {},
      CreateGroupCall: class CreateGroupCall extends Fake {},
    },
  ),
  UpdateGroupCallConnection: class UpdateGroupCallConnection extends Fake {},
  InputGroupCall: class InputGroupCall extends Fake {},
  DataJSON: class DataJSON extends Fake {},
  InputPeerSelf: class InputPeerSelf extends Fake {},
} as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CONNECTION_PARAMS = JSON.stringify({
  transport: {
    ufrag: 'testufrag',
    pwd: 'testpwd',
    fingerprints: [{ hash: 'sha-256', setup: 'passive', fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99' }],
    candidates: [{ ip: '1.2.3.4', port: '1234', generation: '0', component: '1', foundation: '1', priority: '1', protocol: 'udp', type: 'host', network: '1', relatedAddress: '0.0.0.0', relatedPort: '0' }],
  },
  ssrc: 111222333,
  ssrcs: [],
  audio: {
    'payload-types': [{ id: 111, name: 'opus', clockrate: 48000, channels: 2 }],
    'rtp-hdrexts': [{ id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level' }],
  },
  video: {
    'payload-types': [{ id: 96, name: 'VP8', clockrate: 90000 }],
    'rtp-hdrexts': [{ id: 2, uri: 'urn:ietf:params:rtp-hdrext:toffset' }],
  },
});

function testExplicitTlNamespacesStayLocal(): void {
  const gramjsApi = { client: 'gramjs' };
  const teleprotoApi = { client: 'teleproto' };
  resetTlCache();
  assert.equal(loadTl(gramjsApi), gramjsApi);
  assert.equal(loadTl(teleprotoApi), teleprotoApi);
  resetTlCache();
}

function testGramjsHandlerRemovalUsesSameBuilder(): void {
  let addedCallback: ((update: unknown) => void) | null = null;
  let addedBuilder: unknown;
  let removedCallback: unknown;
  let removedBuilder: unknown;
  let deliveredUpdate: unknown;
  let deliveredParams: string | null = null;
  const client: MTProtoLike = {
    async invoke() {return {};},
    addEventHandler(callback, builder) {
      addedCallback = callback;
      addedBuilder = builder;
    },
    removeEventHandler(callback, builder) {
      removedCallback = callback;
      removedBuilder = builder;
    },
  };
  const adapter = new GramjsAdapter(client, { Api });
  const uninstall = adapter.installUpdateHandler(
    (update) => {deliveredUpdate = update;},
    (params) => {deliveredParams = params;},
  );
  const rawUpdate = { _: 'updateGroupCallConnection', params: { data: 'gramjs-params' } };
  (addedCallback as unknown as (update: unknown) => void)({ update: rawUpdate });
  assert.equal(deliveredUpdate, rawUpdate, 'GramJS-family update wrappers are unwrapped');
  assert.equal(deliveredParams, 'gramjs-params', 'snake-case raw TL updates are recognized');
  uninstall();
  assert.equal(removedCallback, addedCallback);
  assert.equal(removedBuilder, addedBuilder, 'GramJS/teleproto removal receives the registered builder');
}

function testMtcuteSubscriptionCleanup(): void {
  let unsubscribeCount = 0;
  let rawHandler: ((update: unknown) => void) | null = null;
  let deliveredUpdate: unknown;
  let deliveredParams: string | null = null;
  const adapter = new MtcuteAdapter({
    async call() {return {};},
    onRawUpdate: {
      add(handler) {
        rawHandler = handler;
        return () => {
          unsubscribeCount++;
          rawHandler = null;
        };
      },
    },
  });
  const uninstall = adapter.installUpdateHandler(
    (update) => {deliveredUpdate = update;},
    (params) => {deliveredParams = params;},
  );
  const rawUpdate = { _: 'updateGroupCallConnection', params: { data: 'mtcute-params' } };
  (rawHandler as unknown as (update: unknown) => void)({ update: rawUpdate, peers: new Map() });
  assert.equal(deliveredUpdate, rawUpdate, 'mtcute RawUpdateInfo is unwrapped');
  assert.equal(deliveredParams, 'mtcute-params');
  uninstall();
  adapter.dispose();
  assert.equal(unsubscribeCount, 1, 'mtcute subscription cleanup is idempotent');
}

async function testMtcuteGroupCallPreservesTlLongs(): Promise<void> {
  const callId = {
    low: 987654321,
    high: 0,
    unsigned: false,
    toString() {return '987654321';},
  };
  const accessHash = {
    low: 1122334455,
    high: 0,
    unsigned: false,
    toString() {return '1122334455';},
  };
  const requests: Array<{ _: string; [key: string]: unknown }> = [];
  const adapter = new MtcuteAdapter({
    async call(value: unknown) {
      const request = value as { _: string; [key: string]: unknown };
      requests.push(request);
      if (request._ === 'channels.getFullChannel') {
        return { fullChat: { call: { id: callId, accessHash } } };
      }
      return {};
    },
    onRawUpdate: { add() {} },
  });

  const inputCall = await adapter.getGroupCall(-1001234567890n, false) as {
    _: string;
    id: unknown;
    accessHash: unknown;
  };
  assert.equal(inputCall._, 'inputGroupCall');
  assert.strictEqual(inputCall.id, callId, 'mtcute TL Long id is preserved by reference');
  assert.strictEqual(inputCall.accessHash, accessHash, 'mtcute TL Long accessHash is preserved by reference');
  assert.equal((inputCall.id as typeof callId).low, 987654321);
  assert.equal((inputCall.id as typeof callId).high, 0);

  await adapter.joinGroupCall(inputCall, CONNECTION_PARAMS, { muted: false });
  const joinRequest = requests.find((request) => request._ === 'phone.joinGroupCall');
  assert.ok(joinRequest, 'mtcute phone.joinGroupCall invoked');
  assert.strictEqual(joinRequest.call, inputCall, 'the preserved inputGroupCall is passed to mtcute unchanged');
}

async function testRtmpCreateOption(): Promise<void> {
  let created = false;
  calls.length = 0;
  const createClient: MTProtoLike = {
    async invoke(request: unknown) {
      const req = request as { className: string };
      if (req.className === 'GetFullChannel') {
        return created
          ? { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } }
          : { fullChat: {} };
      }
      if (req.className === 'CreateGroupCall') {
        created = true;
      }
      return {};
    },
  };

  const adapter = new GramjsAdapter(createClient, { Api });
  await adapter.getGroupCall(-1001234567890n, true, true);
  const create = calls.find((call) => call.name === 'CreateGroupCall');
  assert.ok(create, 'CreateGroupCall invoked');
  assert.equal(create.args.rtmpStream, true, 'GramJS idle call creation requests RTMP-stream mode');

  let mtcuteCreated = false;
  const mtcuteRequests: Array<{ _: string; [key: string]: unknown }> = [];
  const mtcuteClient = {
    async call(request: unknown) {
      const req = request as { _: string; [key: string]: unknown };
      mtcuteRequests.push(req);
      if (req._ === 'channels.getFullChannel') {
        return mtcuteCreated
          ? { fullChat: { call: { id: 987654321n, accessHash: 1122334455n } } }
          : { fullChat: {} };
      }
      if (req._ === 'phone.createGroupCall') {
        mtcuteCreated = true;
      }
      return {};
    },
    onRawUpdate: { add() {} },
  };
  const mtcuteAdapter = new MtcuteAdapter(mtcuteClient);
  await mtcuteAdapter.getGroupCall(-1001234567890n, true, true);
  const mtcuteCreate = mtcuteRequests.find((request) => request._ === 'phone.createGroupCall');
  assert.ok(mtcuteCreate, 'mtcute phone.createGroupCall invoked');
  assert.equal(mtcuteCreate.rtmpStream, true, 'mtcute idle call creation requests RTMP-stream mode');
}

let updateHandler: ((u: unknown) => void) | null = null;
const client: MTProtoLike = {
  async invoke(request: unknown) {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      return {
        fullChat: { call: { id: '987654321', accessHash: '1122334455' } },
      };
    }
    if (req.className === 'JoinGroupCall') {
      // Deliver connection params the "inline" way.
      return { updates: [{ className: 'UpdateGroupCallConnection', params: { data: CONNECTION_PARAMS } }] };
    }
    if (req.className === 'LeaveGroupCall') {
      return {};
    }
    return {};
  },
  addEventHandler(cb: (u: unknown) => void) {
    updateHandler = cb;
  },
  removeEventHandler() {
    updateHandler = null;
  },
};

async function main(): Promise<void> {
  testExplicitTlNamespacesStayLocal();
  testGramjsHandlerRemovalUsesSameBuilder();
  testMtcuteSubscriptionCleanup();
  await testMtcuteGroupCallPreservesTlLongs();
  await testRtmpCreateOption();

  // Build the video fixture FIRST: forking (spawnSync) after ntgcalls' native
  // threads exist can deadlock, so no child process is spawned once tests start.
  const ff = spawnSync('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '10', '-pix_fmt', 'yuv420p', '/tmp/tgcalls-test.mp4',
  ], { stdio: 'ignore', timeout: 20_000 }); // no pipes + timeout: never hang the suite

  // ntgcalls spawns ffmpeg through a shell for every audio/video source; the
  // native core surfaces its absence as a confusing vfork_launcher ENOENT.
  if (ff.error || ff.status !== 0) {
    console.error(
      'ffmpeg is required to run this suite (apt-get install ffmpeg / brew install ffmpeg):',
      ff.error ?? `ffmpeg exited with ${ff.status}`,
    );
    process.exit(1);
  }

  // Recording encode pipeline (v0.5.0): the exact ffmpeg command the recorder
  // uses must turn s16le PCM into a valid container. Done here, before any
  // native thread exists (forking afterwards can deadlock — see above).
  {
    const desc = recordingDescription('/tmp/tgcalls-rec-pipe.wav', 48000, 1);
    const N = 24000; // 0.5s of 440Hz sine, s16le mono 48k
    const pcm = Buffer.alloc(N * 2);
    for (let i = 0; i < N; i++) {
      pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 48000) * 12000), i * 2);
    }
    const enc = spawnSync('sh', ['-c', desc.input], { input: pcm, timeout: 20_000 });
    assert.equal(enc.status, 0, 'recorder ffmpeg command encodes PCM successfully');
    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels',
      '-of', 'json', '/tmp/tgcalls-rec-pipe.wav',
    ], { encoding: 'utf8', timeout: 20_000 });
    const st = JSON.parse(probe.stdout).streams?.[0];
    assert.equal(st?.codec_name, 'pcm_s16le', 'recorded wav is pcm_s16le');
    assert.equal(st?.sample_rate, '48000', 'recorded sample rate is 48000');
    assert.equal(st?.channels, 1, 'recorded file is mono');
  }


  const tg = new TgCallsClient({ client, Api });

  // --- join (file source)
  const res = await tg.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  assert.equal(res.chatId, -1001234567890n);
  assert.equal(tg.isActive(-1001234567890), true);

  client.getEntity = async () => ({ id: 1234567890, className: 'Channel' });
  assert.equal(await tg.resolveChatId('@mychannel'), -1001234567890n);
  assert.equal(tg.isActive('https://t.me/mychannel'), true, 'resolved aliases work with sync introspection');
  assert.equal(tg.getCall('@mychannel')?.chatId, -1001234567890n);

  // TL request sanity
  const join = calls.find((c) => c.name === 'JoinGroupCall');
  assert.ok(join, 'JoinGroupCall invoked');
  const joinSsrc = JSON.parse((join!.args.params as { data: string }).data).ssrc as number;
  assert.ok(typeof joinSsrc === 'number' && joinSsrc > 0, 'join params contain native ssrc');
  assert.equal(res.ssrc, joinSsrc, 'leave-source ssrc == join params ssrc');
  assert.equal(join!.args.videoStopped, true);
  const leavePrep = calls.find((c) => c.name === 'InputGroupCall');
  assert.ok(leavePrep, 'input call built from fullChat.call');

  // double join rejected
  await assert.rejects(
    () => tg.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' }),
    /Already in a call/,
  );

  // --- controls
  assert.equal(await tg.pause('@mychannel'), true);
  assert.equal(await tg.resume('https://t.me/mychannel'), true);
  assert.equal(await tg.mute('@mychannel'), true);
  assert.equal(tg.getCall('https://t.me/mychannel')?.muted, true);
  assert.equal(await tg.unmute('https://t.me/mychannel'), true);
  assert.equal(tg.getCall('@mychannel')?.muted, false);
  assert.equal(typeof await tg.time(-1001234567890), 'number');

  // --- setSource swaps without rejoin
  await tg.setSource(-1001234567890, { kind: 'url', url: 'http://example.com/a.mp3' });
  assert.equal(tg.getCall(-1001234567890)?.source.kind, 'url');

  // --- leave
  await tg.leave('https://t.me/mychannel');
  assert.equal(tg.isActive('@mychannel'), false);
  const leave = calls.find((c) => c.name === 'LeaveGroupCall');
  assert.ok(leave, 'LeaveGroupCall invoked');
  assert.equal(leave!.args.source, joinSsrc, 'leave uses join ssrc');

  // A native connection failure must preserve call metadata long enough to
  // leave the participant through MTProto instead of just forgetting it.
  let failedStateNotified = false;
  const tgFailed = new TgCallsClient({ client, Api });
  tgFailed.on('connectionChange', (_chatId, state) => {
    if (state === ConnectionState.FAILED) {failedStateNotified = true;}
  });
  await tgFailed.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  const leaveCountBeforeFailure = calls.filter((call) => call.name === 'LeaveGroupCall').length;
  await (tgFailed as unknown as {
    handleNativeConnectionChange: (chatId: bigint, info: { state: ConnectionState }) => Promise<void>;
  }).handleNativeConnectionChange(-1001234567890n, { state: ConnectionState.FAILED });
  assert.equal(tgFailed.isActive(-1001234567890), false, 'failed native call is removed after cleanup');
  assert.equal(failedStateNotified, true, 'FAILED is reported after cleanup completes');
  assert.equal(
    calls.filter((call) => call.name === 'LeaveGroupCall').length,
    leaveCountBeforeFailure + 1,
    'FAILED state sends LeaveGroupCall with retained call metadata',
  );
  await tgFailed.dispose();

  // --- concurrent joins to the same chat: only the first request may proceed
  let releaseFullChannel!: () => void;
  let signalFullChannelStarted!: () => void;
  const fullChannelStarted = new Promise<void>((resolve) => { signalFullChannelStarted = resolve; });
  const fullChannelGate = new Promise<void>((resolve) => { releaseFullChannel = resolve; });
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      signalFullChannelStarted();
      await fullChannelGate;
      return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
    }
    if (req.className === 'JoinGroupCall') {
      return { updates: [{ className: 'UpdateGroupCallConnection', params: { data: CONNECTION_PARAMS } }] };
    }
    return {};
  };
  const tgRace = new TgCallsClient({ client, Api });
  const firstJoin = tgRace.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  await fullChannelStarted;
  await assert.rejects(
    () => tgRace.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' }),
    /Already in a call/,
  );
  releaseFullChannel();
  await firstJoin;
  const leaveCountBeforeDispose = calls.filter((call) => call.name === 'LeaveGroupCall').length;
  await tgRace.dispose();
  assert.equal(tgRace.isActive(-1001234567890), false, 'dispose forgets active calls');
  assert.equal(
    calls.filter((call) => call.name === 'LeaveGroupCall').length,
    leaveCountBeforeDispose + 1,
    'dispose sends LeaveGroupCall for active calls',
  );

  // --- connection params via update handler path
  calls.length = 0;
  const tg2 = new TgCallsClient({ client, Api });
  // Simulate update-delivered params: patch invoke to return empty updates.
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
    }
    if (req.className === 'JoinGroupCall') {
      setTimeout(() => updateHandler?.({ className: 'UpdateGroupCallConnection', params: { data: CONNECTION_PARAMS } }), 50);
      return { updates: [] };
    }
    return {};
  };
  await tg2.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  await tg2.leave(-1001234567890);

  // --- no-voice-chat error
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async () => ({ fullChat: {} });
  await assert.rejects(
    () => tg2.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' }),
    /No active voice chat/,
  );

  // --- streamEnd → auto-leave: fire the internal handler registered by wireNative
  let leaveCalledAfterEnd = false;
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
    }
    if (req.className === 'JoinGroupCall') {
      return { updates: [{ className: 'UpdateGroupCallConnection', params: { data: CONNECTION_PARAMS } }] };
    }
    if (req.className === 'LeaveGroupCall') {
      leaveCalledAfterEnd = true;
      return {};
    }
    return {};
  };
  const tg3 = new TgCallsClient({ client, Api });
  await tg3.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  const tg3Any = tg3 as unknown as { calls: Map<bigint, unknown> };
  assert.ok(tg3Any.calls.has(-1001234567890n));
  // Assert leave() invokes LeaveGroupCall with the join ssrc (the auto-leave
  // path in wireNative calls exactly this leave()).
  await tg3.leave(-1001234567890);
  assert.equal(leaveCalledAfterEnd, true, 'leave() invokes LeaveGroupCall with ssrc');

  // --- setSource must keep the video channel (ntgcalls drops omitted devices)
  if (ff.status === 0) {
    const tg4 = new TgCallsClient({ client, Api });
    const vid = { kind: 'file' as const, path: '/tmp/tgcalls-test.mp4' };
    await tg4.join(-1001234567890, vid, { video: { width: 320, height: 180, fps: 15 } });
    assert.equal((await tg4.ntg.getState(-1001234567890n)).videoStopped, false, 'video active after join');
    await tg4.setSource(-1001234567890, vid);
    assert.equal((await tg4.ntg.getState(-1001234567890n)).videoStopped, false, 'setSource must keep video');
    await tg4.leave(-1001234567890);
  } else {
    console.warn('skipped video test: ffmpeg unavailable');
  }

  // --- a failed join cleans up (no native call / zombie participant left behind)
  let leaveOnFail = false;
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
    }
    if (req.className === 'JoinGroupCall') {
      return { updates: [] }; // never delivers UpdateGroupCallConnection
    }
    if (req.className === 'LeaveGroupCall') {
      leaveOnFail = true;
    }
    return {};
  };
  const tg5 = new TgCallsClient({ client, Api });
  await assert.rejects(
    () => tg5.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' }),
    /no UpdateGroupCallConnection/,
  );
  assert.equal(tg5.isActive(-1001234567890), false);
  assert.equal(leaveOnFail, true, 'failed join sends LeaveGroupCall');

  // --- joinIdle also cleans up a participant when connection params time out
  let leaveOnIdleFail = false;
  (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
    const req = request as { className: string };
    if (req.className === 'GetFullChannel') {
      return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
    }
    if (req.className === 'JoinGroupCall') {
      return { updates: [] };
    }
    if (req.className === 'LeaveGroupCall') {
      leaveOnIdleFail = true;
    }
    return {};
  };
  const tgIdleFail = new TgCallsClient({ client, Api });
  await assert.rejects(
    () => tgIdleFail.joinIdle(-1001234567890),
    /no UpdateGroupCallConnection/,
  );
  assert.equal(tgIdleFail.isActive(-1001234567890), false);
  assert.equal(leaveOnIdleFail, true, 'failed joinIdle sends LeaveGroupCall');

  // --- MTCUTE CLIENT TESTS
  const mtcuteCalls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let mtcuteRawHandler: ((u: unknown) => void) | null = null;

  const mtcuteClient: any = {
    async call(request: unknown) {
      const req = request as { _: string; [key: string]: unknown };
      mtcuteCalls.push({ method: req._, args: req });
      if (req._ === 'channels.getFullChannel') {
        return {
          fullChat: { call: { id: 987654321n, accessHash: 1122334455n } },
        };
      }
      if (req._ === 'phone.joinGroupCall') {
        return {
          _: 'updates',
          updates: [{ _: 'updateGroupCallConnection', params: { data: CONNECTION_PARAMS } }],
        };
      }
      if (req._ === 'phone.leaveGroupCall') {
        return {};
      }
      return {};
    },
    async resolvePeer(ref: unknown) {
      if (ref === 'mychannel' || ref === '@mychannel') {
        return { _: 'inputPeerChannel', channelId: 1234567890, accessHash: 99999n };
      }
      return { _: 'inputPeerChannel', channelId: 1234567890, accessHash: 99999n };
    },
    async getChat(ref: unknown) {
      if (ref === 'mychannel') {
        return { id: -1001234567890n };
      }
      return { id: -1001234567890n };
    },
    onRawUpdate: {
      add(cb: (u: unknown) => void) {
        mtcuteRawHandler = cb;
      },
      remove() {
        mtcuteRawHandler = null;
      },
    },
  };

  const tgMtcute = new TgCallsClient({ client: mtcuteClient });

  // mtcute join (file source)
  const mtcuteRes = await tgMtcute.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  assert.equal(mtcuteRes.chatId, -1001234567890n);
  assert.equal(tgMtcute.isActive(-1001234567890), true);

  // verify TL request recorded
  const mtcuteJoin = mtcuteCalls.find((c) => c.method === 'phone.joinGroupCall');
  assert.ok(mtcuteJoin, 'mtcute phone.joinGroupCall invoked');
  const mtcuteJoinSsrc = JSON.parse((mtcuteJoin!.args.params as { data: string }).data).ssrc as number;
  assert.equal(mtcuteRes.ssrc, mtcuteJoinSsrc, 'mtcute ssrc matches');

  // mtcute controls
  assert.equal(await tgMtcute.pause(-1001234567890), true);
  assert.equal(await tgMtcute.resume(-1001234567890), true);
  assert.equal(await tgMtcute.mute(-1001234567890), true);
  assert.equal(await tgMtcute.unmute(-1001234567890), true);

  // mtcute leave
  await tgMtcute.leave(-1001234567890);
  assert.equal(tgMtcute.isActive(-1001234567890), false);
  const mtcuteLeave = mtcuteCalls.find((c) => c.method === 'phone.leaveGroupCall');
  assert.ok(mtcuteLeave, 'mtcute phone.leaveGroupCall invoked');
  assert.equal(mtcuteLeave!.args.source, mtcuteJoinSsrc, 'mtcute leave uses join ssrc');

  // mtcute username resolution
  const resolvedId = await tgMtcute.resolveChatId('mychannel');
  assert.equal(resolvedId, -1001234567890n, 'mtcute resolveChatId works with string handles');

  // mtcute connection params delivered via onRawUpdate
  mtcuteCalls.length = 0;
  const mtcuteClient2: any = {
    async call(request: unknown) {
      const req = request as { _: string; [key: string]: unknown };
      mtcuteCalls.push({ method: req._, args: req });
      if (req._ === 'channels.getFullChannel') {
        return {
          fullChat: { call: { id: 987654321n, accessHash: 1122334455n } },
        };
      }
      if (req._ === 'phone.joinGroupCall') {
        setTimeout(() => {
          mtcuteRawHandler?.({
            update: { _: 'updateGroupCallConnection', params: { data: CONNECTION_PARAMS } },
          });
        }, 50);
        return { _: 'updates', updates: [] };
      }
      return {};
    },
    onRawUpdate: {
      add(cb: (u: unknown) => void) {
        mtcuteRawHandler = cb;
      },
      remove() {
        mtcuteRawHandler = null;
      },
    },
  };
  const tgMtcute2 = new TgCallsClient({ client: mtcuteClient2 });
  const mtcuteRes2 = await tgMtcute2.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  assert.equal(mtcuteRes2.chatId, -1001234567890n);
  await tgMtcute2.leave(-1001234567890);

  // --- playlist/queue (v0.4.0): advance, skip, hold loop, autoLeave.
  // Shell sine sources (60s) play real audio so the native core does not fire
  // streamEnd on its own during the test; handleStreamEnd is driven manually.
  {
    let plLeave = 0;
    (client as { invoke: (r: unknown) => Promise<unknown> }).invoke = async (request) => {
      const req = request as { className: string };
      if (req.className === 'GetFullChannel') {
        return { fullChat: { call: { id: '987654321', accessHash: '1122334455' } } };
      }
      if (req.className === 'JoinGroupCall') {
        return { updates: [{ className: 'UpdateGroupCallConnection', params: { data: CONNECTION_PARAMS } }] };
      }
      if (req.className === 'LeaveGroupCall') { plLeave++; return {}; }
      return {};
    };
    // Distinct (nonexistent) file paths, like the rest of the suite: the native
    // core fails fast on them without spawning long playback, so streamEnd is
    // driven manually via handleStreamEnd and nothing hangs.
    const A = { kind: 'file' as const, path: '/tmp/tgcalls-pl-a.mp3' };
    const B = { kind: 'file' as const, path: '/tmp/tgcalls-pl-b.mp3' };
    const C = { kind: 'file' as const, path: '/tmp/tgcalls-pl-c.mp3' };
    const H = { kind: 'file' as const, path: '/tmp/tgcalls-pl-h.mp3' };
    const chat = -1001234567890;
    type PlInternals = {
      handleStreamEnd: (id: bigint, t: StreamType) => Promise<void>;
    };

    const tgPl = new TgCallsClient({ client, Api });
    const pl = tgPl as unknown as PlInternals;
    await tgPl.play(chat, A);
    await tgPl.enqueue(chat, B);
    await tgPl.then(chat, C);
    assert.deepEqual(tgPl.getQueue(chat), [B, C], 'enqueue/then build the queue in order');
    assert.deepEqual(tgPl.getCurrent(chat), A, 'getCurrent is the playing track');

    await pl.handleStreamEnd(BigInt(chat), StreamType.AUDIO);
    assert.deepEqual(tgPl.getCurrent(chat), B, 'streamEnd advances to the next queued track');
    assert.deepEqual(tgPl.getQueue(chat), [C], 'queue shifted after advance');
    assert.equal(tgPl.isActive(chat), true, 'playlist keeps the call open');
    assert.equal(plLeave, 0, 'advancing the queue does not leave');

    await tgPl.skip(chat);
    assert.deepEqual(tgPl.getCurrent(chat), C, 'skip jumps to the next track');
    assert.deepEqual(tgPl.getQueue(chat), [], 'queue empty after skip');

    await tgPl.playOnHold(chat, H);
    await pl.handleStreamEnd(BigInt(chat), StreamType.AUDIO);
    assert.deepEqual(tgPl.getCurrent(chat), H, 'hold plays when the queue is empty');
    await pl.handleStreamEnd(BigInt(chat), StreamType.AUDIO);
    assert.deepEqual(tgPl.getCurrent(chat), H, 'hold loops');
    assert.equal(plLeave, 0, 'hold loop does not leave');

    await tgPl.clearQueue(chat);
    assert.deepEqual(tgPl.getQueue(chat), [], 'clearQueue empties the queue');
    await tgPl.skip(chat);
    assert.equal(tgPl.isActive(chat), true, 'skip with nothing queued pauses but stays in the call');
    await tgPl.dispose();

    // autoLeave still fires when nothing is queued (no playlist takeover).
    const tgPl2 = new TgCallsClient({ client, Api });
    const pl2 = tgPl2 as unknown as PlInternals;
    await tgPl2.join(chat, A); // autoLeave defaults to true
    const leaveBefore = plLeave;
    await pl2.handleStreamEnd(BigInt(chat), StreamType.AUDIO);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(plLeave, leaveBefore + 1, 'autoLeave fires when nothing is queued');
    assert.equal(tgPl2.isActive(chat), false, 'autoLeave leaves the call');
    await tgPl2.dispose();
  }

  // --- recording (v0.5.0): API contract + the ffmpeg encode pipeline.
  {
    const chat = -1001234567890;
    const tgRec = new TgCallsClient({ client, Api });

    // Stub PLAYBACK setStreamSources so the test exercises the recording API
    // without spawning the native mixer/ffmpeg (which hangs offline). CAPTURE
    // still goes to the real native core so join() works normally.
    const ntgRec = tgRec.ntg as unknown as {
      setStreamSources: (id: bigint, mode: StreamMode, media: unknown) => Promise<void>;
    };
    const origSet = ntgRec.setStreamSources.bind(ntgRec);
    const playbackCalls: Array<{ microphone?: { input?: string; sampleRate?: number; channelCount?: number } }> = [];
    Object.defineProperty(ntgRec, 'setStreamSources', {
      configurable: true,
      value: async (id: bigint, mode: StreamMode, media: unknown) => {
        if (mode === StreamMode.PLAYBACK) { playbackCalls.push(media as never); return; }
        return origSet(id, mode, media);
      },
    });

    await assert.rejects(() => tgRec.startRecording(chat, '/tmp/rec-x.wav'), /No active call/);

    await tgRec.join(chat, { kind: 'file', path: '/tmp/test.mp3' }, { autoLeave: false });
    assert.equal(tgRec.isRecording(chat), false, 'not recording initially');
    assert.equal(tgRec.getRecording(chat), null, 'getRecording null initially');

    const info = await tgRec.startRecording(chat, '/tmp/tgcalls-rec-api.wav', { channels: 1 });
    assert.equal(info.path, '/tmp/tgcalls-rec-api.wav');
    assert.equal(info.sampleRate, 48000);
    assert.equal(info.channels, 1);
    assert.equal(tgRec.isRecording(chat), true, 'isRecording true after start');
    assert.equal(tgRec.getRecording(chat)?.path, '/tmp/tgcalls-rec-api.wav');
    const sent = playbackCalls[0]?.microphone;
    assert.ok(sent?.input?.includes('ffmpeg') && sent.input.includes('/tmp/tgcalls-rec-api.wav'),
      'PLAYBACK microphone is an ffmpeg shell encoder writing to the path');
    assert.equal(sent?.sampleRate, 48000, 'PLAYBACK sample rate');
    assert.equal(sent?.channelCount, 1, 'PLAYBACK channel count');

    await tgRec.startRecording(chat, '/tmp/tgcalls-rec-api2.mp3');
    assert.equal(tgRec.getRecording(chat)?.path, '/tmp/tgcalls-rec-api2.mp3', 'starting again replaces the recording');

    const stopped = await tgRec.stopRecording(chat);
    assert.equal(stopped, '/tmp/tgcalls-rec-api2.mp3', 'stopRecording returns the path');
    assert.equal(tgRec.isRecording(chat), false, 'not recording after stop');
    assert.equal(await tgRec.stopRecording(chat), null, 'stop again returns null');

    await tgRec.startRecording(chat, '/tmp/tgcalls-rec-api3.wav');
    await tgRec.leave(chat);
    assert.equal(tgRec.isRecording(chat), false, 'leave clears recording state');
    await tgRec.dispose();
  }

  // --- P2P incoming-call signaling (v0.6.0): fake adapter + fake ntg, no native.
  {
    const tick = () => new Promise((r) => setTimeout(r, 25));
    const log: string[] = [];
    // teleproto returns TL longs as big-integer objects; BigInt(obj) is lossy (>2^53).
    const fakeLong = (s: string) => ({ toString: () => s, valueOf: () => Number(s) });
    const fakeNtg: any = {
      createP2pCall: async (id: bigint) => { log.push(`createP2pCall:${id}`); },
      setStreamSources: async (_id: bigint, mode: number) => { log.push(`setStream:${mode}`); },
      initExchange: async (_id: bigint, dh: any, gaHash: any) => { log.push('initExchange'); if (Array.isArray(dh?.p) && Array.isArray(dh?.random) && Array.isArray(gaHash)) { log.push('initExchange:arrays'); } return Buffer.alloc(256, 2); },
      exchangeKeys: async (_id: bigint, gAOrB: any) => { log.push('exchangeKeys'); if (Array.isArray(gAOrB)) { log.push('exchangeKeys:array'); } return { keyFingerprint: 0n, gAOrB: Buffer.alloc(0) }; },
      connectP2p: async (_id: bigint, servers: unknown[], versions: any, _p: unknown, custom: string) => { log.push(`connectP2p:${servers.length}`); log.push(`connectP2p custom ok:${custom === '{}'}`); log.push(`connectP2p v2:${Array.isArray(versions) && versions.every((v: string) => v === '8.0.0' || v === '9.0.0')}`); },
      sendSignalingData: async (_id: bigint, data: any) => { log.push(`ntgSignal:${data.length}`); if (Array.isArray(data)) { log.push('ntgSignal:array'); } },
      unmute: async () => { log.push('unmute'); },
      resume: async () => { log.push('resume'); },
      stop: async (id: bigint) => { log.push(`stop:${id}`); },
      onSignalingData: (cb: any) => { fakeNtg._sigCb = cb; },
    };
    let phoneCb: any, sigCb: any;
    const fakeAdapter: any = {
      isAdapter: true,
      getDhConfig: async () => { log.push('getDhConfig'); return { g: 3, p: Buffer.alloc(256, 1), random: Buffer.alloc(256, 1) }; },
      acceptCall: async (_c: bigint, a: bigint, gB: Buffer) => { log.push(`acceptCall:${gB.length}`); log.push(`acceptCallAh:${String(a)}`); return {}; },
      sendSignalingData: async (_c: bigint, _a: bigint, data: Buffer) => { log.push(`adapterSignal:${data.length}`); },
      discardCall: async (_c: bigint, _a: bigint, dur: number) => { log.push(`discardCall:${dur}`); },
      installCallHandler: (onPC: any, onSig: any) => { phoneCb = onPC; sigCb = onSig; return () => {}; },
    };
    const states: Array<[bigint, number]> = [];
    const mgr = new P2PCallManager(fakeNtg, fakeAdapter, { source: { kind: 'file', path: '/tmp/x.mp3' } }, (p, s) => states.push([p, s as number]));
    mgr.start();

    await phoneCb({ className: 'PhoneCallRequested', id: fakeLong('4406014579369388032'), accessHash: fakeLong('8731869724230505667'), adminId: 333n, gAHash: Buffer.alloc(32, 1) });
    await tick();
    assert.ok(log.includes('createP2pCall:333'), 'createP2pCall with peer id');
    assert.ok(log.includes('getDhConfig'), 'getDhConfig fetched');
    assert.ok(log.includes('initExchange'), 'initExchange ran');
    assert.ok(log.includes('initExchange:arrays'), 'initExchange receives JS Arrays (ntgcalls bytes quirk)');
    assert.ok(log.includes('acceptCall:256'), 'acceptCall sent with g_b');
    assert.ok(log.includes('acceptCallAh:8731869724230505667'), 'accessHash converted exactly (big-integer toString)');

    await sigCb(4406014579369388032n, Buffer.alloc(10)); // before connect → queued
    await tick();
    assert.ok(!log.some((c) => c.startsWith('ntgSignal:')), 'signaling queued before connect');

    await phoneCb({ className: 'PhoneCall', id: 4406014579369388032n, accessHash: 8731869724230505667n, gAOrB: Buffer.alloc(256, 2), keyFingerprint: 999n, p2pAllowed: true, connections: [{ id: 1n, ip: '1.2.3.4', ipv6: '', port: 1234, turn: true, stun: false, tcp: false }] });
    await tick();
    assert.ok(log.includes('exchangeKeys'), 'exchangeKeys on confirm');
    assert.ok(log.includes('exchangeKeys:array'), 'exchangeKeys receives a JS Array');
    assert.ok(log.includes('connectP2p:1'), 'connectP2p with 1 RTC server');
    assert.ok(log.includes('connectP2p custom ok:true'), 'customParameters is valid JSON (not empty string)');
    assert.ok(log.includes('connectP2p v2:true'), 'signaling version restricted to V2 (external/MTProto, not SCTP)');
    assert.ok(log.includes('unmute') && log.includes('resume'), 'unmute+resume after connect');
    assert.ok(log.includes('ntgSignal:10'), 'queued signaling flushed after connect');
    assert.ok(log.includes('ntgSignal:array'), 'native signaling data passed as JS Array');
    assert.deepEqual(mgr.activePeers(), [333n], 'active peer tracked');

    fakeNtg._sigCb(333n, Buffer.alloc(5)); // native → Telegram relay
    await tick();
    assert.ok(log.includes('adapterSignal:5'), 'native signaling relayed to adapter');

    await phoneCb({ className: 'PhoneCallDiscarded', id: 4406014579369388032n, reason: { className: 'PhoneCallDiscardReasonHangup' } });
    await tick();
    assert.ok(log.includes('stop:333'), 'native stopped on discard');
    assert.ok(log.some((c) => c.startsWith('discardCall:')), 'discardCall sent');
    assert.deepEqual(mgr.activePeers(), [], 'peer removed after discard');
    assert.ok(states.some(([p, s]) => p === 333n && s === 16), 'CLOSED (16) emitted to consumers on discard');
    await mgr.stop();

    // onIncoming gate rejects → discardCall, no accept.
    const log2: string[] = [];
    const adapter2 = { ...fakeAdapter, acceptCall: async () => { log2.push('accept'); }, discardCall: async () => { log2.push('discard'); }, installCallHandler: (onPC: any) => { phoneCb = onPC; return () => {}; } };
    const mgr2 = new P2PCallManager(fakeNtg, adapter2, { source: { kind: 'file', path: '/tmp/x.mp3' }, onIncoming: () => false });
    mgr2.start();
    await phoneCb({ className: 'PhoneCallRequested', id: 444n, accessHash: 555n, adminId: 666n, gAHash: Buffer.alloc(32, 1) });
    await tick();
    assert.ok(log2.includes('discard') && !log2.includes('accept'), 'onIncoming=false rejects the call');
    await mgr2.stop();
  }

  // --- multi-handler events (v0.6.0): on/off/once/unsubscribe, all handlers run.
  {
    const tgEv = new TgCallsClient({ client, Api });
    const emit = (tgEv as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit.bind(tgEv);
    const wait = () => new Promise((r) => setTimeout(r, 10));
    const seen: string[] = [];
    const h1 = () => { seen.push('h1'); };
    const h2 = () => { seen.push('h2'); };
    tgEv.on('streamEnd', h1);
    tgEv.on('streamEnd', h2);
    emit('streamEnd', { chatId: 1n, source: null, willAutoLeave: false });
    await wait();
    assert.deepEqual(seen, ['h1', 'h2'], 'all handlers run in registration order');

    tgEv.off('streamEnd', h1);
    seen.length = 0;
    emit('streamEnd', { chatId: 1n, source: null, willAutoLeave: false });
    await wait();
    assert.deepEqual(seen, ['h2'], 'off removes a specific handler');

    const un = tgEv.on('streamEnd', h1);
    un(); // unsubscribe via returned function
    seen.length = 0;
    emit('streamEnd', { chatId: 1n, source: null, willAutoLeave: false });
    await wait();
    assert.deepEqual(seen, ['h2'], 'returned unsubscribe removes the handler');

    let onceCount = 0;
    tgEv.once('connectionChange', () => { onceCount++; });
    emit('connectionChange', 1n, 2);
    emit('connectionChange', 1n, 2);
    await wait();
    assert.equal(onceCount, 1, 'once runs exactly once then removes itself');

    // a throwing handler does not stop the others or crash
    seen.length = 0;
    tgEv.on('streamEnd', () => { throw new Error('boom'); });
    tgEv.on('streamEnd', h2);
    emit('streamEnd', { chatId: 1n, source: null, willAutoLeave: false });
    await wait();
    assert.ok(seen.includes('h2'), 'a throwing handler does not block the rest');
    await tgEv.dispose();
  }

  // Stop all native instances before the runner exits. Forced process.exit()
  // while WebRTC worker threads are alive can segfault after the assertions pass.
  await Promise.all([
    tg.dispose(), tgRace.dispose(), tg2.dispose(), tg3.dispose(),
    tg5.dispose(), tgIdleFail.dispose(), tgFailed.dispose(), tgMtcute.dispose(), tgMtcute2.dispose(),
  ]);
  console.log('ALL TESTS PASSED');
  // ntgcalls retains native worker handles after stop(); let queued callbacks
  // drain before exiting, otherwise process.exit can race a WebRTC thread.
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
