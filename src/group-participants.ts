import { TgCallsError } from './errors.js';
import { ParticipantRegistry, participantKey, type ParticipantInfo, type ParticipantRegistryChange } from './participants.js';

export interface ParticipantPage {
  participants: ParticipantInfo[]; version: number; nextOffset: string; count: number;
}
export interface GroupParticipantPort {
  getParticipants(call: unknown, options: { ids: bigint[]; sources: number[]; offset: string; limit: number; signal?: AbortSignal }): Promise<ParticipantPage>;
}

/** Snapshot + passive delta ordering for one active group generation. */
export class GroupParticipantController {
  readonly registry = new ParticipantRegistry();
  private closed = false;
  private readonly abort = new AbortController();
  private refreshWork?: Promise<void>;
  private pending: Array<{ participants: ParticipantInfo[]; version: number }> = [];
  private readonly unsubscribe: () => void;
  constructor(private readonly options: {
    call: unknown; adapter: GroupParticipantPort;
    onChange?: (change: ParticipantRegistryChange) => void;
    onError?: (error: unknown) => void;
    timeoutMs?: number;
  }) {
    this.unsubscribe = this.registry.subscribe((change) => {
      options.onChange?.(change);
      if (change.reason === 'gap') void this.refresh().catch((error) => options.onError?.(error));
    });
  }
  update(participants: ParticipantInfo[], version: number): void {
    if (this.closed) return;
    if (this.refreshWork || !this.registry.version) {
      if (this.pending.length >= 256) throw new TgCallsError('Participant delta buffer exhausted');
      this.pending.push({ participants, version }); return;
    }
    this.registry.applyDelta(participants, version);
  }
  refresh(): Promise<void> {
    if (this.closed) return Promise.reject(new TgCallsError('Participant controller is closed'));
    if (this.refreshWork) return this.refreshWork;
    this.refreshWork = this.snapshot().finally(() => { this.refreshWork = undefined; });
    return this.refreshWork;
  }
  private async snapshot(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const peers = new Map<string, ParticipantInfo>();
      const seen = new Set<string>();
      let offset = '', version = 0, stable = true;
      for (let page = 0; page < 100; page++) {
        const response = await this.request({ ids: [], sources: [], offset, limit: 100 });
        if (this.closed) return;
        if (version && response.version !== version) { stable = false; break; }
        version = response.version;
        for (const p of response.participants) if (!p.left) peers.set(participantKey(p.peer), p);
        if (!response.nextOffset) {
          this.registry.applySnapshot([...peers.values()], version);
          for (const update of this.pending.splice(0)) this.registry.applyDelta(update.participants, update.version);
          return;
        }
        if (seen.has(response.nextOffset)) throw new TgCallsError('Participant pagination made no progress');
        seen.add(response.nextOffset); offset = response.nextOffset;
      }
      if (stable) throw new TgCallsError('Participant pagination exceeded 100 pages');
    }
    throw new TgCallsError('Participant snapshot kept changing during pagination');
  }
  async lookup(sources: number[], signal?: AbortSignal): Promise<void> {
    const response = await this.request({ ids: [], sources: sources.map((s) => s | 0), offset: '', limit: 100 }, signal);
    if (this.closed) return;
    if (response.version !== this.registry.version) { await this.refresh(); return; }
    const merged = new Map(this.registry.snapshot().map((p) => [participantKey(p.peer), p]));
    for (const participant of response.participants) {
      if (participant.left) merged.delete(participantKey(participant.peer));
      else merged.set(participantKey(participant.peer), participant);
    }
    this.registry.applySnapshot([...merged.values()], response.version);
  }
  private async request(options: { ids: bigint[]; sources: number[]; offset: string; limit: number }, external?: AbortSignal): Promise<ParticipantPage> {
    const controller = new AbortController();
    const abort = () => controller.abort(new TgCallsError('Participant request cancelled'));
    this.abort.signal.addEventListener('abort', abort, { once: true });
    external?.addEventListener('abort', abort, { once: true });
    if (this.closed || external?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new TgCallsError('Participant request timed out')), this.options.timeoutMs ?? 10000);
    try {
      return await new Promise<ParticipantPage>((resolve, reject) => {
        const cancel = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) { cancel(); return; }
        Promise.resolve(this.options.adapter.getParticipants(this.options.call, { ...options, signal: controller.signal }))
          .then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', cancel));
      });
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener('abort', abort);
      external?.removeEventListener('abort', abort);
    }
  }
  close(): void {
    this.closed = true; this.abort.abort(); this.unsubscribe(); this.registry.dispose(); this.pending = [];
  }
}
