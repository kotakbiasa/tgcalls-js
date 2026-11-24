/**
 * Example: Per-Participant Segmented Folder Recording (WAV + H.264/AAC MP4 + manifest.json).
 *
 * Joins a group voice chat in idle mode (`joinIdle`) and records each speaker's
 * microphone (`.wav`) and camera/screen share (`.mp4`) into separate files
 * with automatic segment rotation and `ffprobe` validation.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT=@mygroup OUT_DIR=./recordings npx tsx examples/folder-recording.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT = process.env.CHAT ?? '';
const OUT_DIR = process.env.OUT_DIR ?? './recordings/session-1';

if (!API_ID || !API_HASH || !SESSION || !CHAT) {
  console.error('Set API_ID, API_HASH, SESSION, and CHAT env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

tg.on('recordingStopped', (_chatId, info) => {
  console.log(`[segment #${info.segment}] ${info.device} -> ${info.status}: ${info.path}`, info.peer ?? '');
});

tg.on('recordingError', (_chatId, err) => {
  console.error('[recording error]:', err.message);
});

await tg.joinIdle(CHAT);
await tg.startRecording(CHAT, {
  dir: OUT_DIR,
  video: true,
  sampleRate: 48000,
  channels: 1,
});
console.log(`Recording per-participant audio & video in ${CHAT} -> ${OUT_DIR}. Press Ctrl+C to finalize.`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    const dir = await tg.stopRecording(CHAT);
    console.log('Finalized folder recording in:', dir);
    await tg.dispose();
    await client.disconnect();
    process.exit(0);
  });
}

setInterval(() => {}, 60_000);
