import assert from 'node:assert/strict';
import { TgCallsClient } from '../src/index.js';
const trace: any[] = [], callbacks = new Map<string, Function>();
const call = { id: 81n, accessHash: 82n };
const info = { call, id: 81n, accessHash: 82n, conference: true, inviteLink: 'https://t.me/call/facade_fixture' };
const block = (magic: number) => {const data = Buffer.alloc(12); data.writeUInt32LE(magic); return data;};
const chain = (subChainId: number, nextOffset: number, blocks: Buffer[]) => ({ _: 'updateGroupCallChainBlocks', call, subChainId, nextOffset, blocks });
const bootstrap = { _: 'updates', updates: [chain(0, 1, [block(0x639a3db7)]), chain(1, 0, [])] };
const adapter: any = {
  isAdapter: true, resolveChatId: async (id: bigint) => id,
  getGroupCall: async () => call, joinGroupCall: async () => ({}), leaveGroupCall: async () => {},
  joinPresentationCall: async () => {}, leavePresentationCall: async () => {}, extractConnectionParams: () => null,
  installUpdateHandler: () => () => {}, dispose: () => {},
  getSelfInfo: async () => ({ userId: 5n, isBot: false, authorized: true }),
  getConferenceInfo: async () => info,
  createConference: async () => {trace.push('create-rpc'); return { info, connectionParams: '{"transport":"fixture"}', updates: bootstrap };},
  joinConference: async () => ({ info, connectionParams: '{"transport":"fixture"}', updates: bootstrap }),
  getChainBlocks: async () => bootstrap,
  sendConferenceBroadcast: async () => ({ _: 'updates', updates: [] }),
  getParticipants: async () => ({ participants: [], version: 1, nextOffset: '', count: 0 }),
  inviteConferenceParticipant: async (_call: unknown, user: bigint, options: any) => {trace.push(['invite', user, options.video]); return { updates: [] };},
  leaveConference: async (_call: unknown, ssrc: number) => {trace.push(['leave', ssrc]);},
};
const tg = new TgCallsClient({ client: adapter });
for (const [name, value] of Object.entries({
  createP2pCall: async (id: bigint) => {trace.push(['native.create', id]);},
  initConference: async (id: bigint) => {trace.push(['init', id]); return { payload: '{"ssrc":-17}', publicKey: Buffer.alloc(32, 3), block: block(0x639a3db6) };},
  applyBlocks: async (...args: any[]) => {trace.push(['blocks', ...args]);},
  connect: async () => {trace.push('connect');}, stop: async () => {trace.push('stop');},
  setStreamSources: async (...args: any[]) => {trace.push(['capture', ...args]);},
  mute: async () => true, unmute: async () => true, pause: async () => true, resume: async () => true,
  finishSubchainRequest: async () => {}, updateAudioSsrcMappings: async () => {},
  addIncomingVideo: async () => 1, removeIncomingVideo: async () => true, getEmojisFingerprint: async () => '',
  onStreamEnd: () => {}, onConnectionChange: () => {}, onRemoteSourceChange: () => {},
  onOutboundBlock: (fn: Function) => callbacks.set('block', fn),
  onSubchainRequest: (fn: Function) => callbacks.set('subchain', fn),
  onRequestParticipants: (fn: Function) => callbacks.set('participants', fn),
  onUpdateEmojis: (fn: Function) => callbacks.set('emojis', fn),
})) Object.defineProperty(tg.ntg, name, { configurable: true, value });
try {
  assert.equal(typeof tg.createConference, 'function', 'public conference core is missing');
  const first = await tg.createConference({ source: { kind: 'file', path: '/fixture/tone.mp3' } });
  assert.equal(first.callId, 81n);
  const names = trace.map((value) => Array.isArray(value) ? value[0] : value);
  assert.ok(names.indexOf('init') < names.indexOf('capture'));
  assert.ok(names.indexOf('capture') < names.indexOf('create-rpc'));
  assert.ok(names.indexOf('create-rpc') < names.indexOf('connect'));
  assert.equal(await tg.exportConferenceInvite(first), info.inviteLink);
  assert.equal(await tg.getEmojiFingerprint(first), null);
  await callbacks.get('emojis')!(first.nativeId, 'native fixture emojis');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await tg.getEmojiFingerprint(first), 'native fixture emojis');
  await tg.inviteConferenceParticipants(first, [42n], { video: true });
  assert.deepEqual(trace.find((value) => Array.isArray(value) && value[0] === 'invite'), ['invite', 42n, true]);
  const capabilities = tg.getConferenceCapabilities();
  assert.equal(capabilities.fullSecurityConformance, false);
  await assert.rejects(() => tg.removeConferenceParticipants(first, [42n]), /removal\/rekey/);
  await assert.rejects(() => tg.sendConferenceMessage(first, { text: 'must never send plaintext' }), /application encryption/);
  await tg.leaveConference(first);
  await tg.leaveConference(first);
  assert.equal(trace.filter((value) => Array.isArray(value) && value[0] === 'leave').length, 1);
  const second = await tg.joinConference({ slug: 'facade_fixture' });
  assert.notEqual(first.nativeId, second.nativeId);
  await tg.dispose();
  assert.equal(trace.filter((value) => Array.isArray(value) && value[0] === 'leave').length, 2);

  // Capability-aware E2E message encryption/decryption (ntgcalls >= 4.0.0-alpha03)
  let onUpdate: ((u: unknown) => void) | undefined;
  const sentCipher: Buffer[] = [];
  const receivedMessages: any[] = [];
  const adapterV4: any = {
    ...adapter,
    installUpdateHandler: (cb: (u: unknown) => void) => { onUpdate = cb; return () => {}; },
    sendConferenceMessage: async (_call: unknown, encryptedMessage: Buffer) => {
      sentCipher.push(encryptedMessage);
      return true;
    },
  };
  const tgV4 = new TgCallsClient({ client: adapterV4 });
  for (const [name, value] of Object.entries({
    createP2pCall: async () => {},
    initConference: async () => ({ payload: '{"ssrc":-17}', publicKey: Buffer.alloc(32, 3), block: block(0x639a3db6) }),
    applyBlocks: async () => {},
    connect: async () => {}, stop: async () => {},
    setStreamSources: async () => {},
    mute: async () => true, unmute: async () => true, pause: async () => true, resume: async () => true,
    finishSubchainRequest: async () => {}, updateAudioSsrcMappings: async () => {},
    addIncomingVideo: async () => 1, removeIncomingVideo: async () => true, getEmojisFingerprint: async () => '',
    encryptMessage: async (_id: bigint, data: number[]) => {
      assert.ok(Array.isArray(data), 'encryptMessage receives JS Array for N-API bytes boundary');
      return Buffer.from(data.map((b) => b ^ 0x5a));
    },
    decryptMessage: async (_id: bigint, _userId: bigint, data: number[]) => {
      assert.ok(Array.isArray(data), 'decryptMessage receives JS Array for N-API bytes boundary');
      return Buffer.from(data.map((b) => b ^ 0x5a));
    },
    onStreamEnd: () => {}, onConnectionChange: () => {}, onRemoteSourceChange: () => {},
    onOutboundBlock: () => {}, onSubchainRequest: () => {}, onRequestParticipants: () => {}, onUpdateEmojis: () => {},
  })) Object.defineProperty(tgV4.ntg, name, { configurable: true, value });
  try {
    tgV4.on('conferenceMessage', (ev) => { receivedMessages.push(ev); });
    assert.equal(tgV4.getConferenceCapabilities().applicationEncryption, true);
    const handle = await tgV4.createConference();
    const receipt = await tgV4.sendConferenceMessage(handle, 'hello e2e');
    assert.equal(sentCipher.length, 1);
    assert.equal(receipt.bytes, sentCipher[0]!.length);
    onUpdate!({
      _: 'updateGroupCallEncryptedMessage',
      call,
      fromId: { _: 'peerUser', userId: 42n },
      encryptedMessage: sentCipher[0]!,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0].fromUserId, 42n);
    assert.equal(receivedMessages[0].text, 'hello e2e');
    assert.equal(receivedMessages[0].randomId, receipt.randomId);
  } finally {
    await tgV4.dispose();
  }
  console.log('Client conference facade: native initialization/capture order, router emoji, invite, capability refusals, E2E message encryption/decryption and dispose passed (fixtures only).');
} finally { await tg.dispose(); }
