import type { ChatRef } from './types.js';

/** A preflight result reflects the latest profile flags; Telegram can still reject a later call. */
export type CallDenialReason =
  | 'INVALID_USER'
  | 'ADAPTER_UNSUPPORTED'
  | 'SESSION_UNAVAILABLE'
  | 'BOT_ACCOUNT'
  | 'SELF_CALL'
  | 'USER_IS_BOT'
  | 'USER_DELETED'
  | 'USER_BLOCKED'
  | 'PRIVACY_RESTRICTED'
  | 'CALLS_UNAVAILABLE'
  | 'VIDEO_UNAVAILABLE';

export interface CallCheckOptions { video?: boolean }

/** Normalized users.getFullUser flags, with the current session's identity. */
export interface CallEligibilityInfo {
  userId: bigint;
  selfId?: bigint;
  selfBot: boolean;
  bot: boolean;
  deleted: boolean;
  blocked: boolean;
  phoneCallsAvailable: boolean;
  phoneCallsPrivate: boolean;
  videoCallsAvailable: boolean;
}

export interface CallEligibilityAdapter {
  resolveUserId?(user: ChatRef): Promise<bigint>;
  resolveChatId(user: ChatRef): Promise<bigint>;
  getCallEligibility?(userId: bigint): Promise<CallEligibilityInfo>;
}

/** No ringing RPCs and no swallowed transport errors: an unavailable lookup remains an error. */
export async function getCallDenialReason(
  adapter: CallEligibilityAdapter, user: ChatRef, options: CallCheckOptions = {},
): Promise<CallDenialReason | null> {
  if ((typeof user === 'number' && (!Number.isSafeInteger(user) || user <= 0))
    || (typeof user === 'bigint' && user <= 0n)
    || (typeof user === 'string' && /^-?\d+$/.test(user.trim()) && BigInt(user.trim()) <= 0n)) {
    return 'INVALID_USER';
  }
  if (!adapter.getCallEligibility) {return 'ADAPTER_UNSUPPORTED';}
  const id = adapter.resolveUserId
    ? await adapter.resolveUserId(user) : await adapter.resolveChatId(user);
  if (id <= 0n) {return 'INVALID_USER';}
  const info = await adapter.getCallEligibility(id);
  if (info.selfId === undefined) {return 'SESSION_UNAVAILABLE';}
  if (info.selfBot) {return 'BOT_ACCOUNT';}
  if (info.selfId === info.userId) {return 'SELF_CALL';}
  if (info.bot) {return 'USER_IS_BOT';}
  if (info.deleted) {return 'USER_DELETED';}
  if (info.blocked) {return 'USER_BLOCKED';}
  if (info.phoneCallsPrivate) {return 'PRIVACY_RESTRICTED';}
  if (!info.phoneCallsAvailable) {return 'CALLS_UNAVAILABLE';}
  if (options.video && !info.videoCallsAvailable) {return 'VIDEO_UNAVAILABLE';}
  return null;
}
