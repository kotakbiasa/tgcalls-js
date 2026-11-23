# Getting started

## Requirements

| Need | Why |
|---|---|
| Node.js ≥ 18 | runtime (tested on 20 / 22) |
| `ffmpeg` on PATH | file/URL container decode, mixed recording, muxing and RTMP encoding |
| `ffprobe` on PATH | video metadata and folder recording validation |
| `yt-dlp` on PATH | only for `joinYouTube()` / `resolveYouTube()` |
| A **user** account session | Telegram does not allow bots to join voice chats |
| `api_id` / `api_hash` | from <https://my.telegram.org> |

Install ffmpeg:

```bash
sudo apt-get install ffmpeg        # Debian/Ubuntu
brew install ffmpeg yt-dlp         # macOS
```

## Install the package

```bash
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.9.0
```

npm 12+ blocks git dependencies by default (`EALLOWGIT`); `--allow-git=all`
opts in for this install.

`ntgcalls` provides prebuilt native binaries (Linux x64/arm64, macOS arm64,
Windows x64). If your npm version skips the platform binary when installing from
a git URL, install it manually — see [Troubleshooting](troubleshooting.md).

## Get a user session

You need a logged-in **user** client. Two common paths:

### teleproto / GramJS (StringSession)

```js
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {});
await client.start({
  phoneNumber: async () => '+62…',
  phoneCode:   async () => /* code from the Telegram app */,
  password:    async () => /* 2FA password if enabled */,
});
const sessionString = client.session.save(); // store this securely, reuse later
```

Reuse it next time with `new StringSession(sessionString)` + `await client.connect()`.

### mtcute

```js
import { TelegramClient } from '@mtcute/node';
const client = new TelegramClient({ apiId: API_ID, apiHash: API_HASH, storage: 'account.session' });
await client.start({ phone: () => '+62…', code: () => /* … */, password: () => /* … */ });
```

> Keep session strings and 2FA passwords secret (e.g. a `chmod 600` file or a
> secrets manager). Never commit them.

## First stream

```js
import { TgCallsClient } from 'tgcalls-js';

const tg = new TgCallsClient({ client });

tg.on('connectionChange', (chatId, state) => console.log('state:', state));
tg.on('streamEnd', ({ chatId }) => console.log('track finished in', chatId));

// chat accepts a marked id (-100…), @username, or t.me link
await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
```

The call auto-leaves when the track ends (`autoLeave` defaults to `true`). To keep
the call open and queue more tracks, set `autoLeave: false` and use `setSource()`
inside `streamEnd`.

## Verify your setup (no credentials)

```bash
npm test     # offline suite: fake MTProto + real ntgcalls core
npm run smoke
```

Next: the [Guide](guide.md) for video, presentation, idle, and adapters, or the
[API reference](api.md).
