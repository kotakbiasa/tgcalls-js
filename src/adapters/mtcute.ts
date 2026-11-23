import type { ChatRef, EditParticipantOptions, JoinOptions } from '../types.js';
import type { GroupCallInfo, MtcuteLike, MTProtoAdapter } from './types.js';
import type { CallEligibilityInfo } from '../eligibility.js';
import type { BroadcastChunkRequest, BroadcastChunkResult } from '../broadcast.js';
import type { ConferenceInfo, ConferenceJoin, ConferenceRef, ConferenceResult } from '../conference.js';
import type { ParticipantPage } from '../group-participants.js';
import type { ParticipantInfo } from '../participants.js';
import {
  asBigInt0,
  extractGroupCallFromUpdates,
  findConnectionParams,
  isUnauthorizedError,
  normalizeParticipantList,
  sleep,
} from './utils.js';

export class MtcuteAdapter implements MTProtoAdapter {
  readonly isAdapter = true as const;
  private readonly client: MtcuteLike;
  private updateCb: ((update: unknown) => void) | null = null;
  private updateUnsubscribe: (() => void) | null = null;
  private readonly participantMinCache = new Map<string, ParticipantInfo>();

  constructor(client: MtcuteLike) {
    this.client = client;
  }

  private toInputGroupCall(call: unknown): Record<string, unknown> {
    if (!call || typeof call !== 'object') {
      throw new Error('Invalid group call reference');
    }
    const c = call as Record<string, any>;
    if (c._ === 'inputGroupCall' || c._ === 'inputGroupCallSlug' || c._ === 'inputGroupCallInviteMessage') {
      return c;
    }
    if (c.slug !== undefined) {
      return { _: 'inputGroupCallSlug', slug: String(c.slug) };
    }
    if (c.inviteMessageId !== undefined || c.msgId !== undefined) {
      return { _: 'inputGroupCallInviteMessage', msgId: Number(c.inviteMessageId ?? c.msgId) };
    }
    if (c.id !== undefined && c.accessHash !== undefined) {
      return {
        _: 'inputGroupCall',
        id: MtcuteAdapter.longOf(c.id),
        accessHash: MtcuteAdapter.longOf(c.accessHash),
      };
    }
    return c;
  }

  private async callWithSignal(
    request: unknown,
    signal?: AbortSignal,
    dcId?: number,
    fastNoRetry = false,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    if (dcId !== undefined || fastNoRetry || signal !== undefined) {
      return await this.client.call(request, {
        ...(dcId !== undefined ? { dcId } : {}),
        ...(signal ? { abortSignal: signal } : {}),
        ...(fastNoRetry ? { floodSleepThreshold: 0, maxRetryCount: 0 } : {}),
      });
    }
    return await this.client.call(request);
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

    // 1. Try getChat()
    if (typeof this.client.getChat === 'function') {
      try {
        const c = await this.client.getChat(handle);
        if (c && c.id !== undefined) {
          return BigInt(c.id);
        }
      } catch {
        /* fall through to resolvePeer */
      }
    }

    // 2. Try resolvePeer()
    if (typeof this.client.resolvePeer === 'function') {
      try {
        const peer = (await this.client.resolvePeer(handle)) as Record<string, unknown> | undefined;
        if (peer) {
          if (peer._ === 'inputPeerChannel' && peer.channelId !== undefined) {
            const rawId = BigInt(peer.channelId as number | bigint);
            return rawId > 0n ? -(1000000000000n + rawId) : rawId;
          }
          if (peer._ === 'inputPeerChat' && peer.chatId !== undefined) {
            const rawId = BigInt(peer.chatId as number | bigint);
            return rawId > 0n ? -rawId : rawId;
          }
          if (peer._ === 'inputPeerUser' && peer.userId !== undefined) {
            return BigInt(peer.userId as number | bigint);
          }
        }
      } catch {
        /* fall through */
      }
    }

    throw new Error(
      `Cannot resolve chat "${chat}" with mtcute — pass a numeric chat id (e.g. -1001234567890), ` +
      'or make sure the client has the peer cached.',
    );
  }

  async getGroupCall(chatId: bigint, allowCreate: boolean, rtmpStream = false): Promise<unknown> {
    let peer: any;
    let channelInput: any;
    let isBasicChat = false;

    if (typeof this.client.resolvePeer === 'function') {
      try {
        peer = await this.client.resolvePeer(chatId);
      } catch {
        try {
          peer = await this.client.resolvePeer(chatId.toString());
        } catch {
          try {
            peer = await this.client.resolvePeer(Number(chatId));
          } catch {
            /* peer could not be resolved directly */
          }
        }
      }
    }

    if (peer && typeof peer === 'object') {
      if (peer._ === 'inputPeerChannel' || peer.channelId !== undefined) {
        channelInput = {
          _: 'inputChannel',
          channelId: peer.channelId,
          accessHash: peer.accessHash,
        };
      } else if (peer._ === 'inputPeerChat' || peer.chatId !== undefined) {
        isBasicChat = true;
      }
    } else if (typeof this.client.resolveChannel === 'function') {
      try {
        channelInput = await this.client.resolveChannel(chatId);
      } catch {
        try {
          channelInput = await this.client.resolveChannel(Number(chatId));
        } catch {
          /* ignore */
        }
      }
    }

    const fetchCall = async () => {
      if (isBasicChat) {
        try {
          const rawId = typeof chatId === 'bigint' && chatId < 0n ? Number(-chatId) : Number(chatId);
          const full = (await this.client.call({
            _: 'messages.getFullChat',
            chatId: peer?.chatId ?? rawId,
          })) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
          return full?.fullChat?.call;
        } catch {
          /* ignore */
        }
      }

      try {
        const channel = channelInput ?? (typeof this.client.resolveChannel === 'function'
          ? await this.client.resolveChannel(chatId).catch(() => peer ?? chatId)
          : peer ?? chatId);
        const full = (await this.client.call({
          _: 'channels.getFullChannel',
          channel,
        })) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
        return full?.fullChat?.call;
      } catch (err) {
        try {
          const rawId = typeof chatId === 'bigint' && chatId < 0n ? Number(-chatId) : Number(chatId);
          const full = (await this.client.call({
            _: 'messages.getFullChat',
            chatId: rawId,
          })) as { fullChat?: { call?: { id: unknown; accessHash: unknown } } | undefined };
          return full?.fullChat?.call;
        } catch {
          /* ignore */
        }
        throw err;
      }
    };

    const call = await fetchCall().catch(() => undefined);
    if (call) {
      return {
        _: 'inputGroupCall',
        // Keep mtcute's TL Long instances intact. Its TL encoder expects the
        // low/high representation and does not serialize JavaScript bigint here.
        id: call.id,
        accessHash: call.accessHash,
      };
    }

    if (allowCreate) {
      const createPeer = peer ?? (typeof this.client.resolvePeer === 'function'
        ? await this.client.resolvePeer(chatId).catch(() => chatId)
        : chatId);
      await this.client.call({
        _: 'phone.createGroupCall',
        peer: createPeer,
        randomId: Math.floor(Math.random() * 2 ** 31),
        title: 'Voice Chat',
        rtmpStream,
      });
      await sleep(1000);
      const call2 = await fetchCall().catch(() => undefined);
      if (call2) {
        return {
          _: 'inputGroupCall',
          id: call2.id,
          accessHash: call2.accessHash,
        };
      }
      throw new Error('Group call created but not visible yet — retry join()');
    }

    throw new Error('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
  }

  private async resolveInputPeer(ref: ChatRef | 'self'): Promise<unknown> {
    if (ref === 'self') {
      return { _: 'inputPeerSelf' };
    }
    if (typeof this.client.resolvePeer === 'function') {
      const normalized = typeof ref === 'string'
        ? ref.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '')
        : ref;
      const candidates: unknown[] = typeof normalized === 'bigint'
        ? (normalized <= BigInt(Number.MAX_SAFE_INTEGER) && normalized >= BigInt(Number.MIN_SAFE_INTEGER)
            ? [Number(normalized), normalized.toString(), normalized]
            : [normalized.toString(), normalized])
        : [normalized];
      for (const candidate of candidates) {
        try {
          const peer = await this.client.resolvePeer(candidate);
          if (peer) {return peer;}
        } catch { /* try next */ }
      }
    }
    const id = await this.resolveChatId(ref);
    if (id <= -1000000000000n) {
      return { _: 'inputPeerChannel', channelId: Number(-id - 1000000000000n), accessHash: MtcuteAdapter.longOf(0n) };
    }
    if (id < 0n) {
      return { _: 'inputPeerChat', chatId: Number(-id) };
    }
    return { _: 'inputPeerUser', userId: Number(id), accessHash: MtcuteAdapter.longOf(0n) };
  }

  async joinGroupCall(inputCall: unknown, joinParams: string, options: JoinOptions): Promise<unknown> {
    const joinAs = options.joinAs !== undefined
      ? await this.resolveInputPeer(options.joinAs)
      : { _: 'inputPeerSelf' };
    return await this.client.call({
      _: 'phone.joinGroupCall',
      call: inputCall,
      params: {
        _: 'dataJSON',
        data: joinParams,
      },
      muted: options.muted === true,
      videoStopped: options.videoStopped ?? true,
      joinAs,
      ...(options.inviteHash !== undefined ? { inviteHash: options.inviteHash } : {}),
    });
  }

  async leaveGroupCall(inputCall: unknown, ssrc: number): Promise<void> {
    await this.client.call({
      _: 'phone.leaveGroupCall',
      call: inputCall,
      source: ssrc,
    });
  }

  async joinPresentationCall(inputCall: unknown, presentationParams: string): Promise<unknown> {
    return await this.client.call({
      _: 'phone.joinGroupCallPresentation',
      call: inputCall,
      params: {
        _: 'dataJSON',
        data: presentationParams,
      },
    });
  }

  async leavePresentationCall(inputCall: unknown): Promise<void> {
    await this.client.call({
      _: 'phone.leaveGroupCallPresentation',
      call: inputCall,
    });
  }

  extractConnectionParams(result: unknown): string | null {
    return findConnectionParams(result);
  }

  installUpdateHandler(
    onUpdate: (update: unknown) => void,
    onConnectionParams: (params: string) => void,
  ): () => void {
    if (this.updateCb !== null) {
      return () => this.removeUpdateHandler();
    }

    const handler = (updateContainer: unknown) => {
      const container = updateContainer as { update?: Record<string, unknown> } | Record<string, unknown> | undefined;
      const u = (container?.update ?? container) as Record<string, unknown> | undefined;
      if (!u) {return;}
      onUpdate(u);
      if (u._ === 'updateGroupCallConnection' || u.className === 'UpdateGroupCallConnection') {
        const params = (u.params ?? u) as { data?: unknown } | undefined;
        if (typeof params?.data === 'string') {
          onConnectionParams(params.data);
        }
      }
    };

    const subscription = this.client.onRawUpdate.add(handler);
    this.updateCb = handler;
    this.updateUnsubscribe = typeof subscription === 'function'
      ? subscription as () => void
      : null;

    return () => this.removeUpdateHandler();
  }

  private removeUpdateHandler(): void {
    if (this.updateCb === null) {return;}
    if (this.updateUnsubscribe !== null) {
      this.updateUnsubscribe();
    } else if (typeof this.client.onRawUpdate.remove === 'function') {
      this.client.onRawUpdate.remove(this.updateCb);
    }
    this.updateCb = null;
    this.updateUnsubscribe = null;
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
        isBot: Boolean(me.isBot ?? me.bot),
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
    const res = (await this.callWithSignal(
      { _: 'phone.getGroupCall', call: inputCall, limit: 0 },
      signal,
    )) as Record<string, any>;
    const gc = (res?.call ?? res) as Record<string, any>;
    if (!gc || gc._ === 'groupCallDiscarded' || gc.className === 'GroupCallDiscarded') {
      throw new Error('Group call is discarded or missing');
    }
    const id = asBigInt0(gc.id);
    const accessHash = asBigInt0(gc.accessHash);
    if (id === 0n) {
      throw new Error('phone.getGroupCall returned no call id');
    }
    // Preserve mtcute's Long object instances so subsequent TL calls keep their low/high representation.
    const canonicalCall = {
      _: 'inputGroupCall',
      id: MtcuteAdapter.longOf(gc.id),
      accessHash: MtcuteAdapter.longOf(gc.accessHash),
    };
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

  async editGroupCallParticipant(
    call: unknown,
    participant: ChatRef | 'self',
    options: EditParticipantOptions,
  ): Promise<unknown> {
    const peer = await this.resolveInputPeer(participant);
    return await this.client.call({
      _: 'phone.editGroupCallParticipant',
      call: this.toInputGroupCall(call),
      participant: peer,
      ...(options.muted !== undefined ? { muted: options.muted } : {}),
      ...(options.volume !== undefined ? { volume: Math.round(options.volume) } : {}),
      ...(options.raiseHand !== undefined ? { raiseHand: options.raiseHand } : {}),
      ...(options.videoStopped !== undefined ? { videoStopped: options.videoStopped } : {}),
      ...(options.videoPaused !== undefined ? { videoPaused: options.videoPaused } : {}),
      ...(options.presentationPaused !== undefined ? { presentationPaused: options.presentationPaused } : {}),
    });
  }

  async editGroupCallTitle(call: unknown, title: string): Promise<unknown> {
    return await this.client.call({
      _: 'phone.editGroupCallTitle',
      call: this.toInputGroupCall(call),
      title,
    });
  }

  async discardGroupCall(call: unknown): Promise<unknown> {
    return await this.client.call({
      _: 'phone.discardGroupCall',
      call: this.toInputGroupCall(call),
    });
  }

  async exportGroupCallInvite(call: unknown, options: { canSelfUnmute?: boolean } = {}): Promise<string> {
    const res = (await this.client.call({
      _: 'phone.exportGroupCallInvite',
      call: this.toInputGroupCall(call),
      ...(options.canSelfUnmute !== undefined ? { canSelfUnmute: options.canSelfUnmute } : {}),
    })) as { link?: string };
    if (typeof res?.link !== 'string' || !res.link) {
      throw new Error('phone.exportGroupCallInvite did not return an invite link');
    }
    return res.link;
  }

  async toggleGroupCallRecord(
    call: unknown,
    options: { start: boolean; title?: string; video?: boolean; videoPortrait?: boolean },
  ): Promise<unknown> {
    return await this.client.call({
      _: 'phone.toggleGroupCallRecord',
      call: this.toInputGroupCall(call),
      start: options.start,
      ...(options.title !== undefined ? { title: options.title } : {}),
      ...(options.video !== undefined ? { video: options.video } : {}),
      ...(options.videoPortrait !== undefined ? { videoPortrait: options.videoPortrait } : {}),
    });
  }

  async getParticipants(
    call: unknown,
    options: { ids: bigint[]; sources: number[]; offset: string; limit: number; signal?: AbortSignal },
  ): Promise<ParticipantPage> {
    const ids: unknown[] = [];
    for (const id of options.ids) {
      let peer: unknown;
      if (typeof this.client.resolvePeer === 'function') {
        const ref = id <= BigInt(Number.MAX_SAFE_INTEGER) && id >= BigInt(Number.MIN_SAFE_INTEGER)
          ? Number(id)
          : id.toString();
        try {
          peer = await this.client.resolvePeer(ref);
        } catch {
          /* fallback below */
        }
      }
      if (!peer) {
        peer = {
          _: 'inputPeerUser',
          userId: Number(id < 0n ? -id : id),
          accessHash: MtcuteAdapter.longOf(0n),
        };
      }
      ids.push(peer);
    }
    const sources = options.sources.map((s) => s | 0);
    const res = (await this.callWithSignal(
      {
        _: 'phone.getGroupParticipants',
        call: this.toInputGroupCall(call),
        ids,
        sources,
        offset: options.offset,
        limit: options.limit,
      },
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
    if (typeof this.client.resolvePeer === 'function') {
      try {
        peer = await this.client.resolvePeer(chatId);
      } catch {
        try {
          peer = await this.client.resolvePeer(Number(chatId));
        } catch {
          peer = chatId;
        }
      }
    }
    const res = (await this.callWithSignal(
      {
        _: 'phone.getGroupCallStreamRtmpUrl',
        peer,
        revoke: options.revoke === true,
        ...(options.liveStory ? { liveStory: true } : {}),
      },
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
    const res = (await this.callWithSignal(
      { _: 'phone.getGroupCallStreamChannels', call: this.toInputGroupCall(call) },
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
    const location = {
      _: 'inputGroupCallStream',
      call: this.toInputGroupCall(call),
      timeMs: MtcuteAdapter.longOf(request.timeMs),
      scale: request.scale ?? 0,
      ...(hasVideoChannel ? { videoChannel: request.videoChannel, videoQuality: request.videoQuality } : {}),
    };
    const res = (await this.callWithSignal(
      {
        _: 'upload.getFile',
        precise: true,
        cdnSupported: false,
        location,
        offset: MtcuteAdapter.longOf(request.offset),
        limit: request.limit,
      },
      signal,
      dcId,
      true,
    )) as Record<string, any>;
    if (
      res?._ === 'upload.fileCdnRedirect' ||
      res?.className === 'upload.FileCdnRedirect' ||
      res?.fileToken !== undefined
    ) {
      return { redirect: res };
    }
    const bytes = res?.bytes instanceof Uint8Array ? Uint8Array.from(res.bytes) : new Uint8Array();
    return { bytes };
  }

  async getConferenceInfo(ref: ConferenceRef, signal?: AbortSignal): Promise<ConferenceInfo> {
    let inputCall: Record<string, unknown>;
    if ('slug' in ref) {
      inputCall = { _: 'inputGroupCallSlug', slug: ref.slug };
    } else if ('inviteMessageId' in ref) {
      inputCall = { _: 'inputGroupCallInviteMessage', msgId: ref.inviteMessageId };
    } else {
      inputCall = {
        _: 'inputGroupCall',
        id: MtcuteAdapter.longOf((ref as any).id),
        accessHash: MtcuteAdapter.longOf((ref as any).accessHash),
      };
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

  private extractConferenceResult(updates: unknown, fallbackCall?: Record<string, any>): ConferenceResult {
    const rawCall = extractGroupCallFromUpdates(updates) ?? fallbackCall;
    const rawId = rawCall?.id ?? fallbackCall?.id;
    const rawAccessHash = rawCall?.accessHash ?? fallbackCall?.accessHash;
    const id = asBigInt0(rawId);
    const accessHash = asBigInt0(rawAccessHash);
    if (id === 0n) {
      throw new Error('Conference RPC response did not include a valid group call');
    }
    const call = {
      _: 'inputGroupCall',
      id: MtcuteAdapter.longOf(rawId),
      accessHash: MtcuteAdapter.longOf(rawAccessHash),
    };
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
    if (!(join.publicKey instanceof Uint8Array) || join.publicKey.length !== 32) {
      throw new Error('Conference public key must be exactly 32 bytes');
    }
    const updates = await this.callWithSignal(
      {
        _: 'phone.createConferenceCall',
        join: options.join,
        randomId: options.randomId,
        muted: options.muted,
        videoStopped: options.videoStopped,
        publicKey: new Uint8Array(join.publicKey.buffer, join.publicKey.byteOffset, join.publicKey.byteLength),
        block: Buffer.from(join.block),
        params: { _: 'dataJSON', data: join.payload },
      },
      options.signal,
    );
    return this.extractConferenceResult(updates);
  }

  async joinConference(
    call: unknown,
    join: ConferenceJoin,
    options: { muted: boolean; videoStopped: boolean; signal?: AbortSignal },
  ): Promise<ConferenceResult> {
    if (!(join.publicKey instanceof Uint8Array) || join.publicKey.length !== 32) {
      throw new Error('Conference public key must be exactly 32 bytes');
    }
    const inputCall = this.toInputGroupCall(call);
    const updates = await this.callWithSignal(
      {
        _: 'phone.joinGroupCall',
        call: inputCall,
        joinAs: { _: 'inputPeerSelf' },
        muted: options.muted,
        videoStopped: options.videoStopped,
        publicKey: new Uint8Array(join.publicKey.buffer, join.publicKey.byteOffset, join.publicKey.byteLength),
        block: Buffer.from(join.block),
        params: { _: 'dataJSON', data: join.payload },
      },
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
    return await this.callWithSignal(
      {
        _: 'phone.getGroupCallChainBlocks',
        call: this.toInputGroupCall(call),
        subChainId: subchain,
        offset,
        limit,
      },
      signal,
    );
  }

  async sendConferenceBroadcast(call: unknown, block: Buffer, signal?: AbortSignal): Promise<unknown> {
    return await this.callWithSignal(
      {
        _: 'phone.sendConferenceCallBroadcast',
        call: this.toInputGroupCall(call),
        block: Buffer.from(block),
      },
      signal,
    );
  }

  async sendConferenceMessage(call: unknown, encryptedMessage: Buffer, signal?: AbortSignal): Promise<unknown> {
    return await this.callWithSignal(
      {
        _: 'phone.sendGroupCallEncryptedMessage',
        call: this.toInputGroupCall(call),
        encryptedMessage: Buffer.from(encryptedMessage),
      },
      signal,
    );
  }

  private async toInputUser(user: unknown): Promise<Record<string, unknown>> {
    if (user && typeof user === 'object') {
      const u = user as Record<string, any>;
      if (u._ === 'inputUser') {return u;}
      if (u._ === 'inputPeerUser' || u.userId !== undefined) {
        return {
          _: 'inputUser',
          userId: Number(asBigInt0(u.userId)),
          accessHash: MtcuteAdapter.longOf(u.accessHash),
        };
      }
    }
    const userId = await this.resolveUserId(user as ChatRef);
    return await this.inputUser(userId);
  }

  async inviteConferenceParticipant(
    call: unknown,
    user: unknown,
    options: { video: boolean; signal?: AbortSignal },
  ): Promise<unknown> {
    const userId = await this.toInputUser(user);
    return await this.callWithSignal(
      {
        _: 'phone.inviteConferenceCallParticipant',
        call: this.toInputGroupCall(call),
        userId,
        ...(options.video ? { video: true } : {}),
      },
      options.signal,
    );
  }

  async leaveConference(call: unknown, source: number): Promise<void> {
    await this.leaveGroupCall(this.toInputGroupCall(call), source | 0);
  }

  // --- P2P (1-on-1) calls ------------------------------------------------
  // mtcute uses plain `{ _: 'method', ... }` objects and `Long` instances for
  // 64-bit fields; the tl writer reads `val.low`/`val.high`, so a bigint must
  // be split explicitly (a raw bigint would serialize as 0).

  private callCb: ((update: unknown) => void) | null = null;
  private callUnsubscribe: (() => void) | null = null;

  /** Build a Long-shaped value for the TL writer. */
  private static longOf(value: unknown): unknown {
    if (value === undefined || value === null) {return { low: 0, high: 0, unsigned: false };}
    if (typeof value === 'bigint') {
      return {
        low: Number(value & 0xFFFFFFFFn) | 0,
        high: Number((value >> 32n) & 0xFFFFFFFFn) | 0,
        unsigned: false,
      };
    }
    return value;
  }

  async resolveUserId(user: ChatRef): Promise<bigint> {
    if (typeof user === 'number' || typeof user === 'bigint') {
      const n = BigInt(user);
      return n < 0n ? -n : n;
    }
    const s = String(user).trim();
    if (/^\d+$/.test(s)) {return BigInt(s);}
    if (typeof this.client.resolvePeer === 'function') {
      const peer = await this.client.resolvePeer(s.replace(/^@/, '')) as { userId?: unknown; id?: unknown };
      const id = peer?.userId ?? peer?.id;
      if (id !== undefined) {return asBigInt0(id);}
    }
    throw new Error(`Cannot resolve user "${user}" — pass a numeric user id or a cached username.`);
  }

  async getCallEligibility(userId: bigint): Promise<CallEligibilityInfo> {
    const me = await this.client.getMe?.() as Record<string, any> | undefined;
    const result = await this.client.call({
      _: 'users.getFullUser', id: await this.inputUser(userId),
    }) as { fullUser: Record<string, any>; users: Array<Record<string, any>> };
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
    const res = await this.client.call({ _: 'messages.getDhConfig', version: 0, randomLength: 256 }) as { g: number; p: Uint8Array; random: Uint8Array };
    return { g: res.g, p: Buffer.from(res.p), random: Buffer.from(res.random) };
  }

  private static phoneProtocol(protocol: unknown): Record<string, unknown> {
    const p = protocol as { minLayer: number; maxLayer: number; udpP2p: boolean; udpReflector: boolean; libraryVersions: string[] };
    return {
      _: 'phoneCallProtocol',
      minLayer: p.minLayer, maxLayer: p.maxLayer, udpP2p: p.udpP2p,
      udpReflector: p.udpReflector, libraryVersions: p.libraryVersions,
    };
  }

  private static inputPhoneCall(callId: bigint, accessHash: bigint): Record<string, unknown> {
    return { _: 'inputPhoneCall', id: MtcuteAdapter.longOf(callId), accessHash: MtcuteAdapter.longOf(accessHash) };
  }

  /** phone.requestCall takes InputUser; resolvePeer returns inputPeerUser. */
  private async inputUser(userId: bigint): Promise<Record<string, unknown>> {
    if (typeof this.client.resolvePeer === 'function') {
      // mtcute writes userId with int53(): a bigint there throws "Cannot mix
      // BigInt and other types", so resolve with a number (or a string).
      const ref = userId <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(userId) : userId.toString();
      const peer = await this.client.resolvePeer(ref) as Record<string, unknown>;
      if (peer?._ === 'inputUser') {return peer;}
      if (peer?.userId !== undefined) {
        return {
          _: 'inputUser',
          userId: Number(asBigInt0(peer.userId)),
          accessHash: peer.accessHash,
        };
      }
    }
    throw new Error('Cannot resolve an InputUser for the callee — cache the peer first (getUser) or pass a numeric id.');
  }

  async acceptCall(callId: bigint, accessHash: bigint, gB: Buffer, protocol: unknown): Promise<unknown> {
    return await this.client.call({
      _: 'phone.acceptCall',
      peer: MtcuteAdapter.inputPhoneCall(callId, accessHash),
      gB,
      protocol: MtcuteAdapter.phoneProtocol(protocol),
    });
  }

  async requestCall(userId: bigint, gAHash: Buffer, protocol: unknown, video: boolean): Promise<unknown> {
    return await this.client.call({
      _: 'phone.requestCall',
      userId: await this.inputUser(userId),
      randomId: Math.floor(Math.random() * 2 ** 31),
      gAHash,
      protocol: MtcuteAdapter.phoneProtocol(protocol),
      video,
    });
  }

  async confirmCall(callId: bigint, accessHash: bigint, gA: Buffer, keyFingerprint: bigint, protocol: unknown): Promise<unknown> {
    return await this.client.call({
      _: 'phone.confirmCall',
      peer: MtcuteAdapter.inputPhoneCall(callId, accessHash),
      gA,
      keyFingerprint: MtcuteAdapter.longOf(keyFingerprint),
      protocol: MtcuteAdapter.phoneProtocol(protocol),
    });
  }

  async discardCall(callId: bigint, accessHash: bigint, duration: number, reason: unknown, connectionId: bigint): Promise<void> {
    await this.client.call({
      _: 'phone.discardCall',
      peer: MtcuteAdapter.inputPhoneCall(callId, accessHash),
      duration,
      reason: reason ?? { _: 'phoneCallDiscardReasonHangup' },
      connectionId: MtcuteAdapter.longOf(connectionId),
    });
  }

  async sendSignalingData(callId: bigint, accessHash: bigint, data: Buffer): Promise<void> {
    await this.client.call({
      _: 'phone.sendSignalingData',
      peer: MtcuteAdapter.inputPhoneCall(callId, accessHash),
      data,
    });
  }

  installCallHandler(
    onPhoneCall: (phoneCall: unknown) => void,
    onSignaling: (phoneCallId: bigint, data: Buffer) => void,
  ): () => void {
    if (this.callCb !== null) {return () => this.removeCallHandler();}
    const handler = (updateContainer: unknown): void => {
      const container = updateContainer as { update?: Record<string, unknown> } | Record<string, unknown> | undefined;
      const u = (container?.update ?? container) as Record<string, unknown> | undefined;
      if (!u) {return;}
      if (u._ === 'updatePhoneCall' && u.phoneCall) {
        onPhoneCall(u.phoneCall);
      } else if (u.className === 'UpdatePhoneCall' && u.phoneCall) {
        onPhoneCall(u.phoneCall);
      } else if (u._ === 'updatePhoneCallSignalingData' && u.data !== undefined && u.phoneCallId !== undefined) {
        const d = u.data as Uint8Array;
        onSignaling(asBigInt0(u.phoneCallId), Buffer.from(d));
      }
    };
    const subscription = this.client.onRawUpdate.add(handler);
    this.callCb = handler;
    this.callUnsubscribe = typeof subscription === 'function' ? subscription as () => void : null;
    return () => this.removeCallHandler();
  }

  private removeCallHandler(): void {
    if (this.callCb === null) {return;}
    if (this.callUnsubscribe !== null) {
      this.callUnsubscribe();
    } else if (typeof this.client.onRawUpdate.remove === 'function') {
      this.client.onRawUpdate.remove(this.callCb);
    }
    this.callCb = null;
    this.callUnsubscribe = null;
  }
}
