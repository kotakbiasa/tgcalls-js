import type { ChatRef, JoinOptions, MTProtoLike } from '../types.js';
import type { MTProtoAdapter } from './types.js';
import { loadTl, loadEvents } from '../tl.js';
import { asBigInt0, findConnectionParams, markedIdFromEntity, sleep } from './utils.js';

type AnyApi = Record<string, any>;

export class GramjsAdapter implements MTProtoAdapter {
  readonly isAdapter = true as const;
  private readonly client: MTProtoLike;
  private readonly Api: AnyApi;
  private updateCb: ((update: unknown) => void) | null = null;
  private updateBuilder: unknown | null = null;

  constructor(client: MTProtoLike, opts?: { Api?: unknown }) {
    this.client = client;
    this.Api = loadTl(opts?.Api);
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
    const builder = events?.Raw
      ? new events.Raw({ types: [this.Api.UpdateGroupCallConnection] })
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
  }
}
