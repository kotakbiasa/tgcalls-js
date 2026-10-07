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
        id: asBigInt0(call.id),
        accessHash: asBigInt0(call.accessHash),
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
          id: asBigInt0(call2.id),
          accessHash: asBigInt0(call2.accessHash),
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
  }
}
