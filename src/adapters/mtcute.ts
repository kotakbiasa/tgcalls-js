import type { ChatRef, JoinOptions } from '../types.js';
import type { MtcuteLike, MTProtoAdapter } from './types.js';
import { asBigInt0, findConnectionParams, sleep } from './utils.js';

export class MtcuteAdapter implements MTProtoAdapter {
  readonly isAdapter = true as const;
  private readonly client: MtcuteLike;
  private updateCb: ((update: unknown) => void) | null = null;
  private updateUnsubscribe: (() => void) | null = null;

  constructor(client: MtcuteLike) {
    this.client = client;
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

  async joinGroupCall(inputCall: unknown, joinParams: string, options: JoinOptions): Promise<unknown> {
    return await this.client.call({
      _: 'phone.joinGroupCall',
      call: inputCall,
      params: {
        _: 'dataJSON',
        data: joinParams,
      },
      muted: options.muted === true,
      videoStopped: options.videoStopped ?? true,
      joinAs: { _: 'inputPeerSelf' },
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
      const peer = await this.client.resolvePeer(userId) as Record<string, unknown>;
      if (peer?._ === 'inputUser') {return peer;}
      if (peer?.userId !== undefined) {
        return { _: 'inputUser', userId: peer.userId, accessHash: peer.accessHash };
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
