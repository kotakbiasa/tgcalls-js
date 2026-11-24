/**
 * Example: Music Bot with Advanced Queue, Audio Filters, Room Title & Auto-Idle Timeout.
 *
 * Demonstrates `play`, `enqueue`, `playNext`, `shuffleQueue`, `setVolume`,
 * `setSpeed`, `setAudioFilter('bassboost')`, `setLoop`, `setCallTitle`,
 * `joinAs`, and `idleTimeoutMs`.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT=@mygroup FILE1=./a.mp3 FILE2=./b.mp3 npx tsx examples/music-bot-controls.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT = process.env.CHAT ?? '';
const FILE1 = process.env.FILE1 ?? './track1.mp3';
const FILE2 = process.env.FILE2 ?? './track2.mp3';

if (!API_ID || !API_HASH || !SESSION || !CHAT) {
  console.error('Set API_ID, API_HASH, SESSION, and CHAT env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

// Auto-leave if the queue stays empty / idle for 3 minutes
const tg = new TgCallsClient({ client, idleTimeoutMs: 180_000 });

await tg.play(
  CHAT,
  { kind: 'file', path: FILE1 },
  {
    allowCreate: true,
    ...(process.env.JOIN_AS ? { joinAs: process.env.JOIN_AS } : {}),
  },
);

await tg.enqueue(CHAT, { kind: 'file', path: FILE2 });
await tg.playNext(CHAT, { kind: 'file', path: FILE2 }); // insert at front of queue
await tg.shuffleQueue(CHAT);

// Apply live audio filters & playback controls
await tg.setVolume(CHAT, 125);
await tg.setAudioFilter(CHAT, 'bassboost');
await tg.setLoop(CHAT, 'all');

// Update the Telegram Voice Chat title
await tg.setCallTitle(CHAT, `🎵 Now Playing: ${FILE1}`).catch(() => {});
console.log('Controls:', tg.getPlaybackControls(CHAT));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await tg.dispose();
    await client.disconnect();
    process.exit(0);
  });
}

setInterval(() => {}, 60_000);
