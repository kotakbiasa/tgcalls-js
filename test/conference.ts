import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type {
  ConferenceAdapter, ConferenceInfo, NativeConferencePort,
} from '../src/conference.js';

const mod = await import('../src/conference.js');

// RPC-shaped fixtures only. These bytes are opaque controller fixtures, NOT
// cryptographically valid native blocks or recorded Telegram responses.
const CALL: ConferenceInfo = {
  call: { _: 'inputGroupCall', id: 9007199254740993n, accessHash: 8731869724230505667n },
  id: 9007199254740993n, accessHash: 8731869724230505667n,
  conference: true, inviteLink: 'https://t.me/call/fixture_slug',
};
function block(magic: number, marker = 1): Buffer {
  const value = Buffer.alloc(12, marker);
  value.writeUInt32LE(magic, 0);
  return value;
}
function chain(subChainId: number, nextOffset: number, blocks: Buffer[], call = CALL.call): unknown {
  return { _: 'updateGroupCallChainBlocks', call, subChainId, nextOffset, blocks };
}
function updates(...items: unknown[]): unknown {
  return { _: 'updates', updates: items, users: [], chats: [], date: 1, seq: 1 };
}
function bootstrap(): unknown {
  return updates(chain(0, 1, [block(0x639a3db7)]), chain(1, 0, []));
}
function fixture() {
  const trace: Array<{ method: string; args: any[] }> = [];
  const record = (method: string, ...args: any[]) => { trace.push({ method, args }); };
  const native: NativeConferencePort = {
    async createP2pCall(id) { record('native.createP2pCall', id); },
    async initConference(id, userId, lastBlock) {
      record('native.initConference', id, userId, lastBlock);
      return { payload: '{"ssrc":-123}', publicKey: Buffer.alloc(32, 7), block: block(0x639a3db6) };
    },
    async applyBlocks(...args) { record('native.applyBlocks', ...args); },
    async finishSubchainRequest(...args) { record('native.finishSubchainRequest', ...args); },
    async connect(...args) { record('native.connect', ...args); },
    async stop(...args) { record('native.stop', ...args); },
    async updateAudioSsrcMappings(...args) { record('native.updateAudioSsrcMappings', ...args); },
    async addIncomingVideo(...args) { record('native.addIncomingVideo', ...args); return 444; },
    async removeIncomingVideo(...args) { record('native.removeIncomingVideo', ...args); return true; },
    async getEmojisFingerprint() { return 'native fixture emojis'; },
  };
  const adapter: ConferenceAdapter = {
    async getSelfInfo() { record('getSelfInfo'); return { userId: 1234567890123n, isBot: false, authorized: true }; },
    async getConferenceInfo(ref) { record('phone.getGroupCall', ref); return CALL; },
    async createConference(join, options) {
      record('phone.createConferenceCall', {
        _: 'phone.createConferenceCall', ...options,
        publicKey: join.publicKey, block: join.block, params: { _: 'dataJSON', data: join.payload },
      });
      return { info: CALL, connectionParams: '{"transport":"fixture"}', updates: bootstrap() };
    },
    async joinConference(call, join, options) {
      record('phone.joinGroupCall', {
        _: 'phone.joinGroupCall', call, joinAs: { _: 'inputPeerSelf' }, ...options,
        publicKey: join.publicKey, block: join.block, params: { _: 'dataJSON', data: join.payload },
      });
      return { info: CALL, connectionParams: '{"transport":"fixture"}', updates: bootstrap() };
    },
    async getChainBlocks(call, subChainId, offset, limit) {
      record('phone.getGroupCallChainBlocks', { _: 'phone.getGroupCallChainBlocks', call, subChainId, offset, limit });
      return updates(chain(subChainId, subChainId === 0 ? 1 : 0, subChainId === 0 && offset === -1 ? [block(0x639a3db7)] : []));
    },
    async sendConferenceBroadcast(call, value) {
      record('phone.sendConferenceCallBroadcast', { _: 'phone.sendConferenceCallBroadcast', call, block: value });
      return updates(chain(1, 1, [block(0xd1512ae8)]));
    },
    async getParticipants(call, options) {
      record('phone.getGroupParticipants', { _: 'phone.getGroupParticipants', call, ...options });
      return { participants: [], version: 1, nextOffset: '', count: 0 };
    },
    async inviteConferenceParticipant(call, user, options) {
      record('phone.inviteConferenceCallParticipant', { _: 'phone.inviteConferenceCallParticipant', call, userId: user, ...options });
      return updates();
    },
    async leaveConference(call, source) { record('phone.leaveGroupCall', { _: 'phone.leaveGroupCall', call, source }); },
  };
  let nextId = -5000n;
  const controller = () => {
    assert.equal(typeof mod.ConferenceController, 'function', 'ConferenceController core is not implemented');
    return new mod.ConferenceController({ native, adapter, allocateNativeId: () => --nextId });
  };
  return { native, adapter, trace, record, controller };
}

test('create uses a native P2P placeholder, joins conference with native public bytes, and leaves with the same SSRC', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference({
    prepareCapture: async (id) => { f.record('capture', id); },
  });
  assert.equal(handle.callId, CALL.id);
  const names = f.trace.map((entry) => entry.method);
  assert(names.indexOf('native.createP2pCall') < names.indexOf('native.initConference'));
  assert(names.indexOf('native.initConference') < names.indexOf('capture'));
  assert(names.indexOf('capture') < names.indexOf('phone.createConferenceCall'));
  const request = f.trace.find((entry) => entry.method === 'phone.createConferenceCall')!.args[0];
  assert.equal(request.join, true);
  assert.equal(request.muted, true);
  assert.equal(request.videoStopped, true);
  assert(Number.isInteger(request.randomId));
  assert(Buffer.isBuffer(request.publicKey));
  assert.equal(request.publicKey.length, 32);
  assert.equal(request.params.data, '{"ssrc":-123}');
  assert.equal(request.block.readUInt32LE(), 0x639a3db6);
  const apply = f.trace.find((entry) => entry.method === 'native.applyBlocks')!;
  assert(Array.isArray(apply.args[3]) && Array.isArray(apply.args[3][0]));
  assert.equal(Buffer.from(apply.args[3][0]).readUInt32LE(), 0x639a3db7, 'server constructor stays intact');
  assert.deepEqual(c.getState(handle).nextOffset, [1, 0]);
  assert.equal(c.getState(handle).joined, true);
  assert.equal(await c.exportConferenceInvite(handle), CALL.inviteLink);
  await c.inviteConferenceParticipants(handle, [42n], { video: true });
  const invite = f.trace.find((entry) => entry.method === 'phone.inviteConferenceCallParticipant')!.args[0];
  assert.equal(invite.video, true);
  assert.equal(invite.userId, 42n);
  await c.leaveConference(handle);
  await c.leaveConference(handle);
  assert.equal(f.trace.filter((entry) => entry.method === 'phone.leaveGroupCall').length, 1);
  const leave = f.trace.find((entry) => entry.method === 'phone.leaveGroupCall')!.args[0];
  assert.equal(leave.source, -123);
  assert.strictEqual(leave.call, CALL.call);
  assert(names.includes('native.connect'));
  assert.equal(c.getState(handle).joined, false);
  assert.deepEqual(c.getState(handle).nextOffset, [-1, -1]);
});

test('join resolves slug or invite-message, seeds only initConference from latest server block, and retries chain conflicts with a fresh native slot', async () => {
  for (const ref of [{ slug: 'fixture_slug' }, { inviteMessageId: 17 }]) {
    const f = fixture();
    const c = f.controller();
    let attempts = 0;
    const join = f.adapter.joinConference;
    f.adapter.joinConference = async (...args) => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('conflict'), { errorMessage: 'CONF_WRITE_CHAIN_INVALID_BLOCK' });
      return join(...args);
    };
    const handle = await c.joinConference(ref);
    assert.equal(attempts, 2);
    const init = f.trace.filter((entry) => entry.method === 'native.initConference');
    assert.equal(init.length, 2);
    assert.notEqual(init[0].args[0], init[1].args[0], 'conflict requires a new native handle/session');
    for (const item of init) {
      assert(Array.isArray(item.args[2]));
      assert.equal(Buffer.from(item.args[2]).readUInt32LE(), 0x639a3db7);
    }
    const fetches = f.trace.filter((entry) => entry.method === 'phone.getGroupCallChainBlocks');
    assert.equal(fetches.length, 2);
    assert.equal(fetches[0].args[0].subChainId, 0);
    assert.equal(fetches[0].args[0].offset, -1);
    assert.equal(fetches[0].args[0].limit, 1);
    assert.deepEqual(f.trace.find((entry) => entry.method === 'phone.getGroupCall')!.args[0], ref);
    assert.equal(f.trace.filter((entry) => entry.method === 'native.applyBlocks' && entry.args[1] === 0).length, 1, 'prejoin fetch never applies blocks');
    assert.equal(f.trace.filter((entry) => entry.method === 'native.stop').length, 1);
    await c.leaveConference(handle);
  }
  const f = fixture();
  const c = f.controller();
  f.adapter.joinConference = async () => { throw Object.assign(new Error('conflict'), { errorMessage: 'CONF_WRITE_CHAIN_INVALID' }); };
  await assert.rejects(() => c.joinConference({ slug: 'fixture_slug' }), /retry limit/i);
  assert.equal(f.trace.filter((entry) => entry.method === 'native.initConference').length, 3, 'bounded to three attempts');
  assert.equal(f.trace.filter((entry) => entry.method === 'native.stop').length, 3);
});

test('chain updates ignore prejoin passive data, dedupe virtual offsets, preserve server bytes, and reject constructor tampering before native', async () => {
  const f = fixture();
  const c = f.controller();
  await c.joinConference({ slug: 'fixture_slug' }, {
    prepareCapture: async () => {
      await c.onServerUpdates(bootstrap());
      assert.equal(f.trace.filter((entry) => entry.method === 'native.applyBlocks').length, 0);
    },
  });
  const handle = c.getHandles()[0];
  f.trace.length = 0;
  const main = block(0x639a3db7, 2);
  await c.onServerUpdates(updates(
    chain(0, 2, [main], { _: 'inputGroupCall', id: 17n }),
    chain(0, 2, [block(0x639a3db7), main]),
    chain(1, 2, [block(0xd1512ae8), block(0x83f4f9d9)]),
  ));
  const applied = f.trace.filter((entry) => entry.method === 'native.applyBlocks');
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[0].args[3], [Array.from(main)], 'duplicate offset zero is skipped');
  assert.equal(applied[0].args[4], false);
  assert.deepEqual(c.getState(handle).nextOffset, [2, 2]);
  await c.onServerUpdates(updates(chain(0, 2, [main])));
  assert.equal(f.trace.filter((entry) => entry.method === 'native.applyBlocks').length, 2);
  for (const bad of [block(0x639a3db6), block(0xd1512ae8), Buffer.from([1])]) {
    await assert.rejects(() => c.onServerUpdates(updates(chain(0, 3, [bad]))), /constructor/);
  }
  await assert.rejects(() => c.onServerUpdates(updates(chain(0, 2, [block(0x639a3db7, 99)]))), /conflicting.*offset/i);
  f.native.applyBlocks = async () => { throw new Error('native rejected block'); };
  await assert.rejects(() => c.onServerUpdates(updates(chain(0, 3, [block(0x639a3db7, 3)]))), /native rejected/);
  assert.deepEqual(c.getState(handle).nextOffset, [2, 2], 'native failure cannot advance offsets');
  await c.leaveConference(handle);
});

test('subchain relay pages exact request fields and always finishes including empty, failed and prejoin requests', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  f.trace.length = 0;
  let requests = 0;
  f.adapter.getChainBlocks = async (call, subChainId, offset, limit) => {
    f.record('page', { call, subChainId, offset, limit });
    requests++;
    return requests === 1
      ? updates(chain(1, 2, [block(0xd1512ae8), block(0x83f4f9d9)]))
      : updates(chain(1, 3, [block(0xd1512ae8, 3)]));
  };
  await c.onSubchainRequest(handle.nativeId, { subchain: 1, height: 0, limit: 2 });
  const pages = f.trace.filter((entry) => entry.method === 'page');
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((entry) => entry.args[0]), [
    { call: CALL.call, subChainId: 1, offset: 0, limit: 2 },
    { call: CALL.call, subChainId: 1, offset: 2, limit: 2 },
  ]);
  assert(f.trace.filter((entry) => entry.method === 'native.applyBlocks').every((entry) => entry.args[4] === true));
  assert.equal(f.trace.filter((entry) => entry.method === 'native.finishSubchainRequest').length, 1);
  f.adapter.getChainBlocks = async () => { throw new Error('offline RPC error'); };
  await assert.rejects(() => c.onSubchainRequest(handle.nativeId, { subchain: 1, height: 3, limit: 2 }), /offline RPC error/);
  assert.equal(f.trace.filter((entry) => entry.method === 'native.finishSubchainRequest').length, 2);
  f.adapter.getChainBlocks = async () => updates(chain(1, 3, []));
  await c.onSubchainRequest(handle.nativeId, { subchain: 1, height: 3, limit: 2 });
  assert.equal(f.trace.filter((entry) => entry.method === 'native.finishSubchainRequest').length, 3);
  await c.leaveConference(handle);
});

test('native verification broadcasts go only to sendConferenceCallBroadcast and are applied only from server echo', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  f.trace.length = 0;
  const outbound = block(0xd1512ae7);
  await c.onOutboundBlock(handle.nativeId, outbound);
  const request = f.trace.find((entry) => entry.method === 'phone.sendConferenceCallBroadcast')!.args[0];
  assert(Buffer.isBuffer(request.block));
  assert.deepEqual(request.block, outbound);
  const applied = f.trace.find((entry) => entry.method === 'native.applyBlocks')!;
  assert.equal(Buffer.from(applied.args[3][0]).readUInt32LE(), 0xd1512ae8);
  assert.equal(f.trace.filter((entry) => entry.method === 'phone.joinGroupCall').length, 0);
  await assert.rejects(() => c.onOutboundBlock(handle.nativeId, block(0x639a3db6)), /verification/);
  await c.leaveConference(handle);
});

test('participant snapshots page completely and native requests replace full user/SSRC mappings with signed sources normalized', async () => {
  const f = fixture();
  const c = f.controller();
  const userA = { peer: { kind: 'user' as const, id: 42n }, source: -1 };
  const userB = {
    peer: { kind: 'user' as const, id: 84n }, source: 71,
    presentation: { endpoint: 'screen-b', audioSource: -2, sourceGroups: [{ semantics: 'SIM', sources: [-3, 74] }] },
  };
  const queried: any[] = [];
  f.adapter.getParticipants = async (_call, options) => {
    queried.push(options);
    if (options.sources.length) return { participants: [{ peer: { kind: 'user', id: 126n }, source: 99 }], version: 7, nextOffset: '', count: 1 };
    return options.offset === ''
      ? { participants: [userA], version: 7, nextOffset: 'next', count: 2 }
      : { participants: [userB], version: 7, nextOffset: '', count: 2 };
  };
  const handle = await c.createConference();
  assert.deepEqual(queried.map((item) => item.offset), ['', 'next']);
  const mapping = () => f.trace.filter((item) => item.method === 'native.updateAudioSsrcMappings').at(-1)!.args[1];
  assert.deepEqual(mapping(), [{ userId: 42n, ssrc: 0xffffffff }, { userId: 84n, ssrc: 71 }, { userId: 84n, ssrc: 0xfffffffe }]);
  const video = f.trace.find((item) => item.method === 'native.addIncomingVideo')!;
  assert.equal(video.args[1], 84n, 'video crypto identity is the user id, not SSRC');
  assert.deepEqual(video.args[3], [{ semantics: 'SIM', ssrcs: [0xfffffffd, 74] }]);
  await c.onRequestParticipants(handle.nativeId, { ssrcs: [99] });
  assert.deepEqual(queried.at(-1).sources, [99]);
  assert.deepEqual(mapping(), [{ userId: 42n, ssrc: 0xffffffff }, { userId: 84n, ssrc: 71 }, { userId: 84n, ssrc: 0xfffffffe }, { userId: 126n, ssrc: 99 }]);
  await c.onParticipantsUpdate(handle.nativeId, { participants: [{ ...userB, left: true }], version: 8 });
  assert.deepEqual(mapping(), [{ userId: 42n, ssrc: 0xffffffff }, { userId: 126n, ssrc: 99 }]);
  assert.equal(f.trace.filter((item) => item.method === 'native.removeIncomingVideo').at(-1)!.args[1], 'screen-b');
  const before = f.trace.filter((item) => item.method === 'native.updateAudioSsrcMappings').length;
  await assert.rejects(() => c.onParticipantsUpdate(handle.nativeId, { participants: [{ peer: { kind: 'channel', id: 99n }, source: 121 }], version: 9 }), /user identity/i);
  await assert.rejects(() => c.onParticipantsUpdate(handle.nativeId, { participants: [{ peer: { kind: 'user', id: 10n }, source: -1 }], version: 9 }), /SSRC.*different users/i);
  assert.equal(f.trace.filter((item) => item.method === 'native.updateAudioSsrcMappings').length, before);
  await c.leaveConference(handle);
});

test('unsupported kick, rekey, application encryption and crypto health reject before RPC and do not expose native secrets', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  f.trace.length = 0;
  const capabilities = c.getCapabilities();
  assert.equal(capabilities.removeParticipants, false);
  assert.equal(capabilities.rekey, false);
  assert.equal(capabilities.applicationEncryption, false);
  assert.equal(capabilities.cryptoHealth, false);
  for (const op of [
    () => c.removeConferenceParticipants(handle, [42n], { kick: true }),
    () => c.rekeyConference(handle),
    () => c.sendConferenceMessage(handle, { text: 'must never become plaintext', entities: [] }),
    () => c.onEncryptedMessage(handle.nativeId, { fromId: { _: 'peerUser', userId: 42n }, encryptedMessage: Buffer.alloc(32) }),
    () => c.getCryptoHealth(handle),
  ]) await assert.rejects(op, (error: any) => error.name === 'UnsupportedNativeCapabilityError');
  assert.equal(f.trace.length, 0, 'no RPC/native operation is allowed for unavailable capabilities');
  assert(!/private|secret|epochKey/i.test(JSON.stringify(c.getState(handle))));
  assert.equal(capabilities.fullSecurityConformance, false);
  await c.leaveConference(handle);
});

test('optional native 3.0.7 offline echo fixture is explicitly SIMULATED, never a live conference proof', { skip: process.env.CONFERENCE_NATIVE_SIMULATED_ECHO !== '1' }, async () => {
  // Isolate native worker threads and bound process lifetime. The server echo
  // below ONLY simulates Telegram's constructor +1 rule; it is not an RPC.
  const { spawnSync } = await import('node:child_process');
  const program = `
    import assert from 'node:assert/strict';
    import { NTgCalls, setLogLevel, LogLevel } from 'ntgcalls';
    setLogLevel(LogLevel.SILENT);
    const a = new NTgCalls();
    const b = new NTgCalls();
    const echo = (bytes) => {
      const output = Buffer.from(bytes);
      output.writeUInt32LE((output.readUInt32LE() + 1) >>> 0);
      return output;
    };
    let commitment = null;
    a.onOutboundBlock((_id, bytes) => { commitment = Buffer.from(bytes).readUInt32LE(); });
    try {
      await a.createP2pCall(-90001n);
      const genesis = await a.initConference(-90001n, 10001n, null);
      assert.equal(genesis.publicKey.length, 32);
      assert.equal(Buffer.from(genesis.block).readUInt32LE(), 0x639a3db6);
      const serverGenesis = echo(genesis.block);
      await a.applyBlocks(-90001n, 0, 1, [Array.from(serverGenesis)], false);
      await a.applyBlocks(-90001n, 1, 0, [], false);
      await b.createP2pCall(-90002n);
      const join = await b.initConference(-90002n, 10002n, Array.from(serverGenesis));
      assert.equal(join.publicKey.length, 32);
      assert.equal(Buffer.from(join.block).readUInt32LE(), 0x639a3db6);
      const serverJoin = echo(join.block);
      await a.applyBlocks(-90001n, 0, 2, [Array.from(serverJoin)], false);
      await b.applyBlocks(-90002n, 0, 2, [Array.from(serverJoin)], false);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(commitment, 0xd1512ae7);
      console.log(JSON.stringify({ evidence: 'SIMULATED_SERVER_ECHO_NATIVE_OFFLINE', native: '3.0.7', publicKeyBytes: 32, genesisBytes: genesis.block.length, joinBytes: join.block.length, commitmentMagic: commitment.toString(16), liveVerified: false, cryptoHealthVerified: false }));
    } finally {
      await a.stop(-90001n); await b.stop(-90002n);
    }
    process.exit(0);
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const evidence = child.stdout.split('\n').find((line) => line.startsWith('{"evidence"'));
  assert(evidence, 'native fixture must label simulated evidence');
  const result = JSON.parse(evidence);
  assert.equal(result.liveVerified, false);
  assert.equal(result.commitmentMagic, 'd1512ae7');
  console.log(evidence);
});

test('outbound server commit echo can generate a reveal that is drained in the same serialized relay', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  const apply = f.native.applyBlocks;
  const broadcast = f.adapter.sendConferenceBroadcast;
  let sends = 0;
  f.adapter.sendConferenceBroadcast = async (...args) => {
    sends++;
    return sends === 1 ? broadcast(...args) : updates(chain(1, 2, [block(0x83f4f9d9)]));
  };
  let revealed = false;
  f.native.applyBlocks = async (...args) => {
    await apply(...args);
    if (args[1] === 1 && !revealed) {
      revealed = true; await c.onOutboundBlock(handle.nativeId, block(0x83f4f9d8));
    }
  };
  await c.onOutboundBlock(handle.nativeId, block(0xd1512ae7));
  assert.equal(sends, 2, 'native reveal generated during apply cannot remain stranded');
  assert.deepEqual(c.getState(handle).nextOffset, [1, 2]);
  await c.dispose();
  assert.equal(c.getHandles().length, 0);
});

test('gap response that is still ahead rejects rather than recursively polling forever', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  let requests = 0;
  f.adapter.getChainBlocks = async () => { requests++; return updates(chain(0, 9, [block(0x639a3db7, 9)])); };
  await assert.rejects(() => c.onSubchainRequest(handle.nativeId, { subchain: 0, height: 1, limit: 50 }), /gap.*poll|poll.*gap/i);
  assert.equal(requests, 1);
  await c.leaveConference(handle);
});

test('missing core native methods are capability-gated before any adapter RPC', async () => {
  const f = fixture();
  Object.defineProperty(f.native, 'initConference', { value: undefined });
  const c = f.controller();
  assert.equal(c.getCapabilities().coreLifecycle, false);
  await assert.rejects(() => c.createConference(), (error: any) => error.name === 'UnsupportedNativeCapabilityError');
  await assert.rejects(() => c.joinConference({ slug: 'fixture_slug' }), (error: any) => error.name === 'UnsupportedNativeCapabilityError');
  assert.equal(f.trace.length, 0);
});

test('empty main bootstrap and nonconference targets fail before connect; no normal VC fallback exists', async () => {
  const f = fixture();
  const c = f.controller();
  f.adapter.getConferenceInfo = async () => ({ ...CALL, conference: false });
  await assert.rejects(() => c.joinConference({ slug: 'fixture_slug' }), /not a conference/);
  assert.equal(f.trace.filter((item) => item.method === 'native.createP2pCall').length, 0);
  f.adapter.createConference = async () => ({ info: CALL, connectionParams: '{}', updates: updates(chain(0, 0, []), chain(1, 0, [])) });
  await assert.rejects(() => c.createConference(), /main.*echo/i);
  assert.equal(f.trace.filter((item) => item.method === 'native.connect').length, 0);
  assert.equal(f.trace.filter((item) => item.method === 'phone.leaveGroupCall').length, 1);
});

test('native is stopped even when membership cleanup RPC fails', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  f.adapter.leaveConference = async () => { throw new Error('leave RPC failed'); };
  await assert.rejects(() => c.leaveConference(handle), /leave RPC failed/);
  assert.equal(f.trace.filter((item) => item.method === 'native.stop').length, 1);
  assert.equal(c.getState(handle).stopped, true);
  assert.equal(c.getHandles().length, 0);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('poll cadence is 1s while verification is pending and 5s after native emoji; leave cancels all wakeups', async () => {
  const f = fixture();
  const scheduled: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  const c = new mod.ConferenceController({
    native: f.native, adapter: f.adapter, allocateNativeId: () => -777n,
    schedule(callback, delay) {
      const item = { callback, delay, cancelled: false }; scheduled.push(item);
      return () => { item.cancelled = true; };
    },
  });
  const handle = await c.createConference();
  assert.equal(scheduled.at(-1)?.delay, 1000);
  await c.onUpdateEmojis(handle.nativeId, 'native fixture emojis');
  assert.equal(scheduled[0].cancelled, true);
  assert.equal(scheduled.at(-1)?.delay, 5000);
  await c.onServerUpdates(updates(chain(0, 2, [block(0x639a3db7, 2)])));
  assert.equal(scheduled.at(-1)?.delay, 1000);
  const previous = f.trace.length;
  const timer = scheduled.at(-1)!;
  await c.leaveConference(handle);
  assert.equal(timer.cancelled, true);
  const stopped = f.trace.length;
  timer.callback(); await c.flush(handle);
  assert.equal(f.trace.length, stopped);
  assert(stopped > previous);
});

test('prejoin native subchain request is finished without a chain RPC', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference({ prepareCapture: async (nativeId) => {
    await c.onSubchainRequest(nativeId, { subchain: 0, height: 0, limit: 50 });
  } });
  assert.equal(f.trace.filter((item) => item.method === 'native.finishSubchainRequest').length, 1);
  assert.equal(f.trace.filter((item) => item.method === 'phone.getGroupCallChainBlocks').length, 0);
  await c.leaveConference(handle);
});

test('incomplete or malformed bootstrap rolls back server membership and native slot', async () => {
  for (const response of [updates(chain(0, 1, [block(0x639a3db7)])), updates(chain(0, 1, [block(0x639a3db6)]), chain(1, 0, []))]) {
    const f = fixture();
    f.adapter.createConference = async () => ({ info: CALL, connectionParams: '{}', updates: response });
    const c = f.controller();
    await assert.rejects(() => c.createConference(), /bootstrap|constructor/);
    assert.equal(f.trace.filter((item) => item.method === 'phone.leaveGroupCall').length, 1);
    assert.equal(f.trace.filter((item) => item.method === 'native.stop').length, 1);
    assert.equal(f.trace.filter((item) => item.method === 'native.connect').length, 0);
  }
});

test('abort during create rolls back late membership and never connects or applies stale server echo', async () => {
  const f = fixture();
  const c = f.controller();
  const abort = new AbortController();
  const response = deferred<Awaited<ReturnType<ConferenceAdapter['createConference']>>>();
  const started = deferred<void>();
  f.adapter.createConference = async () => { started.resolve(); return response.promise; };
  const creating = c.createConference({ signal: abort.signal });
  const rejected = assert.rejects(creating, /cancelled/);
  await started.promise;
  abort.abort();
  response.resolve({ info: CALL, connectionParams: '{}', updates: bootstrap() });
  await rejected;
  assert.equal(f.trace.filter((entry) => entry.method === 'phone.leaveGroupCall').length, 1);
  assert.equal(f.trace.filter((entry) => entry.method === 'native.stop').length, 1);
  assert.equal(f.trace.filter((entry) => entry.method === 'native.connect').length, 0);
  assert.equal(f.trace.filter((entry) => entry.method === 'native.applyBlocks').length, 0);
  assert.equal(c.getHandles().length, 0);
});

test('leave aborts pending chain RPC, finishes native request before stop, and ignores late responses', async () => {
  const f = fixture();
  const c = f.controller();
  const handle = await c.createConference();
  f.trace.length = 0;
  const response = deferred<unknown>();
  const started = deferred<void>();
  f.adapter.getChainBlocks = async (_call, _subchain, _offset, _limit, signal) => {
    assert(signal); started.resolve(); return response.promise;
  };
  const polling = c.onSubchainRequest(handle.nativeId, { subchain: 0, height: 1, limit: 50 });
  const rejected = assert.rejects(polling, /cancelled/);
  await started.promise;
  await c.leaveConference(handle);
  await rejected;
  response.resolve(updates(chain(0, 2, [block(0x639a3db7, 2)])));
  await Promise.resolve();
  const names = f.trace.map((entry) => entry.method);
  assert(names.indexOf('native.finishSubchainRequest') >= 0);
  assert(names.indexOf('native.finishSubchainRequest') < names.indexOf('native.stop'));
  assert.equal(names.filter((name) => name === 'native.applyBlocks').length, 0);
  assert.deepEqual(c.getState(handle).nextOffset, [-1, -1]);
  const count = f.trace.length;
  await c.onSubchainRequest(handle.nativeId, { subchain: 0, height: 1, limit: 50 });
  await c.onOutboundBlock(handle.nativeId, block(0xd1512ae7));
  await c.onServerUpdates(bootstrap());
  assert.equal(f.trace.length, count, 'late native and passive events are inert');
});

test('RPC deadline finishes short polling and exposes an error without an unbounded native request', async () => {
  const f = fixture();
  assert.equal(typeof mod.ConferenceController, 'function');
  const c = new mod.ConferenceController({ native: f.native, adapter: f.adapter, allocateNativeId: () => -777n, rpcTimeoutMs: 20 });
  const handle = await c.createConference();
  f.adapter.getChainBlocks = async () => new Promise(() => undefined);
  await assert.rejects(() => c.onSubchainRequest(handle.nativeId, { subchain: 1, height: 0, limit: 50 }), /deadline/i);
  await c.leaveConference(handle);
});

test('gap recovery polls from committed offsets, queues verification until join echo, and withholds stale emoji after a main update', async () => {
  const f = fixture();
  const c = f.controller();
  const apply = f.native.applyBlocks;
  let boot = true;
  f.native.applyBlocks = async (...args) => {
    await apply(...args);
    if (args[1] === 0 && boot) {
      boot = false;
      // Like the real native event router: event promises are observed outside
      // the native callback; native is not waiting on the outbound RPC.
      await c.onOutboundBlock(args[0], block(0xd1512ae7));
    }
  };
  const handle = await c.createConference();
  assert.equal(f.trace.filter((item) => item.method === 'phone.sendConferenceCallBroadcast').length, 1, 'bootstrap commit cannot be dropped');
  assert.equal(await c.getEmojiFingerprint(handle), null);
  await c.onUpdateEmojis(handle.nativeId, 'fresh native fixture emojis');
  assert.equal(await c.getEmojiFingerprint(handle), 'fresh native fixture emojis');
  f.adapter.getChainBlocks = async (call, subchain, offset, limit) => {
    f.record('gap.poll', { call, subchain, offset, limit });
    return subchain === 0 ? updates(chain(0, 3, [block(0x639a3db7, 2), block(0x639a3db7, 3)])) : updates(chain(1, 1, []));
  };
  await c.onServerUpdates(updates(chain(0, 3, [block(0x639a3db7, 3)])));
  await c.flush(handle);
  assert.deepEqual(c.getState(handle).nextOffset, [3, 1]);
  const poll = f.trace.find((item) => item.method === 'gap.poll')!.args[0];
  assert.deepEqual(poll, { call: CALL.call, subchain: 0, offset: 1, limit: 50 });
  assert.equal(await c.getEmojiFingerprint(handle), null, 'previous epoch emoji must not be displayed');
  await c.onUpdateEmojis(handle.nativeId, 'next native fixture emojis');
  assert.equal(await c.getEmojiFingerprint(handle), 'next native fixture emojis');
  await c.leaveConference(handle);
});

test('GROUPCALL_FORBIDDEN in polling or broadcast performs a bounded fresh native rejoin without replaying the old epoch broadcast', async () => {
  for (const trigger of ['poll', 'broadcast']) {
    const f = fixture();
    const c = f.controller();
    const handle = await c.createConference();
    const previousId = handle.nativeId;
    const chainRpc = f.adapter.getChainBlocks;
    const broadcastRpc = f.adapter.sendConferenceBroadcast;
    let forbidden = true;
    f.adapter.getChainBlocks = async (...args) => {
      if (trigger === 'poll' && forbidden) { forbidden = false; throw Object.assign(new Error('membership lost'), { errorMessage: 'GROUPCALL_FORBIDDEN' }); }
      return chainRpc(...args);
    };
    f.adapter.sendConferenceBroadcast = async (...args) => {
      if (trigger === 'broadcast' && forbidden) { forbidden = false; throw Object.assign(new Error('membership lost'), { errorMessage: 'GROUPCALL_FORBIDDEN' }); }
      return broadcastRpc(...args);
    };
    if (trigger === 'poll') await c.onSubchainRequest(previousId, { subchain: 0, height: 1, limit: 50 });
    else await c.onOutboundBlock(previousId, block(0xd1512ae7));
    assert.notEqual(handle.nativeId, previousId);
    assert.equal(handle.callId, CALL.id);
    assert.equal(c.getState(handle).joined, true);
    assert.deepEqual(c.getState(handle).nextOffset, [1, 0]);
    assert.equal(f.trace.filter((item) => item.method === 'phone.joinGroupCall').length, 1);
    assert.equal(f.trace.filter((item) => item.method === 'native.stop').length, 1);
    assert.equal(f.trace.filter((item) => item.method === 'phone.leaveGroupCall').length, 0, 'lost membership has no old live membership to leave');
    assert.equal(f.trace.filter((item) => item.method === 'phone.sendConferenceCallBroadcast').length, 0, 'old native epoch block is never replayed into a fresh session');
    const count = f.trace.length;
    await c.onOutboundBlock(previousId, block(0xd1512ae7));
    assert.equal(f.trace.length, count);
    await c.leaveConference(handle);
  }
});





