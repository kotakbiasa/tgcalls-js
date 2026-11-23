import assert from 'node:assert/strict';
import { P2PCallManager } from '../src/calls.js';

const flush = async () => {
  for (let i = 0; i < 5; i++) {await new Promise<void>((resolve) => setImmediate(resolve));}
};

async function checkResponse(wrapped: boolean, mtcute: boolean, allowed?: boolean): Promise<void> {
  let onCall: ((call: unknown) => void) | undefined;
  const connects: Array<{ servers: unknown[]; versions: string[]; p2p: boolean; parameters: string }> = [];
  const errors: unknown[][] = [];
  let fallbackCalls = 0;
  const kind = (name: string) => mtcute
    ? { _: name[0]!.toLowerCase() + name.slice(1) }
    : { className: name };
  const inner = {
    ...kind('PhoneCall'), id: 99n, accessHash: 88n,
    ...(allowed === undefined ? {} : { p2pAllowed: allowed }),
    connections: [{ id: 12n, ip: '192.0.2.1', ipv6: '', port: 443, turn: true, stun: true }],
    protocol: { libraryVersions: ['9.0.0', '13.0.0'] },
    customParameters: { data: '{"transport_option":true}' },
  };
  const native = {
    onSignalingData: () => {}, onFrames: () => {},
    createP2pCall: async () => {}, setStreamSources: async () => {},
    initExchange: async () => Buffer.alloc(32),
    exchangeKeys: async () => ({ keyFingerprint: 33n, gAOrB: Buffer.alloc(256) }),
    connectP2p: async (_id: bigint, servers: unknown[], versions: string[], p2p: boolean, parameters: string) => {
      connects.push({ servers, versions, p2p, parameters });
    },
    sendSignalingData: async () => {}, unmute: async () => {}, resume: async () => {}, stop: async () => {},
  };
  const adapter = {
    isAdapter: true,
    getDhConfig: async () => ({ g: 3, p: Buffer.alloc(256), random: Buffer.alloc(256) }),
    requestCall: async () => ({ phoneCall: { ...kind('PhoneCallWaiting'), id: 99n, accessHash: 88n }, users: [] }),
    confirmCall: async () => wrapped ? { phoneCall: inner, users: [] } : inner,
    // A stale third-party adapter must never receive the nonexistent RPC.
    getCall: async () => { fallbackCalls++; throw new Error('phone.getCall does not exist'); },
    acceptCall: async () => {}, discardCall: async () => {}, sendSignalingData: async () => {},
    installCallHandler: (cb: (call: unknown) => void) => { onCall = cb; return () => {}; },
  };
  const manager = new P2PCallManager(native as never, adapter as never, {
    source: { kind: 'file', path: '/unused-fixture.mp3' }, logger: { error: (...args) => errors.push(args) },
  });
  manager.start();
  try {
    assert.equal(await manager.call(77n), 99n);
    onCall!({ ...kind('PhoneCallAccepted'), id: 99n, gB: Buffer.alloc(256) });
    await flush();
    assert.deepEqual(errors, [], 'RPC-shaped outgoing confirmation does not produce a handling error');
    assert.equal(connects.length, 1, 'confirmed outgoing call starts one transport');
    assert.equal(connects[0]!.servers.length, 1, 'preserves RTC endpoints from inner phoneCall');
    assert.equal(connects[0]!.p2p, allowed === true, 'direct P2P requires an explicitly true peer flag');
    assert.deepEqual(connects[0]!.versions, ['9.0.0'], 'uses the peer versions with the supported V2 subset');
    assert.equal(connects[0]!.parameters, inner.customParameters.data, 'forwards Telegram custom transport parameters');
    assert.equal(fallbackCalls, 0, 'never invokes a nonexistent phone.getCall fallback');
  } finally {
    await manager.stop();
  }
}

await checkResponse(true, false, false);
await checkResponse(true, true, false);
await checkResponse(false, false, false);
await checkResponse(true, true);
await checkResponse(true, false, true);
console.log('P2P RPC shape regression passed (teleproto, mtcute, direct custom adapter).');
