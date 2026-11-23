import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { P2PCallManager } from '../src/calls.js';
import { StreamMode } from 'ntgcalls';

const tick = async () => {for (let i = 0; i < 8; i++) {await new Promise<void>((resolve) => setImmediate(resolve));}};
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-lifecycle-'));
function fixture(record?: string) {
  let onCall: (call: unknown) => void;
  let nextId = 100n;
  const order: string[] = [];
  const playback: any[] = [];
  const native = {
    onSignalingData: () => {}, onFrames: () => {},
    createP2pCall: async () => {},
    setStreamSources: async (_id: bigint, mode: StreamMode, media: any) => {
      if (mode === StreamMode.PLAYBACK) {playback.push(media); order.push(Object.keys(media).length ? 'configure' : 'close');}
    },
    initExchange: async () => Buffer.alloc(32),
    exchangeKeys: async () => {order.push('exchange'); return { keyFingerprint: 33n, gAOrB: Buffer.alloc(256) };},
    connectP2p: async () => {}, sendSignalingData: async () => {}, unmute: async () => {}, resume: async () => {},
    stop: async () => {order.push('stop');},
  };
  const adapter = {
    isAdapter: true, getDhConfig: async () => ({ g: 3, p: Buffer.alloc(256), random: Buffer.alloc(256) }),
    requestCall: async () => ({ phoneCall: { id: nextId++, accessHash: 88n }, users: [] }),
    confirmCall: async (id: bigint) => ({ phoneCall: { id, accessHash: 88n, connections: [], protocol: { libraryVersions: ['8.0.0'] } }, users: [] }),
    acceptCall: async () => {}, discardCall: async () => {order.push('discard');}, sendSignalingData: async () => {},
    installCallHandler: (cb: (call: unknown) => void) => {onCall = cb; return () => {};},
  };
  const manager = new P2PCallManager(native as never, adapter as never, { source: { kind: 'file', path: '/not-opened.mp3' }, record, logger: { error: () => {} } });
  manager.start();
  return { manager, order, playback, emit: (pc: unknown) => onCall(pc) };
}
try {
  const stopped = fixture(path.join(dir, 'default.wav'));
  await stopped.manager.call(7n, { record: false });
  stopped.emit({ _: 'phoneCallAccepted', id: 100n, gB: Buffer.alloc(256) });
  await tick();
  assert.equal(stopped.playback[0]?.microphone?.input, '', 'false override disables the listener recording default');
  await stopped.manager.stop();
  assert.equal(stopped.order.filter((x) => x === 'discard').length, 1, 'stopListening hangs up the Telegram call, not only the local native slot');

  const inherited = fixture(path.join(dir, 'inherited.wav'));
  await inherited.manager.call(8n);
  inherited.emit({ _: 'phoneCallAccepted', id: 100n, gB: Buffer.alloc(256) });
  inherited.emit({ _: 'phoneCallAccepted', id: 100n, gB: Buffer.alloc(256) });
  await tick();
  assert.equal(inherited.order.filter((x) => x === 'exchange').length, 1, 'duplicate Accepted is serialized before asynchronous exchange/confirm');
  assert.ok(inherited.playback[0]?.microphone?.input.includes('inherited.wav'), 'per-call undefined inherits the listener target');
  await assert.rejects(inherited.manager.call(9n), /recording.*(path|target).*use|already.*record/i, 'active recordings cannot share the same target and truncate each other');
  await inherited.manager.stop();
  assert.ok(inherited.order.indexOf('close') < inherited.order.indexOf('stop'));
  assert.equal(inherited.manager.activePeers().length, 0);
  await inherited.manager.stop();
  assert.equal(inherited.order.filter((x) => x === 'discard').length, 1, 'repeated stop does not hang up twice');
  console.log('P2P recording inheritance/disable, path isolation, accepted dedupe and remote hangup passed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
