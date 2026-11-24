/**
 * Example: Group Voice Chat AI Assistant (Audio + Multimodal Vision) via Gemini Live.
 *
 * Joins a group voice chat with `{ kind: 'external' }` (no ffmpeg needed),
 * updates the voice chat title, streams live participant speech & camera/screen
 * frames to Google Gemini Live, and speaks responses back into the group call.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' GEMINI_API_KEY=… CHAT=@mygroup npx tsx examples/gemini-live-group.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const CHAT = process.env.CHAT ?? '';

if (!API_ID || !API_HASH || !SESSION || !GEMINI_API_KEY || !CHAT) {
  console.error('Set API_ID, API_HASH, SESSION, GEMINI_API_KEY, and CHAT env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

await tg.join(
  CHAT,
  { kind: 'external', sampleRate: 48000, channels: 1 },
  { allowCreate: true, autoLeave: false },
);
await tg.setCallTitle(CHAT, '🤖 Gemini Live AI Voice Chat').catch(() => {});

const gemini = await tg.connectGeminiLive(CHAT, {
  apiKey: GEMINI_API_KEY,
  voiceName: 'Aoede',
  enableInputTranscription: true,
  enableOutputTranscription: true,
  videoFrameIntervalMs: 3000, // send 1 camera/screen frame every 3s for multimodal vision
  systemInstruction:
    'Kamu adalah asisten suara AI di Voice Chat grup Telegram. Jawab pertanyaan anggota grup dengan ringkas dan ramah dalam bahasa Indonesia.',
  onInputTranscription: (text) => console.log('[Member]:', text),
  onOutputTranscription: (text) => console.log('[Gemini]:', text),
  onInterrupted: () => console.log('[Gemini]: Interrupted by speaker (barge-in)'),
});

gemini.sendText('Sapa semua anggota di voice chat grup ini!');
console.log(`Gemini Live active in ${CHAT}. Press Ctrl+C to leave.`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await gemini.close();
    await tg.dispose();
    await client.disconnect();
    process.exit(0);
  });
}

setInterval(() => {}, 60_000);
