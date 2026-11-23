import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GramjsAdapter, MtcuteAdapter, TgCallsClient } from '../src/index.js';

const require = createRequire(import.meta.url);
const { Api } = require('teleproto');

// 1. GramjsAdapter: joinAs channel + editGroupCallParticipant with real teleproto serialization
{
  const sent: any[] = [];
  const client = {
    getInputEntity: async (ref: unknown) => {
      if (ref === 'mychannel') {
        return new Api.InputPeerChannel({ channelId: 999n, accessHash: 777n });
      }
      return new Api.InputPeerUser({ userId: BigInt(ref as number | bigint), accessHash: 555n });
    },
    invoke: async (req: any) => {
      assert.ok(Buffer.from(req.getBytes()).length > 0, 'TL request serializes cleanly');
      sent.push(req);
      return new Api.Updates({ updates: [], users: [], chats: [], date: 1, seq: 1 });
    },
  };
  const adapter = new GramjsAdapter(client as never, { Api });
  const inputCall = new Api.InputGroupCall({ id: 10n, accessHash: 20n });

  await adapter.joinGroupCall(inputCall, '{"ssrc":1}', { joinAs: '@mychannel', muted: true });
  assert.equal(sent.at(-1).className, 'phone.JoinGroupCall');
  assert.equal(sent.at(-1).joinAs.className, 'InputPeerChannel');
  assert.equal(sent.at(-1).joinAs.channelId, 999n);

  await adapter.editGroupCallParticipant(inputCall, 'self', { raiseHand: true });
  assert.equal(sent.at(-1).className, 'phone.EditGroupCallParticipant');
  assert.equal(sent.at(-1).participant.className, 'InputPeerSelf');
  assert.equal(sent.at(-1).raiseHand, true);

  await adapter.editGroupCallParticipant(inputCall, 42n, { muted: true, volume: 15000 });
  assert.equal(sent.at(-1).participant.className, 'InputPeerUser');
  assert.equal(sent.at(-1).muted, true);
  assert.equal(sent.at(-1).volume, 15000);
}

// 2. MtcuteAdapter: joinAs channel + editGroupCallParticipant
{
  const sent: any[] = [];
  const mt = new MtcuteAdapter({
    resolvePeer: async (ref: unknown) => {
      if (ref === 'mychannel') {
        return { _: 'inputPeerChannel', channelId: 999, accessHash: { low: 1, high: 2 } };
      }
      return { _: 'inputPeerUser', userId: Number(ref), accessHash: { low: 3, high: 4 } };
    },
    call: async (req: any) => { sent.push(req); return {}; },
    onRawUpdate: { add: () => () => {} },
  } as never);
  const inputCall = { _: 'inputGroupCall', id: { low: 10, high: 0 }, accessHash: { low: 20, high: 0 } };

  await mt.joinGroupCall(inputCall, '{"ssrc":1}', { joinAs: '@mychannel' });
  assert.equal(sent.at(-1)._, 'phone.joinGroupCall');
  assert.equal(sent.at(-1).joinAs._, 'inputPeerChannel');

  await mt.editGroupCallParticipant(inputCall, 'self', { raiseHand: false });
  assert.equal(sent.at(-1)._, 'phone.editGroupCallParticipant');
  assert.equal(sent.at(-1).participant._, 'inputPeerSelf');
  assert.equal(sent.at(-1).raiseHand, false);

  await mt.editGroupCallParticipant(inputCall, 42n, { muted: false, volume: 8000 });
  assert.equal(sent.at(-1).participant._, 'inputPeerUser');
  assert.equal(sent.at(-1).volume, 8000);
}

// 3. TgCallsClient facade: getParticipants, setRaiseHand, muteParticipant, setParticipantVolume
{
  const chatId = -1001234567890n;
  const edits: any[] = [];
  const adapter: any = {
    isAdapter: true,
    resolveChatId: async () => chatId,
    getGroupCall: async () => ({ id: 5n, accessHash: 6n }),
    joinGroupCall: async () => ({ params: '{"transport":"fixture"}' }),
    leaveGroupCall: async () => {},
    joinPresentationCall: async () => {},
    leavePresentationCall: async () => {},
    extractConnectionParams: (r: any) => r.params,
    installUpdateHandler: () => () => {},
    dispose: () => {},
    getParticipants: async () => ({
      participants: [{ peer: { kind: 'user', id: 42n }, source: 1001 }],
      version: 1,
      nextOffset: '',
      count: 1,
    }),
    editGroupCallParticipant: async (_call: unknown, participant: unknown, options: unknown) => {
      edits.push({ participant, options });
      return {};
    },
  };
  const tg = new TgCallsClient({ client: adapter });
  for (const [name, fn] of Object.entries({
    createCall: async () => '{"ssrc":55}',
    connect: async () => {},
    stop: async () => {},
    mute: async () => true,
    onStreamEnd: () => {},
    onConnectionChange: () => {},
    onRemoteSourceChange: () => {},
  })) {
    Object.defineProperty(tg.ntg, name, { configurable: true, value: fn });
  }

  try {
    await tg.joinIdle(chatId, { joinAs: '@mychannel' });
    const list = await tg.getParticipants(chatId);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.peer.id, 42n);

    await tg.setRaiseHand(chatId, true);
    assert.deepEqual(edits.at(-1), { participant: 'self', options: { raiseHand: true } });

    await tg.muteParticipant(chatId, 42n, true);
    assert.deepEqual(edits.at(-1), { participant: 42n, options: { muted: true } });

    await tg.setParticipantVolume(chatId, 42n, 150);
    assert.deepEqual(edits.at(-1), { participant: 42n, options: { volume: 15000 } });

    await assert.rejects(() => tg.setParticipantVolume(chatId, 42n, 250), /between 0 and 200/i);
    await tg.leave(chatId);
  } finally {
    await tg.dispose();
  }
}

console.log('Voice chat controls (joinAs, getParticipants, setRaiseHand, muteParticipant, setParticipantVolume) passed.');
