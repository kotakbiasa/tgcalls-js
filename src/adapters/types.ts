import type { ChatRef, JoinOptions, MTProtoLike } from '../types.js';

export interface MtcuteLike {
  call(request: unknown): Promise<unknown>;
  resolvePeer?(ref: unknown): Promise<unknown>;
  resolveChannel?(ref: unknown): Promise<unknown>;
  getChat?(ref: unknown): Promise<{ id: number | bigint | string }>;
  onRawUpdate: {
    add(cb: (update: any) => void): unknown;
    remove?(cb: any): void;
  };
}

export interface MTProtoAdapter {
  readonly isAdapter: true;
  resolveChatId(chat: ChatRef): Promise<bigint>;
  getGroupCall(chatId: bigint, allowCreate: boolean): Promise<unknown>;
  joinGroupCall(inputCall: unknown, joinParams: string, options: JoinOptions): Promise<unknown>;
  leaveGroupCall(inputCall: unknown, ssrc: number): Promise<void>;
  joinPresentationCall(inputCall: unknown, presentationParams: string): Promise<unknown>;
  leavePresentationCall(inputCall: unknown): Promise<void>;
  extractConnectionParams(result: unknown): string | null;
  installUpdateHandler(
    onUpdate: (update: unknown) => void,
    onConnectionParams: (params: string) => void,
  ): () => void;
  dispose?(): void;
}

export type SupportedClient = MTProtoLike | MtcuteLike | MTProtoAdapter;
