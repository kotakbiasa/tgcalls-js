/**
 * Example: join a voice chat with a local file using an mtcute client.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT_ID=-100… FILE=./song.mp3 \
 *     npx tsx examples/file-mtcute.ts
 */

import { TelegramClient } from '@mtcute/node';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT_ID = process.env.CHAT_ID ?? '';
const FILE = process.env.FILE ?? './song.mp3';

if (!API_ID || !API_HASH || !SESSION || !CHAT_ID) {
  console.error('Set API_ID, API_HASH, SESSION, CHAT_ID (and FILE) env vars');
  process.exit(1);
}

const client = new TelegramClient({
  apiId: API_ID,
  apiHash: API_HASH,
  storage: 'account.session',
});

await client.start();
if (SESSION) {
  await client.importSession(SESSION).catch(() => {});
}

// tgcalls-js automatically detects the mtcute client instance!
const tg = new TgCallsClient({ client });

tg.on('connectionChange', (chatId, state) => {
  console.log(`[${chatId}] connection: ${state}`);
});

tg.on('streamEnd', ({ chatId }) => {
  console.log(`[${chatId}] stream ended — leaving`);
});

await tg.join(CHAT_ID, { kind: 'file', path: FILE });
console.log(`Streaming ${FILE} into ${CHAT_ID}. Ctrl+C to leave.`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    try {
      await tg.leave(CHAT_ID);
    } finally {
      process.exit(0);
    }
  });
}

// Keep alive.
setInterval(() => {}, 60_000);
