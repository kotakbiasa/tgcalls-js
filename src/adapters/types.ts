import type { ChatRef, EditParticipantOptions, JoinOptions, MTProtoLike } from '../types.js';
import type { CallEligibilityInfo } from '../eligibility.js';
import type { BroadcastChunkRequest, BroadcastChunkResult } from '../broadcast.js';
import type { ConferenceInfo, ConferenceJoin, ConferenceRef, ConferenceResult } from '../conference.js';
import type { ParticipantPage } from '../group-participants.js';
import type { ParticipantInfo } from '../participants.js';

export interface MtcuteLike {
  call(request: unknown, params?: Record<string, unknown>): Promise<unknown>;
  resolvePeer?(ref: unknown): Promise<unknown>;
  resolveChannel?(ref: unknown): Promise<unknown>;
  getChat?(ref: unknown): Promise<{ id: number | bigint | string }>;
  getMe?(): Promise<unknown>;
  onRawUpdate: {
    add(cb: (update: any) => void): unknown;
    remove?(cb: any): void;
  };
}

export interface GroupCallInfo {
  call: unknown;
  id: bigint;
  accessHash: bigint;
  conference: boolean;
  rtmpStream: boolean;
  streamDcId?: number;
  version: number;
  inviteLink?: string;
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

  // --- Group metadata, participants, broadcast stream, and conference (#18/#20/#21) ---
  getSelfInfo?(): Promise<{ userId: bigint; isBot: boolean; authorized: boolean }>;
  getGroupCallInfo?(call: unknown, signal?: AbortSignal): Promise<GroupCallInfo>;
  getParticipants?(
    call: unknown,
    options: { ids: bigint[]; sources: number[]; offset: string; limit: number; signal?: AbortSignal },
  ): Promise<ParticipantPage>;
  normalizeParticipants?(raw: unknown[]): ParticipantInfo[];
  editGroupCallParticipant?(
    call: unknown,
    participant: ChatRef | 'self',
    options: EditParticipantOptions,
  ): Promise<unknown>;
  editGroupCallTitle?(call: unknown, title: string): Promise<unknown>;
  discardGroupCall?(call: unknown): Promise<unknown>;
  exportGroupCallInvite?(call: unknown, options?: { canSelfUnmute?: boolean }): Promise<string>;
  toggleGroupCallRecord?(
    call: unknown,
    options: { start: boolean; title?: string; video?: boolean; videoPortrait?: boolean },
  ): Promise<unknown>;
  getStreamRtmpUrl?(
    chatId: bigint,
    options?: { revoke?: boolean; liveStory?: boolean; signal?: AbortSignal },
  ): Promise<{ url: string; key: string }>;
  getStreamChannels?(
    call: unknown,
    dcId: number,
    signal: AbortSignal,
  ): Promise<Array<{ channel: number; lastTimestampMs: bigint }>>;
  downloadStreamChunk?(
    call: unknown,
    request: BroadcastChunkRequest,
    dcId: number,
    signal: AbortSignal,
  ): Promise<BroadcastChunkResult>;
  getConferenceInfo?(ref: ConferenceRef, signal?: AbortSignal): Promise<ConferenceInfo>;
  createConference?(
    join: ConferenceJoin,
    options: { join: true; randomId: number; muted: boolean; videoStopped: boolean; signal?: AbortSignal },
  ): Promise<ConferenceResult>;
  joinConference?(
    call: unknown,
    join: ConferenceJoin,
    options: { muted: boolean; videoStopped: boolean; signal?: AbortSignal },
  ): Promise<ConferenceResult>;
  getChainBlocks?(
    call: unknown,
    subchain: number,
    offset: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<unknown>;
  sendConferenceBroadcast?(call: unknown, block: Buffer, signal?: AbortSignal): Promise<unknown>;
  sendConferenceMessage?(call: unknown, encryptedMessage: Buffer, signal?: AbortSignal): Promise<unknown>;
  inviteConferenceParticipant?(
    call: unknown,
    user: unknown,
    options: { video: boolean; signal?: AbortSignal },
  ): Promise<unknown>;
  leaveConference?(call: unknown, source: number): Promise<void>;

  // --- P2P (1-on-1) calls. Optional: adapters without these cannot do P2P. ---
  /** Resolve a user ref to a plain (positive) user id. */
  resolveUserId?(user: ChatRef): Promise<bigint>;
  /** Read profile/session flags without invoking a ringing call RPC. */
  getCallEligibility?(userId: bigint): Promise<CallEligibilityInfo>;
  /** messages.getDhConfig → DH params for the call key exchange. */
  getDhConfig?(): Promise<{ g: number; p: Buffer; random: Buffer }>;
  /** phone.acceptCall — answer an incoming call with our g_b. */
  acceptCall?(callId: bigint, accessHash: bigint, gB: Buffer, protocol: unknown): Promise<unknown>;
  /** phone.requestCall — start an outgoing call. */
  requestCall?(userId: bigint, gAHash: Buffer, protocol: unknown, video: boolean): Promise<unknown>;
  /** phone.confirmCall — confirm an outgoing call after the callee accepts. */
  confirmCall?(callId: bigint, accessHash: bigint, gA: Buffer, keyFingerprint: bigint, protocol: unknown): Promise<unknown>;
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
