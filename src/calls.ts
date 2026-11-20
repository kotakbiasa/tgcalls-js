/**
 * P2P (1-on-1) call manager — answers incoming Telegram voice calls and streams
 * an audio source into them. The DH key exchange and WebRTC engine are handled
 * by the ntgcalls native core; this module orchestrates the MTProto signaling
 * (phone.acceptCall / sendSignalingData + UpdatePhoneCall / SignalingData).
 *
 * Incoming flow (grounded in a proven ntgcalls P2P implementation):
 *   PhoneCallRequested → createP2pCall → CAPTURE source → getDhConfig →
 *   initExchange(g_a_hash)→g_b → phone.acceptCall
 *   PhoneCall (confirmed) → exchangeKeys(g_a_or_b, fingerprint) → connectP2p →
 *   flush queued signaling → PLAYBACK source → unmute + resume
 *   Signaling relays both ways; PhoneCallDiscarded tears down.
 */

import { NTgCalls, StreamMode, MediaSource } from 'ntgcalls';
import type { MTProtoAdapter } from './adapters/types.js';
import type { AudioSource, TgCallsOptions } from './types.js';
import { asBigInt0 } from './adapters/utils.js';
import { audioDescription } from './media.js';

export interface ListenCallsOptions {
  /** Audio streamed into answered calls (file / url / shell). */
  source: AudioSource;
  /** Auto-accept incoming calls (default true). If false, onIncoming decides. */
  autoAccept?: boolean;
  /** Optional gate: return false to reject an incoming call. */
  onIncoming?: (info: { userId: bigint; callId: bigint }) => boolean | Promise<boolean>;
  /** ffmpeg binary override. */
  ffmpegPath?: string;
  /** Sink for internal warnings. */
  logger?: { error(...args: unknown[]): void };
}

interface P2PSession {
  callId: bigint;
  accessHash: bigint;
  peerId: bigint;
  p2pStarted: boolean;
  connInit: boolean;
  queue: Buffer[];
  startedAt: number;
}

type PhoneCallObj = Record<string, any>;

/**
 * ntgcalls' JS binding requires a plain JS Array for every `bytes::binary`
 * parameter (the shipped index.d.ts wrongly declares Buffer). A Buffer or
 * Uint8Array throws "An array was expected" from the generated NAPI glue
 * (targets/node/addon.cc.tpl: JsReader<std::vector<T>> -> v.As<Napi::Array>()).
 * Verified on ntgcalls 3.0.7 and 3.1.0-beta01. Return type is declared Buffer
 * to satisfy the (incorrect) upstream typings while passing an Array at runtime.
 */
function jsBytes(v: Uint8Array | number[]): Buffer {
  return Array.from(v as Uint8Array) as unknown as Buffer;
}


function buildRtcServers(connections: PhoneCallObj[] | undefined): unknown[] {
  const servers: unknown[] = [];
  for (const conn of connections ?? []) {
    try {
      servers.push({
        id: asBigInt0(conn.id),
        ipv4: conn.ip ?? conn.ipv4 ?? '',
        ipv6: conn.ipv6 ?? '',
        port: conn.port,
        username: conn.username,
        password: conn.password,
        turn: conn.turn ?? false,
        stun: conn.stun ?? false,
        tcp: conn.tcp ?? false,
        peerTag: conn.peerTag ? jsBytes(conn.peerTag) : undefined,
      });
    } catch { /* skip malformed endpoint */ }
  }
  return servers;
}

export class P2PCallManager {
  private readonly sessions = new Map<bigint, P2PSession>(); // callId → session
  private stopHandler: (() => void) | null = null;
  private readonly log: { error(...args: unknown[]): void };

  constructor(
    private readonly ntg: NTgCalls,
    private readonly adapter: MTProtoAdapter,
    private readonly opts: ListenCallsOptions,
  ) {
    this.log = opts.logger ?? { error: console.error.bind(console) };
  }

  /** Start listening for incoming P2P calls. */
  start(): void {
    const a = this.adapter;
    if (!a.installCallHandler || !a.getDhConfig || !a.acceptCall || !a.sendSignalingData || !a.discardCall) {
      throw new Error('This MTProto adapter does not support P2P calls (need a GramJS/teleproto client).');
    }
    // Native → Telegram signaling relay (group calls never fire this).
    this.ntg.onSignalingData((chatId: bigint, data: Buffer) => { void this.relayOut(chatId, data); });
    this.stopHandler = a.installCallHandler(
      (pc) => { void this.onPhoneCall(pc as PhoneCallObj); },
      (callId, data) => { void this.onSignalingIn(callId, data); },
    );
  }

  /** Stop listening and tear down any active P2P calls. */
  async stop(): Promise<void> {
    this.stopHandler?.();
    this.stopHandler = null;
    for (const s of this.sessions.values()) {
      try { await this.ntg.stop(s.peerId); } catch { /* best-effort */ }
    }
    this.sessions.clear();
  }

  /** Active P2P call peer ids. */
  activePeers(): bigint[] {
    return [...this.sessions.values()].map((s) => s.peerId);
  }

  private findByPeer(peerId: bigint): P2PSession | undefined {
    for (const s of this.sessions.values()) {if (s.peerId === peerId) {return s;}}
    return undefined;
  }

  private async relayOut(peerId: bigint, data: Buffer): Promise<void> {
    const s = this.findByPeer(peerId);
    if (!s) {return;}
    this.log.error('[p2p] sigOut peer=%s len=%d', String(peerId), data?.length);
    try { await this.adapter.sendSignalingData!(s.callId, s.accessHash, data); }
    catch (e) { this.log.error('[tgcalls-js] signaling relay error:', e); }
  }

  private async onSignalingIn(callId: bigint, data: Buffer): Promise<void> {
    const s = this.sessions.get(callId);
    if (!s) {return;}
    this.log.error('[p2p] sigIn callId=%s len=%d connInit=%s', String(callId), data?.length, String(s.connInit));
    if (!s.connInit) { s.queue.push(data); return; }
    try { await this.ntg.sendSignalingData(s.peerId, jsBytes(data)); }
    catch (e) { this.log.error('[tgcalls-js] sendSignalingData error:', e); }
  }

  private async onPhoneCall(pc: PhoneCallObj): Promise<void> {
    const kind = pc?.className;
    try {
      if (kind === 'PhoneCallRequested') {await this.acceptIncoming(pc);}
      else if (kind === 'PhoneCall') {await this.connectP2p(pc);}
      else if (kind === 'PhoneCallDiscarded') {await this.onDiscarded(pc);}
      // PhoneCallAccepted / PhoneCallWaiting belong to the outgoing flow (later phase).
    } catch (e) {
      this.log.error('[tgcalls-js] call handling error:', e);
    }
  }

  private async acceptIncoming(pc: PhoneCallObj): Promise<void> {
    const callId = asBigInt0(pc.id);
    const accessHash = asBigInt0(pc.accessHash);
    const peerId = asBigInt0(pc.adminId);
    if (this.sessions.has(callId)) {return;}

    const accept = this.opts.autoAccept !== false;
    let allowed = accept;
    if (this.opts.onIncoming) {
      allowed = await this.opts.onIncoming({ userId: peerId, callId });
    }
    if (!allowed) {
      await this.adapter.discardCall!(callId, accessHash, 0, undefined, 0n);
      return;
    }

    const session: P2PSession = { callId, accessHash, peerId, p2pStarted: false, connInit: false, queue: [], startedAt: Date.now() };
    this.sessions.set(callId, session);
    const t0 = Date.now();
    const step = (m: string): void => this.log.error(`[p2p] ${m} +${Date.now() - t0}ms`);
    this.log.error('[p2p] incoming callId=%s peer=%s idType=%s ahType=%s accessHash=%s',
      String(callId), String(peerId), typeof pc.id, typeof pc.accessHash, String(pc.accessHash));

    // createP2pCall MUST precede initExchange; the native call id is the peer id.
    await this.ntg.createP2pCall(peerId);
    step('createP2pCall ok');
    const mediaOpts = { client: {} as never, ffmpegPath: this.opts.ffmpegPath } as TgCallsOptions;
    await this.ntg.setStreamSources(peerId, StreamMode.CAPTURE, {
      microphone: audioDescription(this.opts.source, mediaOpts),
    });
    step('setStreamSources ok');

    const dh = await this.adapter.getDhConfig!();
    step(`getDhConfig ok g=${dh.g} p.len=${dh.p?.length} random.len=${dh.random?.length}`);
    const gB = await this.ntg.initExchange(peerId, { g: dh.g, p: jsBytes(dh.p), random: jsBytes(dh.random) }, jsBytes(pc.gAHash));
    step(`initExchange ok gB.len=${(gB as unknown as Buffer)?.length}`);
    const protocol = NTgCalls.getProtocol();
    try {
      await this.adapter.acceptCall!(callId, accessHash, gB, protocol);
      step('acceptCall ok');
    } catch (e) {
      step(`acceptCall FAILED: ${(e as Error).message}`);
      throw e;
    }
  }

  private async connectP2p(pc: PhoneCallObj): Promise<void> {
    const callId = asBigInt0(pc.id);
    const s = this.sessions.get(callId);
    if (!s || s.p2pStarted) {return;} // Telegram re-sends PhoneCall; connect exactly once.
    s.p2pStarted = true;
    s.accessHash = asBigInt0(pc.accessHash);
    const t1 = Date.now();
    const st = (m: string): void => this.log.error(`[p2p] ${m} +${Date.now() - t1}ms`);
    this.log.error('[p2p] confirmed id=%s gAOrB.len=%s fingerprint=%s conns=%d p2pAllowed=%s',
      String(callId), String((pc.gAOrB as unknown as Buffer)?.length), String(pc.keyFingerprint),
      (pc.connections ?? []).length, String(pc.p2pAllowed));

    await this.ntg.exchangeKeys(s.peerId, jsBytes(pc.gAOrB), asBigInt0(pc.keyFingerprint));
    st('exchangeKeys ok');
    const servers = buildRtcServers(pc.connections);
    const protocol = NTgCalls.getProtocol();
    // customParameters must be valid JSON: an empty string is a PRESENT optional
    // and json::parse("") throws "incomplete JSON" inside the native core.
    await this.ntg.connectP2p(s.peerId, servers as never, protocol.libraryVersions, pc.p2pAllowed ?? true, '{}');
    st(`connectP2p ok servers=${servers.length}`);

    s.connInit = true;
    for (const queued of s.queue) {
      try { await this.ntg.sendSignalingData(s.peerId, jsBytes(queued)); }
      catch (e) { this.log.error('[tgcalls-js] queued signaling error:', e); }
    }
    s.queue = [];

    // PLAYBACK (inbound) after connect so incoming frames flow; then unmute/resume
    // or the call connects but carries no audio.
    await this.ntg.setStreamSources(s.peerId, StreamMode.PLAYBACK, {
      microphone: { mediaSource: MediaSource.EXTERNAL, sampleRate: 48000, channelCount: 1, input: '', keepOpen: false },
    });
    await this.ntg.unmute(s.peerId);
    await this.ntg.resume(s.peerId);
  }

  private async onDiscarded(pc: PhoneCallObj): Promise<void> {
    const callId = asBigInt0(pc.id);
    const s = this.sessions.get(callId);
    if (!s) {return;}
    this.sessions.delete(callId);
    try { await this.ntg.stop(s.peerId); } catch { /* best-effort */ }
    const duration = Math.floor((Date.now() - s.startedAt) / 1000);
    try { await this.adapter.discardCall!(callId, s.accessHash, duration, pc.reason, 0n); }
    catch { /* peer already gone */ }
  }
}
