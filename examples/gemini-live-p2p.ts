/**
 * Example: 1-on-1 Telegram P2P Voice AI Agent powered by Google Gemini Live.
 *
 * Answers incoming 1-on-1 calls (or dials CALL_USER if set), connects two-way
 * audio directly to Gemini Live (`models/gemini-2.5-flash-native-audio-latest`)
 * with zero ffmpeg requirement, logs live speech transcriptions, and supports
 * natural barge-in interruption.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' GEMINI_API_KEY=… npx tsx examples/gemini-live-p2p.ts
 *   # Optional: dial a user immediately instead of waiting for an incoming call:
 *   CALL_USER=@username API_ID=… API_HASH=… SESSION='…' GEMINI_API_KEY=… npx tsx examples/gemini-live-p2p.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient, type GeminiLiveSession } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const CALL_USER = process.env.CALL_USER;

if (!API_ID || !API_HASH || !SESSION || !GEMINI_API_KEY) {
  console.error('Set API_ID, API_HASH, SESSION, and GEMINI_API_KEY env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
  connectionRetries: 5,
});
await client.connect();

const tg = new TgCallsClient({ client });
const sessions = new Map<bigint, GeminiLiveSession>();

tg.on('connectionChange', async (peerId, state) => {
  if (state === 2 && !sessions.has(peerId)) {
    const emojis = await tg.getEmojiFingerprint(peerId);
    console.log(`[P2P] Connected to ${peerId} (E2E emojis: ${emojis ?? 'pending'})`);

    const gemini = await tg.connectGeminiLive(peerId, {
      apiKey: GEMINI_API_KEY,
      voiceName: 'Aoede',
      enableInputTranscription: true,
      enableOutputTranscription: true,
      systemInstruction:
        'Kamu adalah asisten suara AI tgcalls-js berbahasa Indonesia di telepon Telegram. Jawab ramah, santai, dan singkat (1-2 kalimat).',
      onInputTranscription: (text) => console.log(`[Caller ${peerId}]: ${text}`),
      onOutputTranscription: (text) => console.log(`[Gemini]: ${text}`),
      onInterrupted: () => console.log(`[Gemini]: Barge-in interrupted by ${peerId}`),
      onError: (err) => console.error('[Gemini error]:', err.message),
    });

    sessions.set(peerId, gemini);
    gemini.sendText('Halo! Sapa penelepon dengan ramah dalam bahasa Indonesia.');
  } else if (state === 4 || state === 16) {
    const gemini = sessions.get(peerId);
    if (gemini) {
      sessions.delete(peerId);
      await gemini.close();
      console.log(`[P2P] Call ended with ${peerId}`);
    }
  }
});

await tg.listenCalls({
  source: { kind: 'external', sampleRate: 48000, channels: 1 },
  autoAccept: true,
});

if (CALL_USER) {
  if (await tg.canRequestCall(CALL_USER)) {
    const callId = await tg.callUser(CALL_USER);
    console.log(`Dialing ${CALL_USER} (callId=${callId})...`);
  } else {
    console.error(`Cannot call ${CALL_USER}:`, await tg.getCallDenialReason(CALL_USER));
  }
} else {
  console.log('Waiting for incoming P2P calls... Call this account from Telegram!');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    for (const s of sessions.values()) {await s.close().catch(() => {});}
    await tg.dispose();
    await client.disconnect();
    process.exit(0);
  });
}

setInterval(() => {}, 60_000);
