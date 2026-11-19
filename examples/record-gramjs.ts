/**
 * Example: record incoming call audio with a teleproto (GramJS fork) client.
 *
 * Joins and plays a file (so the call has media), then records what OTHER
 * participants say to RECORD_PATH (container from the extension: .wav/.mp3/.opus).
 * Ctrl+C stops the recording (finalizing the file) and leaves.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT_ID=-100… FILE=./song.mp3 RECORD_PATH=./call.wav \
 *     npx tsx examples/record-gramjs.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT_ID = Number(process.env.CHAT_ID ?? 0);
const FILE = process.env.FILE ?? './song.mp3';
const RECORD_PATH = process.env.RECORD_PATH ?? './call.wav';

if (!API_ID || !API_HASH || !SESSION || !CHAT_ID) {
  console.error('Set API_ID, API_HASH, SESSION, CHAT_ID (and FILE, RECORD_PATH) env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

tg.on('connectionChange', (chatId, state) => {
  console.log(`[${chatId}] connection: ${state}`);
});

await tg.join(CHAT_ID, { kind: 'file', path: FILE }, { autoLeave: false });
const info = await tg.startRecording(CHAT_ID, RECORD_PATH);
console.log(`Recording incoming audio to ${info.path} (${info.sampleRate}Hz, ${info.channels}ch). Ctrl+C to stop.`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    try {
      const path = await tg.stopRecording(CHAT_ID);
      console.log('Recording saved to', path);
      await tg.dispose();
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  });
}

// Keep alive.
setInterval(() => {}, 60_000);
