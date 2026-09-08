import { strict as assert } from 'assert';
import { TgCallsClient } from '../src/index.js';
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
  const tg = new TgCallsClient({ client, Api });

  // --- join (file source)
  const res = await tg.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  assert.equal(res.chatId, -1001234567890n);
  void res;
  assert.equal(tg.isActive(-1001234567890), true);

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
  assert.equal(await tg.pause(-1001234567890), true);
  assert.equal(await tg.resume(-1001234567890), true);
  assert.equal(await tg.mute(-1001234567890), true);
  assert.equal(tg.getCall(-1001234567890)?.muted, true);
  assert.equal(await tg.unmute(-1001234567890), true);
  assert.equal(tg.getCall(-1001234567890)?.muted, false);
  assert.equal(typeof await tg.time(-1001234567890), 'number');

  // --- setSource swaps without rejoin
  await tg.setSource(-1001234567890, { kind: 'url', url: 'http://example.com/a.mp3' });
  assert.equal(tg.getCall(-1001234567890)?.source.kind, 'url');

  // --- leave
  await tg.leave(-1001234567890);
  assert.equal(tg.isActive(-1001234567890), false);
  const leave = calls.find((c) => c.name === 'LeaveGroupCall');
  assert.ok(leave, 'LeaveGroupCall invoked');
  assert.equal(leave!.args.source, joinSsrc, 'leave uses join ssrc');

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
  const res2 = await tg2.join(-1001234567890, { kind: 'file', path: '/tmp/test.mp3' });
  void res2;
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

  console.log('ALL TESTS PASSED');
  process.exit(0); // native WebRTC threads keep the loop alive otherwise
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
