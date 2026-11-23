import type { ChatRef, JoinOptions, MTProtoLike } from '../types.js';
import type { GroupCallInfo, MTProtoAdapter } from './types.js';
import type { CallEligibilityInfo } from '../eligibility.js';
import type { BroadcastChunkRequest, BroadcastChunkResult } from '../broadcast.js';
import type { ConferenceInfo, ConferenceJoin, ConferenceRef, ConferenceResult } from '../conference.js';
import type { ParticipantPage } from '../group-participants.js';
import type { ParticipantInfo } from '../participants.js';
import { loadTl, loadEvents } from '../tl.js';
import {
  asBigInt0,
  extractGroupCallFromUpdates,
  findConnectionParams,
  isUnauthorizedError,
  markedIdFromEntity,
  normalizeParticipantList,
  sleep,
  uint256ToLittleEndianBigInt,
} from './utils.js';

type AnyApi = Record<string, any>;

export class GramjsAdapter implements MTProtoAdapter {
  readonly isAdapter = true as const;
  private readonly client: MTProtoLike;
  private readonly Api: AnyApi;
  private updateCb: ((update: unknown) => void) | null = null;
  private updateBuilder: unknown | null = null;
  private callCb: ((update: unknown) => void) | null = null;
  private callBuilder: unknown | null = null;
  private readonly participantMinCache = new Map<string, ParticipantInfo>();

  constructor(client: MTProtoLike, opts?: { Api?: unknown }) {
    this.client = client;
    this.Api = loadTl(opts?.Api);
  }

  private toInputGroupCall(call: unknown): unknown {
    if (!call || typeof call !== 'object') {
      throw new Error('Invalid group call reference');
    }
    const c = call as Record<string, any>;
    if (c.className === 'InputGroupCall' || c.className === 'InputGroupCallSlug' || c.className === 'InputGroupCallInviteMessage') {
      return c;
    }
    if (c.slug !== undefined && this.Api.InputGroupCallSlug) {
      return new this.Api.InputGroupCallSlug({ slug: String(c.slug) });
    }
    if ((c.inviteMessageId !== undefined || c.msgId !== undefined) && this.Api.InputGroupCallInviteMessage) {
      return new this.Api.InputGroupCallInviteMessage({ msgId: Number(c.inviteMessageId ?? c.msgId) });
    }
    if (c.id !== undefined && c.accessHash !== undefined && this.Api.InputGroupCall) {
      return new this.Api.InputGroupCall({
        id: asBigInt0(c.id),
        accessHash: asBigInt0(c.accessHash),
      });
    }
    return call;
  }

  private async invokeWithSignal(request: unknown, signal?: AbortSignal, dcId?: number, fastNoRetry = false): Promise<unknown> {
    signal?.throwIfAborted();
    const invokeFn = this.client.invoke as (req: unknown, dc?: number, opts?: Record<string, unknown>) => Promise<unknown>;
    if (dcId !== undefined || fastNoRetry) {
      return await invokeFn.call(this.client, request, dcId, {
        ...(dcId !== undefined ? { dcId } : {}),
        ...(signal ? { abortSignal: signal } : {}),
        ...(fastNoRetry ? { floodSleepThreshold: 0, maxRetryCount: 0 } : {}),
      });
    }
    if (signal) {
      return await invokeFn.call(this.client, request, undefined, { abortSignal: signal });
    }
    return await invokeFn.call(this.client, request);
  }

  async resolveChatId(chat: ChatRef): Promise<bigint> {
    if (typeof chat === 'number' || typeof chat === 'bigint') {
      return BigInt(chat);
    }
    const s = chat.trim();
    if (/^-?\d+$/.test(s)) {
      return BigInt(s);
    }
    const handle = s.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '');
    if (this.client.getEntity) {
      try {
        const entity = await this.client.getEntity(handle);
        const marked = markedIdFromEntity(entity);
        if (marked !== undefined) {return marked;}
      } catch { /* fall through */ }
    }
    throw new Error(
      `Cannot resolve chat "${chat}" — pass a numeric chat id (e.g. -1001234567890), ` +
      'or make sure the client has the entity cached.',
    );
  }

  async getGroupCall(chatId: bigint, allowCreate: boolean, rtmpStream = false): Promise<unknown> {
    let peer: unknown = chatId;
    let channelInput: unknown = chatId;
    let isBasicChat = false;

    const clientAny = this.client as any;
    if (clientAny.getInputEntity) {
      try {
        const inputEntity = await clientAny.getInputEntity(chatId);
        if (inputEntity) {
          peer = inputEntity;
          if (inputEntity.className === 'InputPeerChannel' || (inputEntity as any).channelId !== undefined) {
            channelInput = new this.Api.InputChannel({
              channelId: (inputEntity as any).channelId,
              accessHash: (inputEntity as any).accessHash,
            });
          } else if (inputEntity.className === 'InputPeerChat' || (inputEntity as any).chatId !== undefined) {
            isBasicChat = true;
          }
        }
      } catch {
        /* fallback to chatId */
      }
    }

    const fetchCall = async () => {
      if (isBasicChat && this.Api.messages?.GetFullChat) {
        try {
          const rawId = typeof chatId === 'bigint' && chatId < 0n ? -chatId : chatId;
          const full = (await this.client.invoke(
            new this.Api.messages.GetFullChat({ chatId: (peer as any).chatId || rawId }),
          )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
          return full.fullChat?.call;
        } catch { /* ignore */ }
      }
      try {
        const full = (await this.client.invoke(
          new this.Api.channels.GetFullChannel({ channel: channelInput }),
        )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
        return full.fullChat?.call;
      } catch (err) {
        if (this.Api.messages?.GetFullChat) {
          try {
            const rawId = typeof chatId === 'bigint' && chatId < 0n ? -chatId : chatId;
            const full = (await this.client.invoke(
              new this.Api.messages.GetFullChat({ chatId: rawId }),
            )) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
            return full.fullChat?.call;
          } catch { /* ignore */ }
        }
        throw err;
      }
    };

    const call = await fetchCall().catch(() => undefined);
    if (call) {
      return new this.Api.InputGroupCall({
        id: asBigInt0(call.id),
        accessHash: asBigInt0(call.accessHash),
      });
    }

    if (allowCreate) {
      await this.client.invoke(new this.Api.phone.CreateGroupCall({
        peer,
        randomId: Math.floor(Math.random() * 2 ** 31),
        title: 'Voice Chat',
        rtmpStream,
      }));
      await sleep(1000);
      const call2 = await fetchCall().catch(() => undefined);
      if (call2) {
        return new this.Api.InputGroupCall({
          id: asBigInt0(call2.id),
          accessHash: asBigInt0(call2.accessHash),
        });
      }
      throw new Error('Group call created but not visible yet — retry join()');
    }
    throw new Error('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
  }

  async joinGroupCall(inputCall: unknown, joinParams: string, options: JoinOptions): Promise<unknown> {
    return await this.client.invoke(new this.Api.phone.JoinGroupCall({
      call: inputCall,
      params: new this.Api.DataJSON({ data: joinParams }),
      muted: options.muted === true,
      videoStopped: options.videoStopped ?? true,
      joinAs: new this.Api.InputPeerSelf(),
      ...(options.inviteHash !== undefined ? { inviteHash: options.inviteHash } : {}),
    }));
  }

  async leaveGroupCall(inputCall: unknown, ssrc: number): Promise<void> {
    await this.client.invoke(new this.Api.phone.LeaveGroupCall({
      call: inputCall,
      source: ssrc,
    }));
  }

  async joinPresentationCall(inputCall: unknown, presentationParams: string): Promise<unknown> {
    return await this.client.invoke(new this.Api.phone.JoinGroupCallPresentation({
      call: inputCall,
      params: new this.Api.DataJSON({ data: presentationParams }),
    }));
  }

  async leavePresentationCall(inputCall: unknown): Promise<void> {
    await this.client.invoke(new this.Api.phone.LeaveGroupCallPresentation({
      call: inputCall,
    }));
  }

  extractConnectionParams(result: unknown): string | null {
    const res = result as { updates?: Array<Record<string, unknown>> } | undefined;
    return findConnectionParams(res?.updates ?? result);
  }

  installUpdateHandler(
    onUpdate: (update: unknown) => void,
    onConnectionParams: (params: string) => void,
  ): () => void {
    if (this.client.addEventHandler === undefined) {
      return () => {};
    }
    if (this.updateCb !== null) {
      return () => this.removeUpdateHandler();
    }

    const handler = (update: unknown) => {
      const wrapped = update as { update?: unknown } | undefined;
      const payload = wrapped?.update ?? update;
      onUpdate(payload);
      const params = findConnectionParams(payload);
      if (params !== null) {
        onConnectionParams(params);
      }
    };

    const events = loadEvents();
    const rawTypes = [
      this.Api.UpdateGroupCallConnection,
      this.Api.UpdateGroupCall,
      this.Api.UpdateGroupCallParticipants,
      this.Api.UpdateGroupCallChainBlocks,
      this.Api.UpdateGroupCallEncryptedMessage,
    ].filter(Boolean);
    const builder = events?.Raw && rawTypes.length > 0
      ? new events.Raw({ types: rawTypes })
      : {
          resolved: true,
          async resolve() { /* nothing to resolve */ },
          build: (e: unknown) => e,
          filter: (e: unknown) => e,
        };

    this.client.addEventHandler(handler, builder);
    this.updateCb = handler;
    this.updateBuilder = builder;

    return () => this.removeUpdateHandler();
  }

  private removeUpdateHandler(): void {
    if (this.updateCb === null || this.client.removeEventHandler === undefined) {return;}
    this.client.removeEventHandler(this.updateCb, this.updateBuilder ?? {});
    this.updateCb = null;
    this.updateBuilder = null;
  }

  dispose(): void {
    this.removeUpdateHandler();
    this.removeCallHandler();
    this.participantMinCache.clear();
  }

  // --- Group metadata, participants, broadcast stream, and conference (#18/#20/#21) ---

  async getSelfInfo(): Promise<{ userId: bigint; isBot: boolean; authorized: boolean }> {
    if (typeof this.client.getMe !== 'function') {
      return { userId: 0n, isBot: false, authorized: false };
    }
    try {
      const me = (await this.client.getMe()) as Record<string, any> | undefined;
      const userId = me?.id !== undefined ? asBigInt0(me.id) : 0n;
      if (!me || userId <= 0n) {
        return { userId: 0n, isBot: false, authorized: false };
      }
      return {
        userId,
        isBot: Boolean(me.bot ?? me.isBot),
        authorized: true,
      };
    } catch (err) {
      if (isUnauthorizedError(err)) {
        return { userId: 0n, isBot: false, authorized: false };
      }
      throw err;
    }
  }

  async getGroupCallInfo(call: unknown, signal?: AbortSignal): Promise<GroupCallInfo> {
    const inputCall = this.toInputGroupCall(call);
    const res = (await this.invokeWithSignal(
      new this.Api.phone.GetGroupCall({ call: inputCall, limit: 0 }),
      signal,
    )) as Record<string, any>;
    const gc = (res?.call ?? res) as Record<string, any>;
    if (!gc || gc.className === 'GroupCallDiscarded' || gc._ === 'groupCallDiscarded') {
      throw new Error('Group call is discarded or missing');
    }
    const id = asBigInt0(gc.id);
    const accessHash = asBigInt0(gc.accessHash);
    if (id === 0n) {
      throw new Error('phone.getGroupCall returned no call id');
    }
    const canonicalCall = this.Api.InputGroupCall
      ? new this.Api.InputGroupCall({ id, accessHash })
      : { className: 'InputGroupCall', id, accessHash };
    if (Array.isArray(res?.participants) && res.participants.length > 0) {
      this.normalizeParticipants(res.participants);
    }
    return {
      call: canonicalCall,
      id,
      accessHash,
      conference: Boolean(gc.conference),
      rtmpStream: Boolean(gc.rtmpStream),
      ...(gc.streamDcId !== undefined && gc.streamDcId !== null ? { streamDcId: Number(gc.streamDcId) } : {}),
      version: Number(gc.version ?? 0),
      ...(typeof gc.inviteLink === 'string' && gc.inviteLink ? { inviteLink: gc.inviteLink } : {}),
    };
  }

  normalizeParticipants(raw: unknown[]): ParticipantInfo[] {
    return normalizeParticipantList(raw, this.participantMinCache);
  }

  async getParticipants(
    call: unknown,
    options: { ids: bigint[]; sources: number[]; offset: string; limit: number; signal?: AbortSignal },
  ): Promise<ParticipantPage> {
    const clientAny = this.client as any;
    const ids: unknown[] = [];
    for (const id of options.ids) {
      let peer: unknown;
      if (typeof clientAny.getInputEntity === 'function') {
        try {
          peer = await clientAny.getInputEntity(id);
        } catch {
          /* fallback below */
        }
      }
      if (!peer) {
        peer = this.Api.InputPeerUser
          ? new this.Api.InputPeerUser({ userId: id, accessHash: 0n })
          : { className: 'InputPeerUser', userId: id, accessHash: 0n };
      }
      ids.push(peer);
    }
    const sources = options.sources.map((s) => s | 0);
    const res = (await this.invokeWithSignal(
      new this.Api.phone.GetGroupParticipants({
        call: this.toInputGroupCall(call),
        ids,
        sources,
        offset: options.offset,
        limit: options.limit,
      }),
      options.signal,
    )) as Record<string, any>;
    const participants = this.normalizeParticipants(res?.participants ?? []);
    return {
      participants,
      version: Number(res?.version ?? 0),
      nextOffset: String(res?.nextOffset ?? ''),
      count: Number(res?.count ?? participants.length),
    };
  }

  async getStreamRtmpUrl(
    chatId: bigint,
    options: { revoke?: boolean; liveStory?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ url: string; key: string }> {
    let peer: unknown = chatId;
    const clientAny = this.client as any;
    if (typeof clientAny.getInputEntity === 'function') {
      try {
        peer = await clientAny.getInputEntity(chatId);
      } catch {
        peer = chatId;
      }
    }
    const res = (await this.invokeWithSignal(
      new this.Api.phone.GetGroupCallStreamRtmpUrl({
        peer,
        revoke: options.revoke === true,
        ...(options.liveStory ? { liveStory: true } : {}),
      }),
      options.signal,
    )) as { url?: string; key?: string };
    if (typeof res?.url !== 'string' || typeof res?.key !== 'string') {
      throw new Error('phone.getGroupCallStreamRtmpUrl returned an invalid endpoint');
    }
    return { url: res.url, key: res.key };
  }

  async getStreamChannels(
    call: unknown,
    dcId: number,
    signal: AbortSignal,
  ): Promise<Array<{ channel: number; lastTimestampMs: bigint }>> {
    if (!Number.isInteger(dcId) || dcId <= 0) {
      throw new Error('A positive integer media dcId is required');
    }
    const res = (await this.invokeWithSignal(
      new this.Api.phone.GetGroupCallStreamChannels({ call: this.toInputGroupCall(call) }),
      signal,
      dcId,
      true,
    )) as { channels?: Array<Record<string, any>> };
    const list = Array.isArray(res?.channels) ? res.channels : [];
    return list.map((ch) => ({
      channel: Number(ch.channel),
      lastTimestampMs: asBigInt0(ch.lastTimestampMs ?? ch.last_timestamp_ms),
    }));
  }

  async downloadStreamChunk(
    call: unknown,
    request: BroadcastChunkRequest,
    dcId: number,
    signal: AbortSignal,
  ): Promise<BroadcastChunkResult> {
    if (!Number.isInteger(dcId) || dcId <= 0) {
      throw new Error('A positive integer media dcId is required');
    }
    const hasVideoChannel = request.videoChannel !== undefined;
    const hasVideoQuality = request.videoQuality !== undefined;
    if (hasVideoChannel !== hasVideoQuality) {
      throw new Error('Broadcast stream videoChannel and videoQuality must be provided together');
    }
    const location = new this.Api.InputGroupCallStream({
      call: this.toInputGroupCall(call),
      timeMs: asBigInt0(request.timeMs),
      scale: request.scale ?? 0,
      ...(hasVideoChannel ? { videoChannel: request.videoChannel, videoQuality: request.videoQuality } : {}),
    });
    const res = (await this.invokeWithSignal(
      new this.Api.upload.GetFile({
        precise: true,
        cdnSupported: false,
        location,
        offset: asBigInt0(request.offset),
        limit: request.limit,
      }),
      signal,
      dcId,
      true,
    )) as Record<string, any>;
    if (
      res?.className === 'upload.FileCdnRedirect' ||
      res?._ === 'upload.fileCdnRedirect' ||
      res?.fileToken !== undefined
    ) {
      return { redirect: res };
    }
    const bytes = res?.bytes instanceof Uint8Array ? Uint8Array.from(res.bytes) : new Uint8Array();
    return { bytes };
  }

  async getConferenceInfo(ref: ConferenceRef, signal?: AbortSignal): Promise<ConferenceInfo> {
    let inputCall: unknown;
    if ('slug' in ref) {
      inputCall = new this.Api.InputGroupCallSlug({ slug: ref.slug });
    } else if ('inviteMessageId' in ref) {
      inputCall = new this.Api.InputGroupCallInviteMessage({ msgId: ref.inviteMessageId });
    } else {
      inputCall = new this.Api.InputGroupCall({
        id: asBigInt0(ref.id),
        accessHash: asBigInt0(ref.accessHash),
      });
    }
    const info = await this.getGroupCallInfo(inputCall, signal);
    return {
      call: info.call,
      id: info.id,
      accessHash: info.accessHash,
      conference: info.conference,
      ...(info.inviteLink ? { inviteLink: info.inviteLink } : {}),
    };
  }

  private extractConferenceResult(updates: unknown, fallbackCall?: unknown): ConferenceResult {
    const rawCall = extractGroupCallFromUpdates(updates) ?? (fallbackCall as Record<string, any> | undefined);
    const id = asBigInt0(rawCall?.id);
    const accessHash = asBigInt0(rawCall?.accessHash ?? (fallbackCall as any)?.accessHash);
    if (id === 0n) {
      throw new Error('Conference RPC response did not include a valid group call');
    }
    const call = this.Api.InputGroupCall
      ? new this.Api.InputGroupCall({ id, accessHash })
      : { className: 'InputGroupCall', id, accessHash };
    const connectionParams = this.extractConnectionParams(updates) ?? '';
    return {
      info: {
        call,
        id,
        accessHash,
        conference: rawCall?.conference !== undefined ? Boolean(rawCall.conference) : true,
        ...(typeof rawCall?.inviteLink === 'string' && rawCall.inviteLink ? { inviteLink: rawCall.inviteLink } : {}),
      },
      connectionParams,
      updates,
    };
  }

  async createConference(
    join: ConferenceJoin,
    options: { join: true; randomId: number; muted: boolean; videoStopped: boolean; signal?: AbortSignal },
  ): Promise<ConferenceResult> {
    const publicKey = uint256ToLittleEndianBigInt(join.publicKey);
    const updates = await this.invokeWithSignal(
      new this.Api.phone.CreateConferenceCall({
        join: options.join,
        randomId: options.randomId,
        muted: options.muted,
        videoStopped: options.videoStopped,
        publicKey,
        block: Buffer.from(join.block),
        params: new this.Api.DataJSON({ data: join.payload }),
      }),
      options.signal,
    );
    return this.extractConferenceResult(updates);
  }

  async joinConference(
    call: unknown,
    join: ConferenceJoin,
    options: { muted: boolean; videoStopped: boolean; signal?: AbortSignal },
  ): Promise<ConferenceResult> {
    const inputCall = this.toInputGroupCall(call);
    const publicKey = uint256ToLittleEndianBigInt(join.publicKey);
    const updates = await this.invokeWithSignal(
      new this.Api.phone.JoinGroupCall({
        call: inputCall,
        joinAs: new this.Api.InputPeerSelf(),
        muted: options.muted,
        videoStopped: options.videoStopped,
        publicKey,
        block: Buffer.from(join.block),
        params: new this.Api.DataJSON({ data: join.payload }),
      }),
      options.signal,
    );
    return this.extractConferenceResult(updates, inputCall);
  }

  async getChainBlocks(
    call: unknown,
    subchain: number,
    offset: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.invokeWithSignal(
      new this.Api.phone.GetGroupCallChainBlocks({
        call: this.toInputGroupCall(call),
        subChainId: subchain,
        offset,
        limit,
      }),
      signal,
    );
  }

  async sendConferenceBroadcast(call: unknown, block: Buffer, signal?: AbortSignal): Promise<unknown> {
    return await this.invokeWithSignal(
      new this.Api.phone.SendConferenceCallBroadcast({
        call: this.toInputGroupCall(call),
        block: Buffer.from(block),
      }),
      signal,
    );
  }

  private async toInputUser(user: unknown): Promise<unknown> {
    if (user && typeof user === 'object') {
      const u = user as Record<string, any>;
      if (u.className === 'InputUser') {return u;}
      if (u.className === 'InputPeerUser' || u.userId !== undefined) {
        return this.Api.InputUser
          ? new this.Api.InputUser({ userId: asBigInt0(u.userId), accessHash: asBigInt0(u.accessHash) })
          : { className: 'InputUser', userId: asBigInt0(u.userId), accessHash: asBigInt0(u.accessHash) };
      }
    }
    const userId = await this.resolveUserId(user as ChatRef);
    const clientAny = this.client as any;
    if (typeof clientAny.getInputEntity === 'function') {
      const entity = (await clientAny.getInputEntity(userId)) as Record<string, any> | undefined;
      if (entity) {
        if (entity.className === 'InputUser') {return entity;}
        if (entity.userId !== undefined || entity.id !== undefined) {
          return this.Api.InputUser
            ? new this.Api.InputUser({
                userId: asBigInt0(entity.userId ?? entity.id),
                accessHash: asBigInt0(entity.accessHash),
              })
            : entity;
        }
      }
    }
    return this.Api.InputUser
      ? new this.Api.InputUser({ userId, accessHash: 0n })
      : { className: 'InputUser', userId, accessHash: 0n };
  }

  async inviteConferenceParticipant(
    call: unknown,
    user: unknown,
    options: { video: boolean; signal?: AbortSignal },
  ): Promise<unknown> {
    const userId = await this.toInputUser(user);
    return await this.invokeWithSignal(
      new this.Api.phone.InviteConferenceCallParticipant({
        call: this.toInputGroupCall(call),
        userId,
        ...(options.video ? { video: true } : {}),
      }),
      options.signal,
    );
  }

  async leaveConference(call: unknown, source: number): Promise<void> {
    await this.leaveGroupCall(this.toInputGroupCall(call), source | 0);
  }

  // --- P2P (1-on-1) calls ---

  async resolveUserId(user: ChatRef): Promise<bigint> {
    if (typeof user === 'number' || typeof user === 'bigint') {
      const n = BigInt(user);
      return n < 0n ? -n : n;
    }
    const s = user.trim();
    if (/^\d+$/.test(s)) {return BigInt(s);}
    const handle = s.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '');
    if (this.client.getEntity) {
      const entity = await this.client.getEntity(handle) as { id?: unknown };
      if (entity?.id !== undefined) {return BigInt(entity.id as never);}
    }
    throw new Error(`Cannot resolve user "${user}" — pass a numeric user id or a cached username.`);
  }

  async getCallEligibility(userId: bigint): Promise<CallEligibilityInfo> {
    const me = await this.client.getMe?.() as Record<string, any> | undefined;
    const peer = await (this.client as any).getInputEntity(userId);
    const result = await this.client.invoke(new this.Api.users.GetFullUser({ id: peer })) as {
      fullUser: Record<string, any>; users: Array<Record<string, any>>;
    };
    const full = result.fullUser;
    const user = result.users.find((u) => asBigInt0(u.id) === userId);
    if (!full || !user) {throw new Error('users.getFullUser returned no matching user');}
    return {
      userId, selfId: me?.id === undefined ? undefined : asBigInt0(me.id),
      selfBot: Boolean(me?.bot ?? me?.isBot), bot: Boolean(user.bot),
      deleted: Boolean(user.deleted), blocked: Boolean(full.blocked),
      phoneCallsAvailable: Boolean(full.phoneCallsAvailable),
      phoneCallsPrivate: Boolean(full.phoneCallsPrivate),
      videoCallsAvailable: Boolean(full.videoCallsAvailable),
    };
  }

  async getDhConfig(): Promise<{ g: number; p: Buffer; random: Buffer }> {
    const res = await this.client.invoke(
      new this.Api.messages.GetDhConfig({ version: 0, randomLength: 256 }),
    ) as { g: number; p: Buffer; random: Buffer };
    return { g: res.g, p: Buffer.from(res.p), random: Buffer.from(res.random) };
  }

  private inputPhoneCall(callId: bigint, accessHash: bigint): unknown {
    return new this.Api.InputPhoneCall({ id: callId, accessHash });
  }

  private phoneProtocol(protocol: unknown): unknown {
    const p = protocol as { minLayer: number; maxLayer: number; udpP2p: boolean; udpReflector: boolean; libraryVersions: string[] };
    return new this.Api.PhoneCallProtocol({
      minLayer: p.minLayer, maxLayer: p.maxLayer, udpP2p: p.udpP2p,
      udpReflector: p.udpReflector, libraryVersions: p.libraryVersions,
    });
  }

  async acceptCall(callId: bigint, accessHash: bigint, gB: Buffer, protocol: unknown): Promise<unknown> {
    return await this.client.invoke(new this.Api.phone.AcceptCall({
      peer: this.inputPhoneCall(callId, accessHash), gB, protocol: this.phoneProtocol(protocol),
    }));
  }

  async requestCall(userId: bigint, gAHash: Buffer, protocol: unknown, video: boolean): Promise<unknown> {
    const peer = await (this.client as any).getInputEntity(userId);
    return await this.client.invoke(new this.Api.phone.RequestCall({
      userId: peer, randomId: Math.floor(Math.random() * 2 ** 31),
      gAHash, protocol: this.phoneProtocol(protocol), video,
    }));
  }

  async confirmCall(callId: bigint, accessHash: bigint, gA: Buffer, keyFingerprint: bigint, protocol: unknown): Promise<unknown> {
    return await this.client.invoke(new this.Api.phone.ConfirmCall({
      peer: this.inputPhoneCall(callId, accessHash), gA, keyFingerprint, protocol: this.phoneProtocol(protocol),
    }));
  }

  async discardCall(callId: bigint, accessHash: bigint, duration: number, reason: unknown, connectionId: bigint): Promise<void> {
    await this.client.invoke(new this.Api.phone.DiscardCall({
      peer: this.inputPhoneCall(callId, accessHash), duration,
      reason: reason ?? new this.Api.PhoneCallDiscardReasonMissed(), connectionId,
    }));
  }

  async sendSignalingData(callId: bigint, accessHash: bigint, data: Buffer): Promise<void> {
    await this.client.invoke(new this.Api.phone.SendSignalingData({
      peer: this.inputPhoneCall(callId, accessHash), data,
    }));
  }

  installCallHandler(
    onPhoneCall: (phoneCall: unknown) => void,
    onSignaling: (phoneCallId: bigint, data: Buffer) => void,
  ): () => void {
    if (this.client.addEventHandler === undefined) {return () => {};}
    if (this.callCb !== null) {return () => this.removeCallHandler();}
    const handler = (update: unknown) => {
      const wrapped = update as { update?: unknown } | undefined;
      const payload = (wrapped?.update ?? update) as Record<string, any>;
      if (payload?.phoneCall) {
        onPhoneCall(payload.phoneCall);
      } else if (payload?.phoneCallId !== undefined && payload?.data !== undefined) {
        onSignaling(asBigInt0(payload.phoneCallId), Buffer.from(payload.data));
      }
    };
    const events = loadEvents();
    const builder = events?.Raw
      ? new events.Raw({ types: [this.Api.UpdatePhoneCall, this.Api.UpdatePhoneCallSignalingData] })
      : { resolved: true, async resolve() { /* nothing */ }, build: (e: unknown) => e, filter: (e: unknown) => e };
    this.client.addEventHandler(handler, builder);
    this.callCb = handler;
    this.callBuilder = builder;
    return () => this.removeCallHandler();
  }

  private removeCallHandler(): void {
    if (this.callCb === null || this.client.removeEventHandler === undefined) {return;}
    this.client.removeEventHandler(this.callCb, this.callBuilder ?? {});
    this.callCb = null;
    this.callBuilder = null;
  }
}
