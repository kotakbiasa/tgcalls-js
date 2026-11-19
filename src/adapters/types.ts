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
  /** Create a call if missing; `rtmpStream` is forwarded to CreateGroupCall. */
  getGroupCall(chatId: bigint, allowCreate: boolean, rtmpStream?: boolean): Promise<unknown>;
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

  // --- P2P (1-on-1) calls. Optional: adapters without these cannot do P2P. ---
  /** Resolve a user ref to a plain (positive) user id. */
  resolveUserId?(user: ChatRef): Promise<bigint>;
  /** messages.getDhConfig → DH params for the call key exchange. */
  getDhConfig?(): Promise<{ g: number; p: Buffer; random: Buffer }>;
  /** phone.acceptCall — answer an incoming call with our g_b. */
  acceptCall?(callId: bigint, accessHash: bigint, gB: Buffer, protocol: unknown): Promise<unknown>;
  /** phone.requestCall — start an outgoing call. */
  requestCall?(userId: bigint, gAHash: Buffer, protocol: unknown, video: boolean): Promise<unknown>;
  /** phone.confirmCall — confirm an outgoing call after the callee accepts. */
  confirmCall?(callId: bigint, accessHash: bigint, gB: Buffer, keyFingerprint: bigint, protocol: unknown): Promise<unknown>;
  /** phone.discardCall — hang up / reject. */
  discardCall?(callId: bigint, accessHash: bigint, duration: number, reason: unknown, connectionId: bigint): Promise<void>;
  /** phone.sendSignalingData — relay WebRTC signaling to the peer. */
  sendSignalingData?(callId: bigint, accessHash: bigint, data: Buffer): Promise<void>;
  /** Subscribe to raw UpdatePhoneCall + UpdatePhoneCallSignalingData. */
  installCallHandler?(
    onPhoneCall: (phoneCall: unknown) => void,
    onSignaling: (phoneCallId: bigint, data: Buffer) => void,
  ): () => void;
}

export type SupportedClient = MTProtoLike | MtcuteLike | MTProtoAdapter;
