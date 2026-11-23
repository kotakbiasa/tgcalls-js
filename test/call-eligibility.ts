import assert from 'node:assert/strict';
import { TgCallsClient, GramjsAdapter, MtcuteAdapter } from '../src/index.js';

const lookup = {
  userId: 77n, selfId: 11n, selfBot: false, bot: false, deleted: false, blocked: false,
  phoneCallsAvailable: true, phoneCallsPrivate: false, videoCallsAvailable: true,
};
let reads = 0;
const requests: unknown[] = [];
const adapter: any = {
  isAdapter: true,
  resolveChatId: async () => 77n,
  getCallEligibility: async () => { reads++; return { ...lookup }; },
  requestCall: async (...args: unknown[]) => { requests.push(args); throw new Error('must never ring'); },
  dispose: () => {},
};
const tg = new TgCallsClient({ client: adapter });
assert.equal(await tg.canRequestCall('@person'), true);
assert.equal(await tg.getCallDenialReason(77n, { video: true }), null);
for (const [flag, value, reason] of [
  ['selfBot', true, 'BOT_ACCOUNT'], ['bot', true, 'USER_IS_BOT'], ['deleted', true, 'USER_DELETED'],
  ['blocked', true, 'USER_BLOCKED'], ['phoneCallsPrivate', true, 'PRIVACY_RESTRICTED'],
  ['phoneCallsAvailable', false, 'CALLS_UNAVAILABLE'],
] as const) {
  const previous = lookup[flag];
  lookup[flag] = value;
  assert.equal(await tg.getCallDenialReason(77n), reason);
  assert.equal(await tg.canRequestCall(77n), false);
  lookup[flag] = previous;
}
lookup.videoCallsAvailable = false;
assert.equal(await tg.getCallDenialReason(77n), null, 'video restriction does not forbid voice');
assert.equal(await tg.getCallDenialReason(77n, { video: true }), 'VIDEO_UNAVAILABLE');
lookup.videoCallsAvailable = true;
lookup.selfId = 77n;
assert.equal(await tg.getCallDenialReason(77n), 'SELF_CALL');
lookup.selfId = 11n;
assert.equal(await tg.getCallDenialReason(-100123n), 'INVALID_USER');
assert.equal(requests.length, 0, 'eligibility never invokes a ringing RPC');
assert.ok(reads > 0);
const offline = new TgCallsClient({ client: { ...adapter, getCallEligibility: undefined } });
assert.equal(await offline.getCallDenialReason(77n), 'ADAPTER_UNSUPPORTED');
const broken = new TgCallsClient({ client: { ...adapter, getCallEligibility: async () => {throw new Error('network unavailable');} } });
await assert.rejects(broken.canRequestCall(77n), /network unavailable/, 'lookup failure must not be mistaken for a privacy decision');

const gp: any[] = [];
class GetFullUser { static className = 'users.GetFullUser'; className = GetFullUser.className; constructor(public args: any) {} }
const gs: any = new GramjsAdapter({
  getMe: async () => ({ id: { toString: () => '11' }, bot: false }),
  getInputEntity: async (id: bigint) => ({ className: 'InputPeerUser', userId: id, accessHash: 123n }),
  invoke: async (req: any) => { gp.push(req); return { fullUser: { phoneCallsAvailable: true, phoneCallsPrivate: true, videoCallsAvailable: true }, users: [{ id: 77n }] }; },
} as never, { Api: { users: { GetFullUser } } });
const gi = await gs.getCallEligibility(77n);
assert.equal(gi.phoneCallsPrivate, true);
assert.equal(gi.selfId, 11n);
assert.equal(gp[0].className, 'users.GetFullUser');
assert.equal(gp[0].args.id.userId, 77n);

const mr: any[] = [];
const mt: any = new MtcuteAdapter({
  getMe: async () => ({ id: 11, isBot: false }),
  resolvePeer: async (id: unknown) => {assert.equal(id, 77, 'mtcute resolves an int53 user id'); return { _: 'inputPeerUser', userId: 77, accessHash: { low: 3, high: 4 } };},
  call: async (req: any) => {mr.push(req); return { fullUser: { phoneCallsAvailable: true, videoCallsAvailable: false }, users: [{ id: 77 }] };},
  onRawUpdate: { add: () => {} },
} as never);
const mi = await mt.getCallEligibility(77n);
assert.equal(mi.videoCallsAvailable, false);
assert.equal(mi.selfId, 11n);
assert.equal(mr[0]._, 'users.getFullUser');
assert.equal(mr[0].id._, 'inputUser');
await Promise.all([tg.dispose(), offline.dispose(), broken.dispose()]);
console.log('Call eligibility passed without ringing RPCs (both adapters).');
