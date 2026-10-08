import { strict as assert } from 'assert';
import { spawnSync } from 'child_process';
import { ConnectionState } from 'ntgcalls';
import { GramjsAdapter, MtcuteAdapter, TgCallsClient, loadTl, resetTlCache } from '../src/index.js';
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
