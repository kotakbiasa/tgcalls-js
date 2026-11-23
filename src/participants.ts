import { TgCallsError } from './errors.js';

export interface PeerIdentity {
  kind: 'user' | 'channel' | 'chat';
  id: bigint;
}
export type ParticipantDevice = 'microphone' | 'camera' | 'screen';
export interface ParticipantVideo {
  endpoint: string;
  paused?: boolean;
  sourceGroups: { semantics: string; sources: number[] }[];
  audioSource?: number;
}
export interface ParticipantInfo {
  peer: PeerIdentity;
  source: number;
  left?: boolean;
  self?: boolean;
  muted?: boolean;
  versioned?: boolean;
  justJoined?: boolean;
  video?: ParticipantVideo;
  presentation?: ParticipantVideo;
}
export interface ParticipantSource {
  peer: PeerIdentity;
  ssrc: number;
  device: ParticipantDevice;
  endpoint?: string;
  paused?: boolean;
}

/** TL int32 and native bigint SSRCs have the same unsigned 32-bit identity. */
export function normalizeSsrc(value: number | bigint): number {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new TgCallsError('SSRC must be an integer');
  }
  const integer = BigInt(value);
  if (integer < -0x80000000n || integer > 0xffffffffn) {
    throw new TgCallsError('SSRC is outside the 32-bit range');
  }
  return Number(BigInt.asUintN(32, integer));
}
export function participantKey(peer: PeerIdentity): string {
  if (!['user', 'channel', 'chat'].includes(peer.kind) || typeof peer.id !== 'bigint' || peer.id <= 0n) {
    throw new TgCallsError('Participant peer must have a kind and positive bigint id');
  }
  return `${peer.kind}:${peer.id}`;
}

export interface ParticipantSourceChange extends ParticipantSource {
  state: 'active' | 'paused' | 'stopped';
  origin: 'mtproto';
}
export interface ParticipantRegistryChange {
  origin: 'mtproto';
  reason: 'snapshot' | 'delta' | 'gap' | 'alias';
  version: number;
  sourceChanges: ParticipantSourceChange[];
}
export interface ParticipantRegistryOptions {
  gapTimeoutMs?: number;
  maxPendingDeltas?: number;
}

function copyParticipant(value: ParticipantInfo): ParticipantInfo {
  participantKey(value.peer);
  const video = (stream: ParticipantVideo | undefined): ParticipantVideo | undefined => {
    if (!stream) { return undefined; }
    if (!stream.endpoint || !Array.isArray(stream.sourceGroups)) { throw new TgCallsError('Invalid video endpoint'); }
    return {
      ...stream,
      audioSource: stream.audioSource === undefined ? undefined : normalizeSsrc(stream.audioSource),
      sourceGroups: stream.sourceGroups.map((group) => ({
        semantics: group.semantics, sources: group.sources.map(normalizeSsrc),
      })),
    };
  };
  return { ...value, peer: { ...value.peer }, source: normalizeSsrc(value.source), video: video(value.video), presentation: video(value.presentation) };
}
function checkVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version <= 0) { throw new TgCallsError('Participant version must be a positive integer'); }
}

/**
 * Feed complete paginated snapshots and normalized passive/RPC deltas here.
 * Missing versions are held for at most one second; a gap notification asks the
 * owner to refetch group info + all participant pages. No native callbacks/RPCs
 * are registered by this class. Unversioned updates follow Telegram's rule and
 * apply regardless of revision. Adapter normalization owns TL min-only fields.
 */
export class ParticipantRegistry {
  private participants = new Map<string, ParticipantInfo>();
  private sources = new Map<string, ParticipantSource | null>();
  private aliases = new Map<string, { ssrc: number; signature: string }>();
  private listeners = new Set<(change: ParticipantRegistryChange) => void>();
  private pending = new Map<number, ParticipantInfo[]>();
  private timer?: ReturnType<typeof setTimeout>;
  private firstDelta = true;
  private _version = 0;
  private _needsResync = false;
  private readonly gapTimeoutMs: number;
  private readonly maxPendingDeltas: number;

  constructor(options: ParticipantRegistryOptions = {}) {
    this.gapTimeoutMs = options.gapTimeoutMs ?? 1000;
    this.maxPendingDeltas = options.maxPendingDeltas ?? 32;
    if (!Number.isFinite(this.gapTimeoutMs) || this.gapTimeoutMs < 0 || !Number.isSafeInteger(this.maxPendingDeltas) || this.maxPendingDeltas < 1) {
      throw new TgCallsError('Invalid participant gap bounds');
    }
  }
  get version(): number { return this._version; }
  get needsResync(): boolean { return this._needsResync; }
  snapshot(): ParticipantInfo[] { return [...this.participants.values()].map(copyParticipant); }
  subscribe(listener: (change: ParticipantRegistryChange) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  applySnapshot(participants: readonly ParticipantInfo[], version: number): void {
    checkVersion(version);
    const next = new Map<string, ParticipantInfo>();
    for (const participant of participants.map(copyParticipant)) {
      if (!participant.left) { next.set(participantKey(participant.peer), participant); }
    }
    if (version < this._version) { return; }
    const previous = this.tracks();
    this.participants = next;
    this._version = version;
    this._needsResync = false;
    this.firstDelta = true;
    for (const v of this.pending.keys()) { if (v <= version) { this.pending.delete(v); } }
    this.rebuild();
    this.emit('snapshot', previous);
    this.drain();
  }
  applyDelta(participants: readonly ParticipantInfo[], version: number): 'applied' | 'ignored' | 'gap' {
    checkVersion(version);
    const values = participants.map(copyParticipant);
    const versioned = values.some((p) => p.versioned || p.left || p.justJoined);
    if (versioned) {
      if (!this._version || version < this._version || (version === this._version && !this.firstDelta)) { return 'ignored'; }
      if (version > this._version + 1) {
        if (this.pending.size >= this.maxPendingDeltas && !this.pending.has(version)) { this.invalidate(); }
        else {
          this.pending.set(version, values);
          if (!this.timer) { this.timer = setTimeout(() => this.invalidate(), this.gapTimeoutMs); this.timer.unref(); }
        }
        return 'gap';
      }
    }
    const previous = this.tracks();
    for (const participant of values) {
      const key = participantKey(participant.peer);
      if (participant.left) { this.participants.delete(key); }
      else { this.participants.set(key, participant); }
    }
    if (versioned) { this._version = version; this.firstDelta = false; }
    this.rebuild();
    this.emit('delta', previous);
    this.drain();
    return 'applied';
  }
  bindEndpoint(endpoint: string, ssrc: number | bigint): void {
    const value = normalizeSsrc(ssrc);
    if (!value || !this.tracks().some((track) => track.endpoint === endpoint)) { return; }
    const signatures = this.endpointSignatures();
    const signature = signatures.get(endpoint);
    if (!signature) { return; }
    this.aliases.set(endpoint, { ssrc: value, signature });
    this.rebuild();
    this.emit('alias', this.tracks());
  }
  unbindEndpoint(endpoint: string): void { this.aliases.delete(endpoint); this.rebuild(); }
  lookup(ssrc: number | bigint, device: ParticipantDevice): ParticipantSource | undefined {
    if (this._needsResync) { return undefined; }
    const source = this.sources.get(`${device}:${normalizeSsrc(ssrc)}`);
    return source ? { ...source, peer: { ...source.peer } } : undefined;
  }
  dispose(): void { clearTimeout(this.timer); this.timer = undefined; this.pending.clear(); this.listeners.clear(); }

  private drain(): void {
    const next = this.pending.get(this._version + 1);
    if (next) { this.pending.delete(this._version + 1); this.applyDelta(next, this._version + 1); }
    if (!this.pending.size) { clearTimeout(this.timer); this.timer = undefined; }
  }
  private invalidate(): void {
    clearTimeout(this.timer); this.timer = undefined; this.pending.clear(); this._needsResync = true;
    this.emit('gap', this.tracks());
  }
  private tracks(): ParticipantSourceChange[] {
    const tracks: ParticipantSourceChange[] = [];
    for (const p of this.participants.values()) {
      if (p.self) { continue; }
      tracks.push({ peer: { ...p.peer }, ssrc: p.source, device: 'microphone', state: p.muted ? 'paused' : 'active', origin: 'mtproto' });
      for (const [device, video] of [['camera', p.video], ['screen', p.presentation]] as const) {
        if (!video) { continue; }
        tracks.push({ peer: { ...p.peer }, ssrc: video.sourceGroups[0]?.sources[0] ?? 0, device, endpoint: video.endpoint, state: video.paused ? 'paused' : 'active', origin: 'mtproto' });
      }
    }
    return tracks;
  }
  private endpointSignatures(): Map<string, string> {
    const signatures = new Map<string, string>();
    for (const p of this.participants.values()) {
      for (const [device, video] of [['camera', p.video], ['screen', p.presentation]] as const) {
        if (!video || p.self) { continue; }
        const signature = `${participantKey(p.peer)}:${device}:${JSON.stringify(video)}`;
        signatures.set(video.endpoint, signatures.has(video.endpoint) ? '' : signature);
      }
    }
    return signatures;
  }
  private rebuild(): void {
    this.sources.clear();
    const endpoints = new Set<string>();
    const signatures = this.endpointSignatures();
    for (const [endpoint, alias] of this.aliases) { if (signatures.get(endpoint) !== alias.signature) { this.aliases.delete(endpoint); } }
    const add = (ssrc: number, peer: PeerIdentity, device: ParticipantDevice, endpoint?: string, paused?: boolean): void => {
      if (!ssrc) { return; }
      const key = `${device}:${ssrc}`;
      const existing = this.sources.get(key);
      if (existing === null || (existing && (participantKey(existing.peer) !== participantKey(peer) || existing.endpoint !== endpoint))) {
        this.sources.set(key, null); return;
      }
      this.sources.set(key, { peer: { ...peer }, ssrc, device, endpoint, paused });
    };
    for (const p of this.participants.values()) {
      if (p.self) { continue; }
      add(p.source, p.peer, 'microphone');
      for (const [device, video] of [['camera', p.video], ['screen', p.presentation]] as const) {
        if (!video) { continue; }
        endpoints.add(video.endpoint);
        for (const group of video.sourceGroups) { for (const source of group.sources) { add(source, p.peer, device, video.endpoint, video.paused); } }
        if (video.audioSource !== undefined) { add(video.audioSource, p.peer, 'microphone'); }
        const alias = this.aliases.get(video.endpoint);
        if (alias) { add(alias.ssrc, p.peer, device, video.endpoint, video.paused); }
      }
    }
    for (const endpoint of this.aliases.keys()) { if (!endpoints.has(endpoint)) { this.aliases.delete(endpoint); } }
  }
  private emit(reason: ParticipantRegistryChange['reason'], previous: ParticipantSourceChange[]): void {
    const current = this.tracks();
    const key = (track: ParticipantSourceChange): string => `${participantKey(track.peer)}:${track.device}:${track.endpoint ?? ''}:${track.ssrc}:${track.state}`;
    const oldKeys = new Set(previous.map(key));
    const newKeys = new Set(current.map(key));
    const sourceChanges: ParticipantSourceChange[] = [
      ...previous.filter((track) => !newKeys.has(key(track))).map((track) => ({ ...track, state: 'stopped' as const })),
      ...current.filter((track) => !oldKeys.has(key(track))),
    ];
    for (const listener of [...this.listeners]) { listener({ origin: 'mtproto', reason, version: this._version, sourceChanges }); }
  }
}
