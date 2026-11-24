/**
 * Example: RTMP Livestream Publisher (`getStreamRtmpUrl` + `joinRtmp`).
 *
 * Fetches the channel/group's RTMP ingest URL & stream key (without revoking
 * the existing key) and publishes an H.264/AAC video stream with automatic
 * exponential-backoff reconnect and a hold loop.
 *
 * Usage:
 *   API_ID=… API_HASH=… SESSION='…' CHAT=@mychannel VIDEO=./stream.mp4 npx tsx examples/rtmp-livestream.ts
 */

import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient, VideoQuality } from '../src/index.js';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH ?? '';
const SESSION = process.env.SESSION ?? '';
const CHAT = process.env.CHAT ?? '';
const VIDEO = process.env.VIDEO ?? './stream.mp4';

if (!API_ID || !API_HASH || !SESSION || !CHAT) {
  console.error('Set API_ID, API_HASH, SESSION, and CHAT (and VIDEO) env vars');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

// Fetch RTMP URL + key (never log endpoint.key!)
const endpoint = await tg.getStreamRtmpUrl(CHAT);

const publisher = await tg.joinRtmp(CHAT, endpoint.url, endpoint.key, {
  allowCreate: true,
  reconnect: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 10_000 },
  onStateChange: (state) => console.log('[RTMP state]:', state),
  onError: (err) => console.error('[RTMP error]:', err.message),
});

await publisher.play({ kind: 'file', path: VIDEO }, VideoQuality.HD_720p);
publisher.hold({ kind: 'file', path: VIDEO }, VideoQuality.HD_720p);
console.log(`Publishing ${VIDEO} to ${CHAT}. Press Ctrl+C to stop.`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await publisher.close();
    await tg.dispose();
    await client.disconnect();
    process.exit(0);
  });
}

setInterval(() => {}, 60_000);
