/**
 * Live userbot smoke test using teleproto and a local media file.
 *
 * Set API_ID, API_HASH, SESSION, CHAT_ID, and FILE in the environment, then run:
 *   npx tsx examples/file-teleproto.ts
 *
 * SESSION is a teleproto StringSession. The account joins the selected voice
 * chat and streams FILE; the call is left when playback ends or Ctrl+C is hit.
 */

import 'dotenv/config';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from '../src/index.js';

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH ?? '';
const session = process.env.SESSION ?? '';
const chatId = process.env.CHAT_ID ?? '';
const file = process.env.FILE ?? '';
const withVideo = /^(1|true|yes)$/i.test(process.env.VIDEO ?? '');
const withPresentation = /^(1|true|yes)$/i.test(process.env.PRESENTATION ?? '');
const requestedFps = Number(process.env.VIDEO_FPS);
const requestedWidth = Number(process.env.VIDEO_WIDTH);
const requestedHeight = Number(process.env.VIDEO_HEIGHT);
const videoOptions = {
  ...(Number.isInteger(requestedFps) && requestedFps > 0 && requestedFps <= 60
    ? { fps: requestedFps }
    : {}),
  ...(Number.isInteger(requestedWidth) && requestedWidth > 0
    ? { width: requestedWidth }
    : {}),
  ...(Number.isInteger(requestedHeight) && requestedHeight > 0
    ? { height: requestedHeight }
    : {}),
};

if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !session || !chatId || !file) {
  throw new Error('Set API_ID, API_HASH, SESSION, CHAT_ID, and FILE in the environment.');
}

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 3,
});

await client.connect();
const me = await client.getMe();
console.log(`Connected to Telegram as ${me.firstName ?? me.username ?? 'user'}.`);

const tg = new TgCallsClient({ client });
tg.on('connectionChange', (id, state) => {
  console.log(`[${id}] connection: ${state}`);
});

const playbackEnded = new Promise<void>((resolve) => {
  tg.on('streamEnd', ({ chatId: id }) => {
    console.log(`[${id}] playback ended; leaving voice chat.`);
    resolve();
  });
  process.once('SIGINT', resolve);
  process.once('SIGTERM', resolve);
});

let joinedChatId: bigint | undefined;
try {
  const joined = await tg.join(
    chatId,
    { kind: 'file', path: file },
    {
      video: withVideo ? videoOptions : false,
      presentation: withPresentation,
    },
  );
  joinedChatId = joined.chatId;
  const mode = withPresentation ? 'presentation' : withVideo ? 'camera video' : 'audio';
  console.log(`Streaming ${mode} from ${file} into ${chatId}. Press Ctrl+C to stop.`);
  await playbackEnded;
} finally {
  if (joinedChatId !== undefined) await tg.leave(joinedChatId);
  tg.dispose();
  await client.disconnect();
}
