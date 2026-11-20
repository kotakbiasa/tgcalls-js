# Troubleshooting

## `Error: ntgcalls: no prebuilt binary for linux-x64`

Some npm versions (seen with **npm 12 installing from a git URL**) skip `ntgcalls`'
platform-specific optional dependency. Install it yourself, matching the `ntgcalls`
version in `package.json` (currently `3.0.7`):

```bash
npm install @ntgcalls/linux-x64@3.0.7 --no-save
```

Use the matching package on other platforms:

| Platform | Package |
|---|---|
| Linux x64 | `@ntgcalls/linux-x64` |
| Linux arm64 | `@ntgcalls/linux-arm64` |
| macOS arm64 | `@ntgcalls/darwin-arm64` |
| Windows x64 | `@ntgcalls/win32-x64` |

Installing from the npm registry (once published) resolves optional dependencies
normally and avoids this entirely. npm 10 (e.g. on many cloud images) installs the
binary correctly from a git URL.

## `default_launcher: No such file or directory (vfork_launcher)`

This confusing error from the native core almost always means **ffmpeg is not on
PATH**. ntgcalls spawns ffmpeg per source; without it you get a boost process-launch
ENOENT instead of a clear "ffmpeg not found".

```bash
sudo apt-get install ffmpeg     # Debian/Ubuntu
brew install ffmpeg             # macOS
ffmpeg -version                 # verify it resolves
```

The test suite now fails fast with a clear message if ffmpeg is missing.

## Join fails / kicked after ~25 seconds

On **UDP-blocked hosts** (some VPS/firewalls), a regular RTC join gets an ICE timeout
and Telegram kicks the participant after ~25s. Options:

- Use `joinIdle(chat, { allowCreate: true })` — creates the call in **RTMP-stream**
  mode and joins muted (no local media path needed). Existing calls are not converted.
- Presentation/screen share requires RTC and is **unavailable** in RTMP/STREAM mode.
- On UDP-capable hosts (verified on InstaBox/AWS), normal RTC joins and idle presence
  are stable indefinitely (40+ minutes tested).

Check outbound UDP:

```bash
timeout 5 bash -c 'exec 3<>/dev/udp/stun.l.google.com/19302' && echo "UDP OK"
```

## `NoVoiceChatError`

There is no active voice chat in the target chat. Start one manually, or pass
`allowCreate: true` (the account needs admin rights to create a call).

## `AlreadyInCallError`

You called `join`/`joinIdle` while already in a call (or mid-join) in that chat.
`leave(chat)` first. The error carries `chatId`.

## YouTube: "Sign in to confirm you're not a bot"

YouTube blocks **datacenter IPs** (cloud VMs) across all player clients. Fixes:

- **Cookies** from a logged-in browser (Netscape format):
  ```bash
  yt-dlp --cookies cookies.txt --js-runtimes node -f "bestvideo[vcodec~='^(vp09|avc1)']+bestaudio[ext=m4a]/best" URL
  ```
  Treat cookies as account credentials: store `chmod 600`, never log them, delete/rotate after use.
- A recent **yt-dlp** and a JS runtime (`--js-runtimes node` or deno) — extraction
  without a JS runtime is deprecated and may miss formats.
- Prefer `vp9`/`avc1` over AV1 for video (AV1 is too heavy to decode in real time on small VPS).
- Fallback: download from a residential IP, then transfer the file to the cloud host.

## Login / 2FA (teleproto)

- `client.start()` probes `updates.getState()`, which throws `AUTH_KEY_UNREGISTERED`
  on an empty session. For QR login use `client.signInUserWithQrCode(...)` directly;
  the QR token is a Buffer — encode `tg://login?token=<base64url>` for the QR image.
- For phone login, provide `phoneNumber`, `phoneCode`, and `password` (2FA) callbacks.
- Keep the resulting StringSession secret; reuse it with `new StringSession(str)` +
  `client.connect()`.

## Process aborts on exit

`process.exit()` immediately after native use can abort during WebRTC teardown
(cosmetic). `await tg.dispose()` and let queued callbacks drain before exiting;
long-running bots are unaffected.

## Mixing `telegram` and `teleproto`

Pass the matching `Api` namespace to each `TgCallsClient` to avoid ambiguous TL
auto-detection. mtcute uses its own TL schema and needs no `Api`.

## Incoming P2P call never connects (ICE `TIMEOUT`)

Four distinct failures can each stop a 1-on-1 call; the wrapper fixes them, but
they matter if you call `ntgcalls` directly or debug a fork:

| Symptom | Cause | Fix |
|---|---|---|
| `An array was expected` from `initExchange` | `bytes::binary` is read as `Napi::Array` — `Buffer`/`Uint8Array` are rejected | pass `Array.from(buf)` |
| `phone.acceptCall` → `CALL_PEER_INVALID` | TL `long` is a `big-integer` object; `BigInt(obj)` goes through `Number` and loses precision | convert via `toString()` |
| `connectP2p` → `incomplete JSON [boost.json:3]` | `customParameters: ''` is a *present* optional; `json::parse("")` throws | pass `'{}'` |
| `Failed to parse received SCTP packet`, `Sorting 0 available connections`, then `TIMEOUT` | versions list includes `12.0.0`/`13.0.0` → ntgcalls routes signaling over an SCTP data channel, but Telegram sends it via MTProto | restrict to `8.0.0`/`9.0.0` |

Debug with `setLogLevel(LogLevel.DEBUG)` (from `ntgcalls`) and
`listenCalls({ debug: true })`. A healthy call logs, in order:
`Using signaling V2 Legacy` → `Decrypting packets` (inbound signaling) →
`new remote candidate` → `state= 2` (`CONNECTED`) →
`First audio RTP packet sent to pacer`.

## mtcute: no `INCOMING`, calls do nothing

Two mtcute-specific traps. Both are silent — no error is thrown.

1. **`client.connect()` does not start the updates loop.** `onRawUpdate` is
   emitted from that loop, so with `connect()` only outgoing RPCs work; no
   `updatePhoneCall` ever reaches the library. Use `client.start()` (it connects
   *and* launches the loop). Symptom: the call rings on the phone, the listener
   logs nothing at all.
2. **mtcute objects use `_`, GramJS/teleproto use `className`.** Fixed in the
   library (`kind` is normalised from either), but any custom adapter must do the
   same: `phoneCallRequested` vs `PhoneCallRequested`.

Verify the loop independently of calls:

```ts
client.onRawUpdate.add((u) => console.log('RAW', (u?.update ?? u)?._));
await client.sendText('me', 'self-test'); // must log RAW updateMessageID
```

Session note: a GramJS/teleproto string session can be reused with mtcute via
`@mtcute/convert` (`convertFromGramjsSession`) + `client.importSession()`.

## Outgoing call: ICE `TIMEOUT` (state 8) right after the peer answers

`phone.confirmCall` can return a `PhoneCall` whose `connections` list is empty —
no STUN/TURN server, no peer tag. ICE then has host candidates only and fails its
short receiving timeout (2.5 s) if the callee's answer is still in flight. The
library retries through `phone.getCall` when the list is empty.

- teleproto/GramJS: `phone.getCall` exists, servers are recovered.
- **mtcute 0.32**: its TL schema has `phone.getCallConfig` but not `phone.getCall`,
  so the retry logs `getCall failed: Unknown object phone.getCall` and the call
  still runs with `servers=0`. It works when the peer answers quickly (host/IPv6
  candidates suffice) and times out when it does not — retry the call on `state 8`.
