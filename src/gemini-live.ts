/**
 * Built-in Gemini Live API (BidiGenerateContent) real-time Voice & Video AI
 * bridge for tgcalls-js.
 *
 * Connects a Telegram group voice chat, 1-on-1 P2P call, or E2E conference
 * directly to Google's Gemini Multimodal Live WebSocket endpoint:
 * - Incoming Telegram speech (48 kHz) -> resampled to 16 kHz s16le PCM -> Gemini `realtimeInput.audio`
 * - Outgoing Gemini speech (24 kHz) -> resampled to 48 kHz s16le PCM -> paced 10ms frames into Telegram
 * - Gemini `serverContent.interrupted` (or local VAD barge-in) -> `tg.interruptAudio(chat)`
 */

import type { ConferenceHandle } from './conference.js';
import { i420ToBmp, type ExternalAudioFrame, type ExternalVideoFrame } from './external-frames.js';
import type { ChatRef } from './types.js';

export interface GeminiLiveCallPort {
  onAudioFrame(
    chat: ChatRef | ConferenceHandle,
    handler: (frame: ExternalAudioFrame) => void | Promise<void>,
    options?: { sampleRate?: number; channels?: 1 | 2; targetSampleRate?: number; targetChannels?: 1 | 2 },
  ): Promise<() => void>;
  onVideoFrame?(
    chat: ChatRef | ConferenceHandle,
    handler: (frame: ExternalVideoFrame) => void | Promise<void>,
    options?: { device?: 'camera' | 'screen' | 'both' },
  ): Promise<() => void>;
  pushAudioFrame(
    chat: ChatRef | ConferenceHandle,
    pcm: Uint8Array,
    options?: {
      sampleRate?: number;
      channels?: 1 | 2;
      inputSampleRate?: number;
      inputChannels?: 1 | 2;
      paced?: boolean;
      paceIntervalMs?: number;
    },
  ): Promise<void>;
  interruptAudio(chat: ChatRef | ConferenceHandle): Promise<{ droppedFrames: number; droppedBytes: number }>;
}

export interface GeminiLiveWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

export interface GeminiLiveOptions {
  /** Gemini API key (never logged). Ignored when a custom `endpointUrl` already carries auth. */
  apiKey?: string;
  /** Gemini Live model name (default 'models/gemini-2.5-flash-native-audio-preview-12-2025' or 'models/gemini-2.0-flash-live-001'). */
  model?: string;
  /** Optional system instruction guiding the Voice AI persona. */
  systemInstruction?: string;
  /** Prebuilt Gemini voice name (e.g. 'Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir'). */
  voiceName?: string;
  /** Response modalities requested from Gemini Live (default ['AUDIO']). */
  responseModalities?: Array<'AUDIO' | 'TEXT'>;
  /** Call capture sample rate configured on the Telegram call (default 48000). */
  callSampleRate?: number;
  /** Call capture channel count configured on the Telegram call (default 1). */
  callChannels?: 1 | 2;
  /** Gemini input audio sample rate (default 16000). */
  geminiInputSampleRate?: number;
  /** Gemini output audio sample rate (default 24000). */
  geminiOutputSampleRate?: number;
  /** Forward incoming Telegram video frames to Gemini Live at most every N ms (0/undefined disables video forwarding). */
  videoFrameIntervalMs?: number;
  /** Enable real-time transcription of incoming Telegram user speech (`onInputTranscription`). */
  enableInputTranscription?: boolean;
  /** Enable real-time transcription of Gemini's spoken audio (`onOutputTranscription`). */
  enableOutputTranscription?: boolean;
  /** Pacing interval in ms for 10ms outbound audio frames (default 10; set 0 in unit tests). */
  paceIntervalMs?: number;
  /** Custom WebSocket endpoint URL (defaults to Google Generative Language v1beta BidiGenerateContent). */
  endpointUrl?: string;
  /** Optional custom WebSocket factory (defaults to global `WebSocket`). */
  createWebSocket?: (url: string) => GeminiLiveWebSocketLike;
  onSetupComplete?: () => void;
  onAudioOutput?: (pcm24k: Buffer) => void;
  onTextOutput?: (text: string) => void;
  onThoughtOutput?: (thought: string) => void;
  onInputTranscription?: (text: string) => void;
  onOutputTranscription?: (text: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_MODEL = 'models/gemini-2.5-flash-native-audio-latest';
const DEFAULT_BASE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export class GeminiLiveSession {
  private ws: GeminiLiveWebSocketLike | null = null;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeVideo: (() => void) | null = null;
  private closed = false;
  private setupDone = false;
  private lastVideoSentAt = 0;

  constructor(
    private readonly client: GeminiLiveCallPort,
    private readonly chat: ChatRef | ConferenceHandle,
    private readonly options: GeminiLiveOptions,
  ) {}

  get isReady(): boolean {
    return this.setupDone && !this.closed;
  }

  /** Connect to Gemini Live WebSocket, send initial setup, and wire Telegram audio/video streams. */
  async start(): Promise<this> {
    if (this.ws) {return this;}
    const url = this.buildUrl();
    const factory = this.options.createWebSocket ?? ((u: string) => new (globalThis as any).WebSocket(u));
    const ws = factory(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        } else {
          this.options.onError?.(err);
        }
      };

      ws.addEventListener('open', () => {
        try {
          ws.send(JSON.stringify(this.buildSetupPayload()));
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.addEventListener('message', (event: any) => {
        void this.handleRawMessage(event?.data, () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        }).catch((err) => fail(err instanceof Error ? err : new Error(String(err))));
      });

      ws.addEventListener('error', (event: any) => {
        const msg = event?.error?.message ?? event?.message ?? 'Gemini Live WebSocket error';
        fail(new Error(msg));
      });

      ws.addEventListener('close', (event: any) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Gemini Live WebSocket closed before setupComplete (code=${event?.code ?? 'unknown'})`));
        }
      });
    });

    const callRate = this.options.callSampleRate ?? 48000;
    const callCh = this.options.callChannels ?? 1;
    const inRate = this.options.geminiInputSampleRate ?? 16000;

    this.unsubscribeAudio = await this.client.onAudioFrame(
      this.chat,
      (frame) => {
        if (!this.isReady) {return;}
        this.sendAudio(frame.pcm, inRate);
      },
      {
        sampleRate: callRate,
        channels: callCh,
        targetSampleRate: inRate,
        targetChannels: 1,
      },
    );

    if (this.options.videoFrameIntervalMs && this.options.videoFrameIntervalMs > 0 && this.client.onVideoFrame) {
      const interval = this.options.videoFrameIntervalMs;
      this.unsubscribeVideo = await this.client.onVideoFrame(this.chat, (frame) => {
        if (!this.isReady) {return;}
        const now = Date.now();
        if (now - this.lastVideoSentAt < interval) {return;}
        this.lastVideoSentAt = now;
        try {
          const bmp = i420ToBmp(frame.i420, frame.width, frame.height);
          this.sendMediaChunk(bmp, 'image/bmp');
        } catch (err) {
          this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }

    return this;
  }

  /** Send a text turn into the live Gemini session. */
  sendText(text: string, endOfTurn = true): void {
    if (!this.ws || this.closed) {throw new Error('GeminiLiveSession is not connected');}
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: endOfTurn,
      },
    }));
  }

  /** Stream a 16 kHz mono s16le PCM chunk directly to Gemini Live. */
  sendAudio(pcm: Uint8Array, sampleRate = this.options.geminiInputSampleRate ?? 16000): void {
    if (!this.ws || this.closed) {return;}
    const b64 = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: `audio/pcm;rate=${sampleRate}`,
          data: b64,
        },
      },
    }));
  }

  /** Stream an image/video frame (e.g. JPEG/PNG/BMP) to Gemini Live. */
  sendMediaChunk(data: Uint8Array, mimeType: string): void {
    if (!this.ws || this.closed) {return;}
    const b64 = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{ mimeType, data: b64 }],
      },
    }));
  }

  /** Disconnect from Gemini Live and detach Telegram frame listeners. */
  async close(): Promise<void> {
    if (this.closed) {return;}
    this.closed = true;
    this.unsubscribeAudio?.();
    this.unsubscribeAudio = null;
    this.unsubscribeVideo?.();
    this.unsubscribeVideo = null;
    await this.client.interruptAudio(this.chat).catch(() => {});
    try {
      this.ws?.close(1000, 'closed');
    } catch {
      /* ignore close errors */
    }
    this.ws = null;
  }

  private buildUrl(): string {
    if (this.options.endpointUrl) {
      if (this.options.apiKey && !this.options.endpointUrl.includes('key=')) {
        const sep = this.options.endpointUrl.includes('?') ? '&' : '?';
        return `${this.options.endpointUrl}${sep}key=${encodeURIComponent(this.options.apiKey)}`;
      }
      return this.options.endpointUrl;
    }
    if (!this.options.apiKey) {
      throw new Error('GeminiLiveSession requires an apiKey or custom endpointUrl');
    }
    return `${DEFAULT_BASE_URL}?key=${encodeURIComponent(this.options.apiKey)}`;
  }

  private buildSetupPayload(): Record<string, unknown> {
    const model = this.options.model ?? DEFAULT_MODEL;
    const normalizedModel = model.startsWith('models/') ? model : `models/${model}`;
    const generationConfig: Record<string, unknown> = {
      responseModalities: this.options.responseModalities ?? ['AUDIO'],
    };
    if (this.options.voiceName) {
      generationConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.options.voiceName,
          },
        },
      };
    }
    const setup: Record<string, unknown> = {
      model: normalizedModel,
      generationConfig,
    };
    if (this.options.systemInstruction) {
      setup.systemInstruction = {
        parts: [{ text: this.options.systemInstruction }],
      };
    }
    if (this.options.enableInputTranscription) {
      setup.inputAudioTranscription = {};
    }
    if (this.options.enableOutputTranscription) {
      setup.outputAudioTranscription = {};
    }
    return { setup };
  }

  private async handleRawMessage(rawData: unknown, onSetup: () => void): Promise<void> {
    let text: string;
    if (typeof rawData === 'string') {
      text = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      text = Buffer.from(rawData).toString('utf8');
    } else if (ArrayBuffer.isView(rawData)) {
      text = Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
    } else if (rawData && typeof (rawData as Blob).text === 'function') {
      text = await (rawData as Blob).text();
    } else {
      text = String(rawData ?? '');
    }
    if (!text) {return;}
    const msg = JSON.parse(text) as Record<string, any>;

    if (msg.setupComplete !== undefined) {
      this.setupDone = true;
      onSetup();
      this.options.onSetupComplete?.();
      return;
    }

    const sc = msg.serverContent;
    if (!sc) {return;}

    if (sc.interrupted === true) {
      await this.client.interruptAudio(this.chat);
      this.options.onInterrupted?.();
    }

    if (sc.inputTranscription?.text) {
      this.options.onInputTranscription?.(String(sc.inputTranscription.text));
    }
    if (sc.outputTranscription?.text) {
      this.options.onOutputTranscription?.(String(sc.outputTranscription.text));
    }

    const parts = sc.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part?.text === 'string' && part.text.length > 0) {
          if (part.thought === true) {
            this.options.onThoughtOutput?.(part.text);
          } else {
            this.options.onTextOutput?.(part.text);
          }
        }
        const inline = part?.inlineData;
        if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
          const mime = String(inline.mimeType ?? 'audio/pcm;rate=24000');
          if (mime.startsWith('audio/pcm')) {
            const rateMatch = /rate=(\d+)/i.exec(mime);
            const outRate = rateMatch ? Number(rateMatch[1]) : (this.options.geminiOutputSampleRate ?? 24000);
            const pcmBuf = Buffer.from(inline.data, 'base64');
            if (pcmBuf.byteLength > 0) {
              this.options.onAudioOutput?.(pcmBuf);
              await this.client.pushAudioFrame(this.chat, pcmBuf, {
                inputSampleRate: outRate,
                inputChannels: 1,
                sampleRate: this.options.callSampleRate ?? 48000,
                channels: this.options.callChannels ?? 1,
                paced: true,
                paceIntervalMs: this.options.paceIntervalMs ?? 10,
              });
            }
          }
        }
      }
    }

    if (sc.turnComplete === true) {
      this.options.onTurnComplete?.();
    }
  }
}
