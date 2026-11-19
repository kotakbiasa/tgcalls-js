/**
 * Example: answer incoming 1-on-1 voice calls and stream a file (teleproto client).
 *
 * Run this, then call the logged-in account from another Telegram account.
 * The call is answered automatically and FILE is streamed into it. Ctrl+C stops.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' FILE=./song.mp3 npx tsx examples/call-gramjs.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const FILE = process.env.FILE ?? './song.mp3';

if (!API_ID || !API_HASH || !SESSION) {
  console.error('Set API_ID, API_HASH, SESSION (and FILE) env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

await tg.listenCalls({
  source: { kind: 'file', path: FILE },
  autoAccept: true,
  onIncoming: ({ userId }) => {
    console.log(`Incoming call from user ${userId} — accepting`);
    return true;
  },
});
console.log('Listening for incoming calls. Call this account from another Telegram account. Ctrl+C to stop.');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    try {
      await tg.stopListeningCalls();
      await tg.dispose();
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  });
}

setInterval(() => {}, 60_000);
