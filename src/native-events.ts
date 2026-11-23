import type { NTgCalls } from 'ntgcalls';

type Callback<K extends keyof NTgCalls> = NTgCalls[K] extends (callback: infer F) => void
  ? F extends (...args: any[]) => unknown ? F : never : never;

export interface NativeEvents {
  frames: Callback<'onFrames'>;
  connectionChange: Callback<'onConnectionChange'>;
  streamEnd: Callback<'onStreamEnd'>;
  signalingData: Callback<'onSignalingData'>;
  remoteSourceChange: Callback<'onRemoteSourceChange'>;
  requestBroadcastPart: Callback<'onRequestBroadcastPart'>;
  requestBroadcastTimestamp: Callback<'onRequestBroadcastTimestamp'>;
  requestParticipants: Callback<'onRequestParticipants'>;
  outboundBlock: Callback<'onOutboundBlock'>;
  subchainRequest: Callback<'onSubchainRequest'>;
  updateEmojis: Callback<'onUpdateEmojis'>;
  upgrade: Callback<'onUpgrade'>;
}

const methods: { [K in keyof NativeEvents]: keyof NTgCalls } = {
  frames: 'onFrames', connectionChange: 'onConnectionChange', streamEnd: 'onStreamEnd',
  signalingData: 'onSignalingData', remoteSourceChange: 'onRemoteSourceChange',
  requestBroadcastPart: 'onRequestBroadcastPart', requestBroadcastTimestamp: 'onRequestBroadcastTimestamp',
  requestParticipants: 'onRequestParticipants', outboundBlock: 'onOutboundBlock',
  subchainRequest: 'onSubchainRequest', updateEmojis: 'onUpdateEmojis', upgrade: 'onUpgrade',
};

/** Own each native callback once and fan it out without replacing other consumers. */
export class NativeEventRouter {
  private readonly handlers = new Map<keyof NativeEvents, Set<(...args: any[]) => unknown>>();
  private readonly wired = new Set<keyof NativeEvents>();
  private disposed = false;

  constructor(private readonly native: Partial<NTgCalls>, private readonly onError: (error: unknown) => void = console.error) {}

  on<K extends keyof NativeEvents>(event: K, callback: NativeEvents[K]): () => void {
    if (this.disposed) {throw new Error('Native event router is disposed');}
    const register = this.native[methods[event]];
    if (typeof register !== 'function') {throw new Error(`Native event ${event} is not supported`);}
    if (!this.wired.has(event)) {
      (register as (callback: (...args: any[]) => void) => void).call(this.native, (...args) => {
        if (this.disposed) {return;}
        for (const fn of [...(this.handlers.get(event) ?? [])]) {
          try { Promise.resolve(fn(...args)).catch((error: unknown) => this.report(error)); }
          catch (error) {this.report(error);}
        }
      });
      this.wired.add(event);
    }
    let set = this.handlers.get(event);
    if (!set) {set = new Set(); this.handlers.set(event, set);}
    const fn = callback as (...args: any[]) => unknown;
    set.add(fn);
    return () => {set!.delete(fn);};
  }

  dispose(): void {
    this.disposed = true;
    this.handlers.clear();
  }

  private report(error: unknown): void {
    try {this.onError(error);} catch { /* observer error reporting cannot escape a native callback */ }
  }
}
