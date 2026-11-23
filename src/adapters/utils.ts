/**
 * tgcalls-js — adapter utilities.
 */

import { normalizeSsrc, participantKey, type ParticipantInfo, type ParticipantVideo, type PeerIdentity } from '../participants.js';

export function toBigInt(v: unknown): bigint | undefined {
  if (v === undefined || v === null) {return undefined;}
  if (typeof v === 'bigint') {return v;}
  if (typeof v === 'number') {return BigInt(v);}
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      return undefined;
    }
  }
  if (typeof v === 'object' && typeof (v as { toString?: unknown }).toString === 'function') {
    try {
      return BigInt((v as { toString: () => string }).toString());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
export function asBigInt0(v: unknown): bigint {
  return toBigInt(v) ?? 0n;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function extractSsrc(joinParams: string): number {
  try {
    const parsed = JSON.parse(joinParams) as { ssrc?: number };
    if (typeof parsed.ssrc === 'number') {return parsed.ssrc;}
  } catch {
    /* malformed joinParams */
  }
  return 0;
}

/** Extract marked ID from GramJS entity. */
export function markedIdFromEntity(entity: unknown): bigint | undefined {
  if (!entity || typeof entity !== 'object') {return undefined;}
  const e = entity as Record<string, unknown>;
  const rawId = toBigInt(e.id);
  if (rawId === undefined) {return undefined;}
  // Supergroups & channels: id -> -100...
  if (e.className === 'Channel' || e.className === 'ChannelForbidden') {
    return rawId > 0n ? -(1000000000000n + rawId) : rawId;
  }
  // Basic groups: id -> negative
  if (e.className === 'Chat' || e.className === 'ChatForbidden') {
    return rawId > 0n ? -rawId : rawId;
  }
  return rawId;
}

/** Find UpdateGroupCallConnection params inside raw updates or updates wrapper. */
export function findConnectionParams(updates: unknown): string | null {
  if (!updates) {return null;}
  const list: unknown[] = Array.isArray(updates)
    ? updates
    : Array.isArray((updates as Record<string, unknown>).updates)
      ? ((updates as Record<string, unknown>).updates as unknown[])
      : [updates];

  for (const item of list) {
    if (!item || typeof item !== 'object') {continue;}
    const u = item as Record<string, unknown>;
    if (u.className === 'UpdateGroupCallConnection' || u._ === 'updateGroupCallConnection') {
      const params = (u.params ?? u) as { data?: unknown } | undefined;
      if (typeof params?.data === 'string') {
        return params.data;
      }
    }
  }
  return null;
}

/** Convert 32-byte public key to little-endian unsigned bigint for GramJS/teleproto int256. */
export function uint256ToLittleEndianBigInt(bytes: Uint8Array): bigint {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error('Conference public key must be exactly 32 bytes');
  }
  let result = 0n;
  for (let i = 31; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}

/** Classify MTProto session authorization errors that mean no active user session is available. */
export function isUnauthorizedError(error: unknown): boolean {
  const msg = String((error as any)?.errorMessage ?? (error as any)?.code ?? (error as any)?.message ?? error ?? '');
  return /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|AUTH_KEY_PERM_EMPTY|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|UNAUTHORIZED/i.test(msg);
}

/** Normalize GramJS/teleproto or mtcute Peer object into PeerIdentity. */
export function normalizePeerIdentity(peer: unknown): PeerIdentity {
  if (!peer || typeof peer !== 'object') {
    throw new Error('Invalid participant peer');
  }
  const p = peer as Record<string, unknown>;
  if ((p.kind === 'user' || p.kind === 'channel' || p.kind === 'chat') && p.id !== undefined) {
    const id = asBigInt0(p.id);
    const absId = id < 0n ? -id : id;
    if (absId <= 0n) {throw new Error('Participant peer id must be positive');}
    return { kind: p.kind, id: absId };
  }
  const kindRaw = String(p.className ?? p._ ?? '').toLowerCase();
  if (kindRaw === 'peeruser' || p.userId !== undefined || p.user_id !== undefined) {
    const id = asBigInt0(p.userId ?? p.user_id ?? p.id);
    if (id <= 0n) {throw new Error('Participant user id must be positive');}
    return { kind: 'user', id };
  }
  if (kindRaw === 'peerchannel' || p.channelId !== undefined || p.channel_id !== undefined) {
    const raw = asBigInt0(p.channelId ?? p.channel_id ?? p.id);
    const id = raw < 0n ? (raw <= -1000000000000n ? -raw - 1000000000000n : -raw) : raw;
    if (id <= 0n) {throw new Error('Participant channel id must be positive');}
    return { kind: 'channel', id };
  }
  if (kindRaw === 'peerchat' || p.chatId !== undefined || p.chat_id !== undefined) {
    const raw = asBigInt0(p.chatId ?? p.chat_id ?? p.id);
    const id = raw < 0n ? -raw : raw;
    if (id <= 0n) {throw new Error('Participant chat id must be positive');}
    return { kind: 'chat', id };
  }
  throw new Error(`Unsupported participant peer shape: ${kindRaw || JSON.stringify(p)}`);
}

export function normalizeParticipantVideo(video: unknown): ParticipantVideo | undefined {
  if (!video || typeof video !== 'object') {return undefined;}
  const v = video as Record<string, any>;
  const endpoint = typeof v.endpoint === 'string' ? v.endpoint : '';
  if (!endpoint) {return undefined;}
  const rawGroups = Array.isArray(v.sourceGroups) ? v.sourceGroups : Array.isArray(v.source_groups) ? v.source_groups : [];
  const sourceGroups = rawGroups.map((group: any) => ({
    semantics: String(group?.semantics ?? ''),
    sources: Array.isArray(group?.sources) ? group.sources.map((s: unknown) => normalizeSsrc(asBigInt0(s))) : [],
  }));
  const audioRaw = v.audioSource ?? v.audio_source;
  return {
    endpoint,
    ...(v.paused !== undefined ? { paused: Boolean(v.paused) } : {}),
    sourceGroups,
    ...(audioRaw !== undefined && audioRaw !== null ? { audioSource: normalizeSsrc(asBigInt0(audioRaw)) } : {}),
  };
}

/**
 * Normalize raw TL GroupCallParticipant items and merge `min` constructors
 * with previously observed full participant records for this adapter.
 */
export function normalizeParticipantList(
  raw: unknown[],
  minCache?: Map<string, ParticipantInfo>,
): ParticipantInfo[] {
  if (!Array.isArray(raw)) {return [];}
  const result: ParticipantInfo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {continue;}
    const p = item as Record<string, any>;
    const peer = normalizePeerIdentity(p.peer);
    const key = participantKey(peer);
    const cached = minCache?.get(key);
    const isMin = Boolean(p.min);
    const left = Boolean(p.left);
    const self = isMin && cached !== undefined ? Boolean(p.self || cached.self) : Boolean(p.self);
    const muted = p.muted !== undefined ? Boolean(p.muted) : Boolean(cached?.muted);
    const versioned = Boolean(p.versioned);
    const justJoined = Boolean(p.justJoined ?? p.just_joined);
    const video = p.video !== undefined ? normalizeParticipantVideo(p.video) : undefined;
    const presentation = p.presentation !== undefined ? normalizeParticipantVideo(p.presentation) : undefined;
    const normalized: ParticipantInfo = {
      peer,
      source: normalizeSsrc(asBigInt0(p.source)),
      ...(left ? { left: true } : {}),
      ...(self ? { self: true } : {}),
      ...(muted ? { muted: true } : {}),
      ...(versioned ? { versioned: true } : {}),
      ...(justJoined ? { justJoined: true } : {}),
      ...(video ? { video } : {}),
      ...(presentation ? { presentation } : {}),
    };
    if (minCache) {
      if (left) {
        minCache.delete(key);
      } else {
        minCache.set(key, normalized);
      }
    }
    result.push(normalized);
  }
  return result;
}

/** Find GroupCall object inside UpdateGroupCall or fallback chain block updates. */
export function extractGroupCallFromUpdates(updates: unknown): Record<string, any> | undefined {
  if (!updates || typeof updates !== 'object') {return undefined;}
  const items: any[] = Array.isArray(updates)
    ? updates
    : Array.isArray((updates as any).updates)
      ? (updates as any).updates
      : [updates];
  for (const item of items) {
    const u = item?.update ?? item;
    if (!u || typeof u !== 'object') {continue;}
    const kind = String(u.className ?? u._ ?? '').toLowerCase();
    if (kind === 'updategroupcall' && u.call) {
      return u.call as Record<string, any>;
    }
  }
  for (const item of items) {
    const u = item?.update ?? item;
    if (u?.call && u.call.id !== undefined) {
      return u.call as Record<string, any>;
    }
  }
  return undefined;
}
