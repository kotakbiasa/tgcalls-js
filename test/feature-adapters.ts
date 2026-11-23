import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GramjsAdapter, MtcuteAdapter } from '../src/index.js';

const require = createRequire(import.meta.url);
const { Api } = require('teleproto');

// ---------------------------------------------------------------------------
// 1. GramjsAdapter with real teleproto TL constructors & binary serialization
// ---------------------------------------------------------------------------
{
  const invocations: Array<{ req: any; bytes: Buffer; dcId?: number; opts?: any }> = [];
  let addedBuilder: any;

  const client = {
    getMe: async () => ({ id: { toString: () => '9001' }, bot: false }),
    getInputEntity: async (id: bigint) => {
      if (id < 0n) {
        return new Api.InputPeerChannel({ channelId: -id - 1000000000000n, accessHash: 777n });
      }
      return new Api.InputPeerUser({ userId: id, accessHash: 555n });
    },
    addEventHandler: (_cb: unknown, builder: unknown) => {
      addedBuilder = builder;
    },
    removeEventHandler: () => {},
    invoke: async (req: any, dcId?: number, opts?: any) => {
      const bytes = typeof req.getBytes === 'function' ? Buffer.from(req.getBytes()) : Buffer.alloc(0);
      invocations.push({ req, bytes, dcId, opts });
      const name = req.className;
      if (name === 'phone.GetGroupCall') {
        return new Api.phone.GroupCall({
          call: new Api.GroupCall({
            id: 4200n,
            accessHash: 8400n,
            participantsCount: 2,
            version: 7,
            rtmpStream: true,
            conference: true,
            streamDcId: 4,
            inviteLink: 'https://t.me/call/slug123',
          }),
          participants: [
            new Api.GroupCallParticipant({
              peer: new Api.PeerUser({ userId: 9001n }),
              date: 1,
              source: -5,
              self: true,
              muted: false,
            }),
          ],
          participantsNextOffset: '',
          chats: [],
          users: [],
        });
      }
      if (name === 'phone.GetGroupParticipants') {
        return new Api.phone.GroupParticipants({
          count: 2,
          participants: [
            new Api.GroupCallParticipant({
              peer: new Api.PeerUser({ userId: 9001n }),
              date: 1,
              source: -5,
              min: true,
              muted: true,
            }),
            new Api.GroupCallParticipant({
              peer: new Api.PeerChannel({ channelId: 321n }),
              date: 1,
              source: 1024,
              video: new Api.GroupCallParticipantVideo({
                paused: false,
                endpoint: 'ep-cam',
                sourceGroups: [
                  new Api.GroupCallParticipantVideoSourceGroup({
                    semantics: 'SIM',
                    sources: [-10, 20],
                  }),
                ],
                audioSource: -5,
              }),
            }),
          ],
          nextOffset: 'next-2',
          chats: [],
          users: [],
          version: 8,
        });
      }
      if (name === 'phone.GetGroupCallStreamRtmpUrl') {
        return new Api.phone.GroupCallStreamRtmpUrl({
          url: 'rtmps://dc4.rtmp.telegram.org/s/',
          key: 'secret-key',
        });
      }
      if (name === 'phone.GetGroupCallStreamChannels') {
        return new Api.phone.GroupCallStreamChannels({
          channels: [
            new Api.GroupCallStreamChannel({ channel: 1, scale: 0, lastTimestampMs: 987654321n }),
          ],
        });
      }
      if (name === 'upload.GetFile') {
        if (Number(req.offset) === 1048576) {
          return new Api.upload.FileCdnRedirect({
            dcId: 203,
            fileToken: Buffer.from([9, 9]),
            encryptionKey: Buffer.alloc(32, 1),
            encryptionIv: Buffer.alloc(16, 2),
            fileHashes: [],
          });
        }
        return new Api.upload.File({
          type: new Api.storage.FileUnknown(),
          mtime: 0,
          bytes: Buffer.from([0xaa, 0xbb, 0xcc]),
        });
      }
      if (name === 'phone.CreateConferenceCall' || name === 'phone.JoinGroupCall') {
        return new Api.Updates({
          updates: [
            new Api.UpdateGroupCall({
              call: new Api.GroupCall({
                id: 4200n,
                accessHash: 8400n,
                participantsCount: 1,
                version: 1,
                conference: true,
                inviteLink: 'https://t.me/call/conf4200',
              }),
            }),
            new Api.UpdateGroupCallConnection({
              params: new Api.DataJSON({ data: '{"transport":"conf"}' }),
            }),
          ],
          users: [],
          chats: [],
          date: 1,
          seq: 1,
        });
      }
      if (
        name === 'phone.GetGroupCallChainBlocks' ||
        name === 'phone.SendConferenceCallBroadcast' ||
        name === 'phone.SendGroupCallEncryptedMessage' ||
        name === 'phone.InviteConferenceCallParticipant' ||
        name === 'phone.LeaveGroupCall'
      ) {
        return new Api.Updates({ updates: [], users: [], chats: [], date: 1, seq: 1 });
      }
      throw new Error(`Unexpected GramJS request: ${name}`);
    },
  };

  const adapter = new GramjsAdapter(client as never, { Api });

  // Passive group update filter expansion
  const unsub = adapter.installUpdateHandler(() => {}, () => {});
  assert.ok(addedBuilder, 'installUpdateHandler registers an event builder');
  unsub();

  // getSelfInfo
  const self = await adapter.getSelfInfo();
  assert.deepEqual(self, { userId: 9001n, isBot: false, authorized: true });

  // getGroupCallInfo +getConferenceInfo (slug & inviteMessageId)
  const info = await adapter.getGroupCallInfo({ id: 4200n, accessHash: 8400n });
  assert.equal(info.id, 4200n);
  assert.equal(info.accessHash, 8400n);
  assert.equal(info.conference, true);
  assert.equal(info.rtmpStream, true);
  assert.equal(info.streamDcId, 4);
  assert.equal(info.version, 7);
  assert.equal(info.inviteLink, 'https://t.me/call/slug123');

  const slugInfo = await adapter.getConferenceInfo({ slug: 'slug123' });
  assert.equal(invocations.at(-1)!.req.call.className, 'InputGroupCallSlug');
  assert.equal(slugInfo.inviteLink, 'https://t.me/call/slug123');

  await adapter.getConferenceInfo({ inviteMessageId: 45 });
  assert.equal(invocations.at(-1)!.req.call.className, 'InputGroupCallInviteMessage');
  assert.equal(invocations.at(-1)!.req.call.msgId, 45);

  // getParticipants + min-field merge cache (self=true preserved from getGroupCallInfo snapshot)
  const page = await adapter.getParticipants(info.call, {
    ids: [9001n],
    sources: [0xffffffff],
    offset: '',
    limit: 50,
  });
  assert.equal(invocations.at(-1)!.req.sources[0], -1, 'uint32 SSRC serialized as signed int32');
  assert.equal(page.version, 8);
  assert.equal(page.nextOffset, 'next-2');
  assert.equal(page.participants[0]!.self, true, 'min participant preserves cached self=true');
  assert.equal(page.participants[0]!.muted, true);
  assert.equal(page.participants[0]!.source, 0xfffffffb, 'signed -5 normalized to unsigned 32-bit SSRC');
  assert.deepEqual(page.participants[1]!.peer, { kind: 'channel', id: 321n });
  assert.equal(page.participants[1]!.video?.sourceGroups[0]!.sources[0], 0xfffffff6);
  assert.equal(page.participants[1]!.video?.audioSource, 0xfffffffb);

  // getStreamRtmpUrl (revoke defaults to false)
  const rtmp = await adapter.getStreamRtmpUrl(-1001234567890n);
  assert.equal(rtmp.url, 'rtmps://dc4.rtmp.telegram.org/s/');
  assert.equal(rtmp.key, 'secret-key');
  assert.equal(invocations.at(-1)!.req.revoke, false);

  // BroadcastAdapterPort: exact DC routing + no-auto-retry + abortSignal
  const abort = new AbortController();
  const channels = await adapter.getStreamChannels(info.call, 4, abort.signal);
  assert.deepEqual(channels, [{ channel: 1, lastTimestampMs: 987654321n }]);
  assert.equal(invocations.at(-1)!.dcId, 4);
  assert.equal(invocations.at(-1)!.opts?.floodSleepThreshold, 0);
  assert.equal(invocations.at(-1)!.opts?.maxRetryCount, 0);
  assert.equal(invocations.at(-1)!.opts?.abortSignal, abort.signal);

  const chunkAudio = await adapter.downloadStreamChunk(
    info.call,
    { timeMs: 12000n, scale: 0, offset: 0n, limit: 1048576 },
    4,
    abort.signal,
  );
  assert.ok(chunkAudio.bytes !== undefined && Buffer.from(chunkAudio.bytes).equals(Buffer.from([0xaa, 0xbb, 0xcc])));
  assert.equal(invocations.at(-1)!.req.location.videoChannel, undefined);

  const chunkVideo = await adapter.downloadStreamChunk(
    info.call,
    { timeMs: 12000n, scale: 0, offset: 0n, limit: 1048576, videoChannel: 1, videoQuality: 2 },
    4,
    abort.signal,
  );
  assert.ok('bytes' in chunkVideo);
  assert.equal(invocations.at(-1)!.req.location.videoChannel, 1);
  assert.equal(invocations.at(-1)!.req.location.videoQuality, 2);

  const chunkRedirect = await adapter.downloadStreamChunk(
    info.call,
    { timeMs: 12000n, scale: 0, offset: 1048576n, limit: 1048576 },
    4,
    abort.signal,
  );
  assert.ok('redirect' in chunkRedirect);

  // Conference create/join int256 publicKey exact binary round-trip
  const pk = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {pk[i] = (0x80 + i) & 0xff;}
  const block = Buffer.from([0xb6, 0x3d, 0x9a, 0x63, 1, 2, 3, 4]);
  const created = await adapter.createConference(
    { payload: '{"ssrc":123}', publicKey: pk, block },
    { join: true, randomId: 77, muted: true, videoStopped: true },
  );
  assert.equal(created.info.id, 4200n);
  assert.equal(created.connectionParams, '{"transport":"conf"}');
  assert.ok(invocations.at(-1)!.bytes.includes(pk), 'CreateConferenceCall binary payload contains exact 32-byte int256 publicKey');

  const joined = await adapter.joinConference(
    created.info.call,
    { payload: '{"ssrc":123}', publicKey: pk, block },
    { muted: false, videoStopped: true },
  );
  assert.equal(joined.info.id, 4200n);
  assert.ok(invocations.at(-1)!.bytes.includes(pk), 'JoinGroupCall binary payload contains exact 32-byte int256 publicKey');

  await adapter.getChainBlocks(created.info.call, 0, -1, 1);
  assert.equal(invocations.at(-1)!.req.className, 'phone.GetGroupCallChainBlocks');

  await adapter.sendConferenceBroadcast(created.info.call, Buffer.from([0xe7, 0x2a, 0x51, 0xd1]));
  assert.equal(invocations.at(-1)!.req.className, 'phone.SendConferenceCallBroadcast');

  await adapter.sendConferenceMessage(created.info.call, Buffer.from([1, 2, 3, 4]));
  assert.equal(invocations.at(-1)!.req.className, 'phone.SendGroupCallEncryptedMessage');
  assert.ok(invocations.at(-1)!.bytes.includes(Buffer.from([1, 2, 3, 4])));

  await adapter.inviteConferenceParticipant(created.info.call, 444n, { video: true });
  assert.equal(invocations.at(-1)!.req.className, 'phone.InviteConferenceCallParticipant');
  assert.equal(invocations.at(-1)!.req.userId.className, 'InputUser');
  assert.equal(invocations.at(-1)!.req.video, true);

  await adapter.leaveConference(created.info.call, -17);
  assert.equal(invocations.at(-1)!.req.className, 'phone.LeaveGroupCall');
  assert.equal(invocations.at(-1)!.req.source, -17);
}

// ---------------------------------------------------------------------------
// 2. MtcuteAdapter preserving Long references, Uint8Array int256, and DC params
// ---------------------------------------------------------------------------
{
  const calls: Array<{ req: any; params?: any }> = [];
  const idLong = { low: 101, high: 202, unsigned: false, toString: () => '867583393893' };
  const ahLong = { low: 303, high: 404, unsigned: false, toString: () => '1735166787887' };

  const mtClient = {
    getMe: async () => ({ id: 7001, isBot: false }),
    resolvePeer: async (ref: unknown) => ({
      _: 'inputPeerUser',
      userId: Number(ref),
      accessHash: { low: 11, high: 22, unsigned: false },
    }),
    onRawUpdate: { add: () => () => {} },
    call: async (req: any, params?: any) => {
      calls.push({ req, params });
      if (req._ === 'phone.getGroupCall') {
        return {
          call: {
            _: 'groupCall',
            id: idLong,
            accessHash: ahLong,
            conference: true,
            rtmpStream: false,
            streamDcId: 5,
            version: 3,
            inviteLink: 'https://t.me/call/mtcute_conf',
          },
          participants: [
            {
              _: 'groupCallParticipant',
              peer: { _: 'peerUser', userId: 7001 },
              source: 55,
              self: true,
              muted: false,
            },
          ],
        };
      }
      if (req._ === 'phone.getGroupParticipants') {
        return {
          count: 1,
          version: 4,
          nextOffset: '',
          participants: [
            {
              _: 'groupCallParticipant',
              peer: { _: 'peerUser', userId: 7001 },
              source: 55,
              min: true,
              muted: true,
            },
          ],
        };
      }
      if (req._ === 'phone.getGroupCallStreamRtmpUrl') {
        return { url: 'rtmps://dc5.rtmp.telegram.org/s/', key: 'mt-key' };
      }
      if (req._ === 'phone.getGroupCallStreamChannels') {
        return { channels: [{ channel: 1, scale: 0, lastTimestampMs: { toString: () => '555000' } }] };
      }
      if (req._ === 'upload.getFile') {
        return { _: 'upload.file', bytes: new Uint8Array([7, 8, 9]) };
      }
      if (req._ === 'phone.createConferenceCall' || req._ === 'phone.joinGroupCall') {
        return {
          _: 'updates',
          updates: [
            {
              _: 'updateGroupCall',
              call: {
                _: 'groupCall',
                id: idLong,
                accessHash: ahLong,
                conference: true,
                inviteLink: 'https://t.me/call/mtcute_conf',
              },
            },
            {
              _: 'updateGroupCallConnection',
              params: { _: 'dataJSON', data: '{"transport":"mtcute"}' },
            },
          ],
        };
      }
      return { _: 'updates', updates: [] };
    },
  };

  const mt = new MtcuteAdapter(mtClient as never);
  assert.deepEqual(await mt.getSelfInfo(), { userId: 7001n, isBot: false, authorized: true });

  const info = await mt.getGroupCallInfo({ slug: 'mtcute_conf' });
  assert.equal(calls.at(-1)!.req.call._, 'inputGroupCallSlug');
  assert.equal((info.call as any).id, idLong, 'mtcute Long reference for id is preserved by identity');
  assert.equal((info.call as any).accessHash, ahLong, 'mtcute Long reference for accessHash is preserved by identity');
  assert.equal(info.id, 867583393893n);
  assert.equal(info.accessHash, 1735166787887n);

  const page = await mt.getParticipants(info.call, {
    ids: [7001n],
    sources: [-9],
    offset: '',
    limit: 10,
  });
  assert.equal(calls.at(-1)!.req.call.id, idLong, 'getParticipants forwards preserved mtcute Long ref');
  assert.equal(page.participants[0]!.self, true, 'mtcute min-field merge cache retains self=true');
  assert.equal(page.participants[0]!.muted, true);

  const rtmp = await mt.getStreamRtmpUrl(-100555n);
  assert.equal(rtmp.key, 'mt-key');
  assert.equal(calls.at(-1)!.req.revoke, false);

  const signal = new AbortController().signal;
  const ch = await mt.getStreamChannels(info.call, 5, signal);
  assert.deepEqual(ch, [{ channel: 1, lastTimestampMs: 555000n }]);
  assert.deepEqual(calls.at(-1)!.params, {
    dcId: 5,
    abortSignal: signal,
    floodSleepThreshold: 0,
    maxRetryCount: 0,
  });

  const dl = await mt.downloadStreamChunk(
    info.call,
    { timeMs: 1000n, scale: 0, offset: 0n, limit: 1048576, videoChannel: 2, videoQuality: 1 },
    5,
    signal,
  );
  assert.ok(dl.bytes !== undefined && dl.bytes.length === 3);
  assert.equal(calls.at(-1)!.req.location.call.id, idLong);
  assert.equal(calls.at(-1)!.req.location.videoChannel, 2);
  assert.equal(calls.at(-1)!.req.location.videoQuality, 1);

  const pk = new Uint8Array(32).fill(0x42);
  const created = await mt.createConference(
    { payload: '{"ssrc":77}', publicKey: pk, block: new Uint8Array([1, 2, 3, 4]) },
    { join: true, randomId: 12, muted: true, videoStopped: true },
  );
  assert.equal(calls.at(-1)!.req.publicKey.constructor, Uint8Array);
  assert.equal(calls.at(-1)!.req.publicKey.length, 32);
  assert.equal((created.info.call as any).id, idLong);

  const joined = await mt.joinConference(
    created.info.call,
    { payload: '{"ssrc":77}', publicKey: pk, block: new Uint8Array([1, 2, 3, 4]) },
    { muted: true, videoStopped: true },
  );
  assert.equal((joined.info.call as any).accessHash, ahLong);

  await mt.inviteConferenceParticipant(created.info.call, 88n, { video: false });
  assert.equal(calls.at(-1)!.req.userId._, 'inputUser');
  assert.equal(calls.at(-1)!.req.userId.userId, 88);

  await mt.sendConferenceMessage(created.info.call, Buffer.from([9, 8, 7]));
  assert.equal(calls.at(-1)!.req._, 'phone.sendGroupCallEncryptedMessage');
  assert.equal(calls.at(-1)!.req.call.id, idLong);

  await mt.leaveConference(created.info.call, 77);
  assert.equal(calls.at(-1)!.req._, 'phone.leaveGroupCall');
}

console.log('Feature adapters (GramJS/teleproto binary serialization + mtcute Long/DC/conference contracts) passed.');
