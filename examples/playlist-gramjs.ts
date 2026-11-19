/**
 * Example: built-in playlist/queue with a teleproto (GramJS fork) client.
 *
 * Plays the first file now, queues the rest, and loops a hold track while the
 * queue is empty. Tracks advance automatically when each one ends.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT_ID=-100… FILES='./a.mp3,./b.mp3,./c.mp3' \
 *     HOLD=./hold.mp3 npx tsx examples/playlist-gramjs.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT_ID = Number(process.env.CHAT_ID ?? 0);
const FILES = (process.env.FILES ?? './song.mp3').split(',').map((s) => s.trim()).filter(Boolean);
const HOLD = process.env.HOLD ?? '';

if (!API_ID || !API_HASH || !SESSION || !CHAT_ID || FILES.length === 0) {
  console.error('Set API_ID, API_HASH, SESSION, CHAT_ID, FILES (comma-separated) env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

tg.on('connectionChange', (chatId, state) => {
  console.log(`[${chatId}] connection: ${state}`);
});
tg.on('streamEnd', ({ chatId, willAutoLeave }) => {
  console.log(`[${chatId}] track ended (autoLeave=${willAutoLeave}); now:`, tg.getCurrent(chatId));
});

const file = (path: string) => ({ kind: 'file' as const, path });

// Join + start the first track, queue the rest.
await tg.play(CHAT_ID, file(FILES[0]));
for (const path of FILES.slice(1)) {
  await tg.enqueue(CHAT_ID, file(path));
}
if (HOLD) {
  await tg.playOnHold(CHAT_ID, file(HOLD));
}

console.log(`Playing ${FILES[0]} in ${CHAT_ID}; queued ${FILES.length - 1} more. Ctrl+C to leave.`);
console.log('Queue:', tg.getQueue(CHAT_ID));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    try {
      await tg.dispose();
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  });
}

// Keep alive.
setInterval(() => {}, 60_000);
