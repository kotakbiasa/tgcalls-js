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

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { NTgCalls, StreamMode, MediaSource, ConnectionState, StreamDevice } from 'ntgcalls';
import type { MTProtoAdapter } from './adapters/types.js';
import type { AudioSource, TgCallsOptions, VideoOptions } from './types.js';
import { asBigInt0 } from './adapters/utils.js';
import { audioDescription, probeVideo, recordingDescription, videoDescription } from './media.js';

export interface ListenCallsOptions {
  /** Audio streamed into answered calls (file / url / shell). */
  source: AudioSource;
  /** Auto-accept incoming calls (default true). If false, onIncoming decides. */
  autoAccept?: boolean;
  /** Optional gate: return false to reject an incoming call. */
  onIncoming?: (info: { userId: bigint; callId: bigint }) => boolean | Promise<boolean>;
  /** ffmpeg binary override. */
  ffmpegPath?: string;
  /** ffprobe binary override (used when `video` is enabled). */
  ffprobePath?: string;
  /** Verbose per-step signaling/ICE diagnostics (default false). */
  debug?: boolean;
  /**
   * Send video into the call (Telegram 1:1 video call). Requires a file/url
   * source with a video stream; the caller must have requested a video call.
   */
  video?: boolean | VideoOptions;
  /**
   * Record the call. A string records the remote party's audio to that path.
   * Pass an object to also capture the remote camera: `.mp4`/`.mkv` outputs mux
   * video+audio, any other extension records audio only.
   */
  record?: string | CallRecordOptions;
  /** Sink for internal warnings. */
  logger?: { error(...args: unknown[]): void };
}

export interface CallRecordOptions {
  /** Output file. `.mp4`/`.mkv` = video+audio; other extensions = audio only. */
  path: string;
  /**
   * Capture the remote camera (default: true for .mp4/.mkv). The native engine
   * delivers raw I420 frames; the wrapper muxes them with the recorded audio.
   */
  video?: boolean | { width?: number; height?: number; fps?: number };
}

interface P2PSession {
  callId: bigint;
  accessHash: bigint;
  peerId: bigint;
  p2pStarted: boolean;
  connInit: boolean;
  queue: Buffer[];
  startedAt: number;
  /** Active recording state for this call (video frames + finalize info). */
  record?: ActiveRecording;
}

interface ActiveRecording {
  outPath: string;
  audioPath: string;
  rawPath: string;
  fd: number;
  width: number;
  height: number;
  fps: number;
  frames: number;
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
  private readonly debug: boolean;
  /** Normalized `record` option (null when recording is off). */
  private readonly rec: NormalizedRecord | null;

  constructor(
    private readonly ntg: NTgCalls,
    private readonly adapter: MTProtoAdapter,
    private readonly opts: ListenCallsOptions,
    private readonly emitState?: (peerId: bigint, state: ConnectionState) => void,
  ) {
    this.log = opts.logger ?? { error: console.error.bind(console) };
    this.debug = opts.debug ?? false;
    this.rec = normalizeRecord(opts.record);
  }

  /** Start listening for incoming P2P calls. */
  start(): void {
    const a = this.adapter;
    if (!a.installCallHandler || !a.getDhConfig || !a.acceptCall || !a.sendSignalingData || !a.discardCall) {
      throw new Error('This MTProto adapter does not support P2P calls (need a GramJS/teleproto client).');
    }
    // Native → Telegram signaling relay (group calls never fire this).
    this.ntg.onSignalingData((chatId: bigint, data: Buffer) => { void this.relayOut(chatId, data); });
    // Remote video frames (only delivered when a PLAYBACK camera is configured).
    if (typeof this.ntg.onFrames === 'function') {this.ntg.onFrames((chatId: bigint, mode: StreamMode, device: StreamDevice, frames: any[]) => {
      if (mode !== StreamMode.PLAYBACK || device !== StreamDevice.CAMERA) {return;}
      const s = this.findByPeer(chatId);
      const rec = s?.record;
      if (!rec || !frames?.length) {return;}
      for (const f of frames) {
        if (!f?.data?.length) {continue;}
        const w = f.frameData?.width ?? 0;
        const h = f.frameData?.height ?? 0;
        if (!rec.width && w > 0 && h > 0) { rec.width = w; rec.height = h; }
        if (w !== rec.width || h !== rec.height) {continue;} // ignore resolution switches
        try { fs.writeSync(rec.fd, f.data); rec.frames++; } catch { /* disk error → drop frame */ }
      }
    });}
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
      if (this.rec) {
        try { await this.ntg.setStreamSources(s.peerId, StreamMode.PLAYBACK, {}); } catch { /* best-effort */ }
      }
      try { await this.ntg.stop(s.peerId); } catch { /* best-effort */ }
      await this.finalizeRecording(s);
      this.emitState?.(s.peerId, ConnectionState.CLOSED);
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
    if (this.debug) { this.log.error('[p2p] sigOut peer=%s len=%d hex=%s', String(peerId), data?.length, data?.subarray(0, 44).toString('hex')); }
    try { await this.adapter.sendSignalingData!(s.callId, s.accessHash, data); }
    catch (e) { this.log.error('[tgcalls-js] signaling relay error:', e); }
  }

  private async onSignalingIn(callId: bigint, data: Buffer): Promise<void> {
    const s = this.sessions.get(callId);
    if (!s) {return;}
    if (this.debug) { this.log.error('[p2p] sigIn callId=%s len=%d connInit=%s', String(callId), data?.length, String(s.connInit)); }
    if (!s.connInit) { s.queue.push(data); return; }
    try { await this.ntg.sendSignalingData(s.peerId, jsBytes(data)); }
    catch (e) { this.log.error('[tgcalls-js] sendSignalingData error:', e); }
  }

  private async onPhoneCall(pc: PhoneCallObj): Promise<void> {
    const kind = pc?.className;
    try {
      if (kind === 'PhoneCallRequested') {await this.acceptIncoming(pc);}
      else if (kind === 'PhoneCallAccepted') {await this.onAccepted(pc);}
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
    const step = (m: string): void => { if (this.debug) { this.log.error(`[p2p] ${m} +${Date.now() - t0}ms`); } };
    if (this.debug) {
      this.log.error('[p2p] incoming callId=%s peer=%s idType=%s ahType=%s accessHash=%s',
        String(callId), String(peerId), typeof pc.id, typeof pc.accessHash, String(pc.accessHash));
    }

    // createP2pCall MUST precede initExchange; the native call id is the peer id.
    await this.ntg.createP2pCall(peerId);
    step('createP2pCall ok');
    const mediaOpts = { client: {} as never, ffmpegPath: this.opts.ffmpegPath, ffprobePath: this.opts.ffprobePath } as TgCallsOptions;
    const media: Record<string, unknown> = { microphone: audioDescription(this.opts.source, mediaOpts) };
    // setStreamSources REPLACES every device, so the camera must be included in
    // the same description as the microphone. Telegram 1:1 calls can be video
    // calls (PhoneCallRequested.video); the native core already registers camera
    // tracks for P2P, only the source has to be provided here.
    if (this.opts.video && this.opts.source.kind !== 'shell') {
      const targetOpts = typeof this.opts.video === 'object' ? this.opts.video : {};
      const srcPath = this.opts.source.kind === 'file' ? this.opts.source.path : this.opts.source.url;
      const probed = await probeVideo(srcPath, mediaOpts, targetOpts);
      media.camera = videoDescription(
        this.opts.source,
        { ...probed, ...targetOpts, width: probed.width, height: probed.height, fps: probed.fps },
        mediaOpts,
      );
      step(`camera ${probed.width}x${probed.height}@${probed.fps} peerVideo=${String(pc.video)}`);
    }
    await this.ntg.setStreamSources(peerId, StreamMode.CAPTURE, media as never);
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
    const st = (m: string): void => { if (this.debug) { this.log.error(`[p2p] ${m} +${Date.now() - t1}ms`); } };
    if (this.debug) {
      this.log.error('[p2p] confirmed id=%s gAOrB.len=%s fingerprint=%s conns=%d p2pAllowed=%s',
        String(callId), String((pc.gAOrB as unknown as Buffer)?.length), String(pc.keyFingerprint),
        (pc.connections ?? []).length, String(pc.p2pAllowed));
    }

    await this.ntg.exchangeKeys(s.peerId, jsBytes(pc.gAOrB), asBigInt0(pc.keyFingerprint));
    st('exchangeKeys ok');
    await this.startTransport(s, pc, st);
  }

  /**
   * Start an outgoing call. Returns the Telegram call id. The peer's accept
   * arrives as PhoneCallAccepted → confirmCall → PhoneCall, after which the
   * shared transport path (connectP2p + media) takes over.
   */
  async call(userId: bigint, opts: { video?: boolean | VideoOptions } = {}): Promise<bigint> {
    const wantVideo = Boolean(opts.video);
    const mediaOpts = { client: {} as never, ffmpegPath: this.opts.ffmpegPath, ffprobePath: this.opts.ffprobePath } as TgCallsOptions;
    await this.ntg.createP2pCall(userId);
    const media: Record<string, unknown> = { microphone: audioDescription(this.opts.source, mediaOpts) };
    if (wantVideo && this.opts.source.kind !== 'shell') {
      const targetOpts = typeof opts.video === 'object' ? opts.video : {};
      const srcPath = this.opts.source.kind === 'file' ? this.opts.source.path : this.opts.source.url;
      const probed = await probeVideo(srcPath, mediaOpts, targetOpts);
      media.camera = videoDescription(this.opts.source, { ...probed, ...targetOpts, width: probed.width, height: probed.height, fps: probed.fps }, mediaOpts);
    }
    await this.ntg.setStreamSources(userId, StreamMode.CAPTURE, media as never);

    const dh = await this.adapter.getDhConfig!();
    // null gaHash → native returns SHA256(g_a) instead of g_b (outgoing branch).
    const gAHash = await this.ntg.initExchange(
      userId, { g: dh.g, p: jsBytes(dh.p), random: jsBytes(dh.random) }, null as never,
    ) as Buffer;
    const protocol = NTgCalls.getProtocol();
    const res = await this.adapter.requestCall!(userId, gAHash, protocol, wantVideo) as PhoneCallObj;
    // teleproto wraps the RPC result: { className: 'phone.PhoneCall', phoneCall, users }.
    const raw = (res?.phoneCall ?? res) as PhoneCallObj;
    const callId = asBigInt0(raw?.id);
    if (!callId) { throw new Error('phone.requestCall returned no call id'); }
    this.sessions.set(callId, {
      callId, accessHash: asBigInt0(raw?.accessHash), peerId: userId,
      p2pStarted: false, connInit: false, queue: [], startedAt: Date.now(),
    });
    if (this.debug) { this.log.error('[p2p] outgoing callId=%s gAHash.len=%s video=%s', String(callId), String(gAHash?.length), String(wantVideo)); }
    return callId;
  }

  /** Callee accepted our outgoing call: exchange keys and confirm. */
  private async onAccepted(pc: PhoneCallObj): Promise<void> {
    const callId = asBigInt0(pc.id);
    const s = this.sessions.get(callId);
    if (!s || s.p2pStarted) {return;}
    const t1 = Date.now();
    const st = (m: string): void => { if (this.debug) { this.log.error(`[p2p] ${m} +${Date.now() - t1}ms`); } };
    // No fingerprint yet in the outgoing direction — the native core computes it.
    const auth = await this.ntg.exchangeKeys(s.peerId, jsBytes(pc.gB), 0n) as { keyFingerprint: bigint; gAOrB: Buffer };
    st(`exchangeKeys (outgoing) ok fingerprint=${String(auth.keyFingerprint)}`);
    const confirmed = await this.adapter.confirmCall!(
      callId, s.accessHash, Buffer.from(auth.gAOrB as unknown as Uint8Array), asBigInt0(auth.keyFingerprint), NTgCalls.getProtocol(),
    ) as PhoneCallObj;
    st('confirmCall ok');
    s.p2pStarted = true;
    await this.startTransport(s, confirmed, st);
  }

  /** Connect the native transport and start media (shared by both directions). */
  private async startTransport(s: P2PSession, pc: PhoneCallObj, st: (m: string) => void): Promise<void> {
    const servers = buildRtcServers(pc.connections);
    const jsonSafe = (_k: string, v: unknown): unknown => typeof v === 'bigint' ? String(v) : (Array.isArray(v) ? `Array(${v.length})` : (Buffer.isBuffer(v) ? `Buf(${v.length})` : v));
    if (this.debug) {
      this.log.error('[p2p] servers=%s', JSON.stringify(servers, jsonSafe));
      this.log.error('[p2p] rawConn0=%s', JSON.stringify((pc.connections ?? [])[0], jsonSafe));
    }
    // Signaling version: V3 (12.0.0/13.0.0) makes ntgcalls route signaling over an
    // SCTP data channel (SignalingSctpConnection), which is NOT the transport Telegram
    // uses for 1:1 calls — signaling arrives over MTProto (phone.sendSignalingData /
    // UpdatePhoneCallSignalingData). Force the V2 legacy external signaling backend.
    const peerVersions: string[] = Array.isArray(pc.protocol?.libraryVersions) ? pc.protocol.libraryVersions : [];
    const v2 = peerVersions.filter((v) => v === '8.0.0' || v === '9.0.0');
    const versions = v2.length ? v2 : ['8.0.0'];
    if (this.debug) { this.log.error('[p2p] peerVersions=%s -> using=%s', JSON.stringify(peerVersions), JSON.stringify(versions)); }
    // customParameters must be valid JSON: an empty string is a PRESENT optional
    // and json::parse("") throws "incomplete JSON" inside the native core.
    await this.ntg.connectP2p(s.peerId, servers as never, versions, pc.p2pAllowed ?? true, '{}');
    st(`connectP2p ok servers=${servers.length}`);

    s.connInit = true;
    for (const queued of s.queue) {
      try { await this.ntg.sendSignalingData(s.peerId, jsBytes(queued)); }
      catch (e) { this.log.error('[tgcalls-js] queued signaling error:', e); }
    }
    s.queue = [];

    // PLAYBACK (inbound) after connect so incoming frames flow; then unmute/resume
    // or the call connects but carries no audio. With `record`, the playback mic
    // becomes the recorder (native mixes remote speakers → ffmpeg); enabling a
    // PLAYBACK camera makes native deliver remote video frames to onFrames().
    const recOpt = this.rec;
    if (recOpt) {
      const playback: Record<string, unknown> = {
        microphone: recordingDescription(recOpt.audioPath, 48000, 1, this.opts.ffmpegPath ?? 'ffmpeg'),
      };
      if (recOpt.video) {
        const rawPath = `${recOpt.outPath}.video.i420`;
        s.record = {
          outPath: recOpt.outPath, audioPath: recOpt.audioPath, rawPath,
          fd: fs.openSync(rawPath, 'w'),
          width: recOpt.width ?? 0, height: recOpt.height ?? 0, fps: recOpt.fps, frames: 0,
        };
        playback.camera = {
          mediaSource: MediaSource.EXTERNAL,
          width: recOpt.width ?? 0, height: recOpt.height ?? 0, fps: recOpt.fps,
          input: '', keepOpen: false,
        };
      }
      await this.ntg.setStreamSources(s.peerId, StreamMode.PLAYBACK, playback as never);
      this.log.error('[p2p] recording -> %s (%s)', recOpt.outPath, recOpt.video ? 'video+audio' : 'audio only');
    } else {
      await this.ntg.setStreamSources(s.peerId, StreamMode.PLAYBACK, {
        microphone: { mediaSource: MediaSource.EXTERNAL, sampleRate: 48000, channelCount: 1, input: '', keepOpen: false },
      });
    }
    await this.ntg.unmute(s.peerId);
    await this.ntg.resume(s.peerId);
  }

  private async onDiscarded(pc: PhoneCallObj): Promise<void> {
    const callId = asBigInt0(pc.id);
    const s = this.sessions.get(callId);
    if (!s) {return;}
    this.sessions.delete(callId);
    // Close the recorder writer first so ffmpeg finalizes the container.
    if (this.rec) {
      try { await this.ntg.setStreamSources(s.peerId, StreamMode.PLAYBACK, {}); } catch { /* best-effort */ }
    }
    try { await this.ntg.stop(s.peerId); } catch { /* best-effort */ }
    await this.finalizeRecording(s);
    // ntg.stop() does not emit a CLOSED transition, so tell consumers explicitly.
    this.emitState?.(s.peerId, ConnectionState.CLOSED);
    const duration = Math.floor((Date.now() - s.startedAt) / 1000);
    try { await this.adapter.discardCall!(callId, s.accessHash, duration, pc.reason, 0n); }
    catch { /* peer already gone */ }
  }

  /**
   * Close the raw video sink and mux it with the recorded audio. Runs after the
   * playback writer is closed so the wav container is final.
   */
  private async finalizeRecording(s: P2PSession): Promise<void> {
    const rec = s.record;
    if (!rec) {return;}
    s.record = undefined;
    try { fs.closeSync(rec.fd); } catch { /* already closed */ }
    if (!rec.width || !rec.height || !rec.frames) {
      fs.rmSync(rec.rawPath, { force: true });
      this.log.error('[p2p] recording dropped: no video frames received');
      return;
    }
    try {
      await runProcess(this.opts.ffmpegPath ?? 'ffmpeg', [
        '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${rec.width}x${rec.height}`, '-r', String(rec.fps || 25),
        '-i', rec.rawPath, '-i', rec.audioPath,
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '96k', '-shortest', rec.outPath,
      ]);
      this.log.error('[p2p] recording saved -> %s (%dx%d, %d frames)', rec.outPath, rec.width, rec.height, rec.frames);
    } catch (e) {
      this.log.error('[p2p] recording mux failed:', e);
    } finally {
      fs.rmSync(rec.rawPath, { force: true });
      if (rec.audioPath !== rec.outPath) {fs.rmSync(rec.audioPath, { force: true });}
    }
  }
}

interface NormalizedRecord {
  /** Capture remote video in addition to audio. */
  video: boolean;
  /** Final output path. */
  outPath: string;
  /** Where the audio writer writes (equals outPath for audio-only recordings). */
  audioPath: string;
  width?: number;
  height?: number;
  fps: number;
}

/** Accept the string shorthand (audio only) and the object form (audio+video). */
function normalizeRecord(r: string | CallRecordOptions | undefined): NormalizedRecord | null {
  if (!r) {return null;}
  const path = typeof r === 'string' ? r : r.path;
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const videoExt = ext === '.mp4' || ext === '.mkv' || ext === '.webm';
  const wanted = typeof r === 'string' ? videoExt : (r.video ?? videoExt);
  const opts = typeof r === 'object' && typeof r.video === 'object' ? r.video : {};
  return {
    video: wanted !== false,
    outPath: path,
    audioPath: wanted !== false ? `${path}.audio.wav` : path,
    width: opts.width,
    height: opts.height,
    fps: opts.fps ?? 25,
  };
}

/** Run a child process to completion, rejecting on a non-zero exit. */
function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => { if (code === 0) {resolve();} else {reject(new Error(`${cmd} exited with code ${code}`));} });
  });
}
