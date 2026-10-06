/**
 * tgcalls-js — adapter utilities.
 */

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
