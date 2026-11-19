# Guide

## The join flow

Every join follows the same ordered sequence (do not reorder it):

1. `channels.getFullChannel` (or `messages.getFullChat` for basic groups) → `fullChat.call` (InputGroupCall).
2. `ntgcalls.createCall(chatId)` → native join params JSON (contains the **ssrc**).
3. `ntgcalls.setStreamSources(chatId, CAPTURE, …)` — set media **before** the MTProto join so it flows immediately.
4. `phone.joinGroupCall(params)` → wait for `UpdateGroupCallConnection`.
5. `ntgcalls.connect(chatId, connParams)` → media starts.

The same join-params string is sent in `JoinGroupCall`, and its ssrc is reused for
`LeaveGroupCall`. The library handles all of this; you only call `join()`.

## Sources

`AudioSource` is one of:

```ts
{ kind: 'file'; path: string }                 // any ffmpeg-readable file
{ kind: 'url'; url: string; audioUrl?: string } // direct media URL; audioUrl for split video/audio
{ kind: 'shell'; command: string }              // command piping s16le 48kHz stereo PCM to stdout
```

- **file / url** are decoded by ffmpeg to PCM (`-f s16le -ac 2 -ar 48000 pipe:1`).
- **shell** gives you full control; the command must output raw PCM at 48 kHz stereo.
- `joinYouTube()` resolves a page URL to a direct media URL via yt-dlp, then joins.
  With video it requests separate `bestvideo + bestaudio` streams (`audioUrl` carries the audio).

## Video

Pass `video` to `join()` to stream video from the same file/URL:

```js
await tg.join(chatId, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 854, height: 480, fps: 30 },
});
```

- Dimensions are probed and kept **even** (YUV420p requirement); scaling is proportional.
- `video: false` disables video; omitting it streams audio only.
- Start at 854×480@30 on small VPS; raise to 720p60 / 1080p60 if the host keeps up
  (verified stable on a 4-vCPU cloud VM).
- For YouTube video, prefer `vp9`/`avc1` over AV1 (AV1 is too heavy to decode in real time).

### Camera vs presentation

- `video` alone → **camera** channel.
- `presentation: true` (or `startPresentation()`) → **screen-share** channel.
- Camera and screen **cannot be active at the same time** in one call; starting a
  presentation replaces the camera channel.

```js
await tg.startPresentation(chatId, { kind: 'file', path: './slides.mp4' }, { width: 1280, height: 720 });
await tg.stopPresentation(chatId); // call stays, camera can resume
```

> `setStreamSources` **replaces** all devices: any device omitted from a description
> is dropped. The library rebuilds the video channel on `setSource()` so video is not
> silently lost when you swap audio.

## Idle presence

`joinIdle()` joins with no media — useful for a bot that waits in a voice chat:

```js
await tg.joinIdle(chatId, { autoLeave: false });
```

- On UDP-capable hosts this is stable indefinitely (verified: **40+ minutes**, no disconnect).
- On UDP-blocked hosts, a regular RTC join gets ICE-timeout-kicked after ~25s. With
  `allowCreate: true`, `joinIdle()` creates a missing call in **RTMP-stream** mode and
  joins muted; an existing call is not converted.

## Queue / swapping tracks

Built-in playlist (v0.4.0): queue tracks and they advance automatically when each
one ends — no manual `streamEnd` wiring needed.

```js
const tg = new TgCallsClient({ client });
await tg.play(chatId, first);          // join + start now
await tg.enqueue(chatId, second);      // play after first
await tg.then(chatId, third);          // alias of enqueue
await tg.playOnHold(chatId, holdLoop); // looped while the queue is empty

// later, from a command handler:
await tg.skip(chatId);                 // jump to the next track
tg.getCurrent(chatId);                 // the playing source
tg.getQueue(chatId);                   // queued sources (copy)
await tg.clearQueue(chatId);           // empty queue + hold
```

The call stays open while tracks are queued; it only auto-leaves when the queue
**and** hold are empty. `skip()` with nothing queued pauses playback (call stays).

For manual control, `setSource()` swaps the audio without leaving and keeps the
video channel intact:

```js
tg.on('streamEnd', async ({ chatId }) => {
  const next = queue.shift();
  if (next) await tg.setSource(chatId, next);
});
await tg.join(chatId, first, { autoLeave: false });
```

With `autoLeave: true` and **no** `streamEnd` handler (and no playlist), the call
auto-leaves when the stream ends.

## Events

| Event | Payload | Notes |
|---|---|---|
| `streamEnd` | `{ chatId, source, willAutoLeave }` | fires once per playback; with video, waits for both audio and video to end |
| `connectionChange` | `(chatId, state)` | `state` is a numeric `ConnectionState` (see below) |
| `update` | raw TL update | pass-through of group-call-related updates |

`ConnectionState` (numeric enum from ntgcalls):

| Value | Meaning |
|---|---|
| 1 | CONNECTING |
| 2 | CONNECTED |
| 4 | FAILED |
| 8 | TIMEOUT |
| 16 | CLOSED |

A handler that throws/rejects is logged (via the `logger` option) and never crashes
the process. Registering a `streamEnd` handler suppresses auto-leave.

## Adapters / client detection

`TgCallsClient` auto-detects the client:

- **mtcute** — has `.call` + `.onRawUpdate.add` → `MtcuteAdapter`.
- **GramJS / teleproto** — has `.invoke` → `GramjsAdapter`.
- **custom** — pass an object implementing `MTProtoAdapter` (`isAdapter: true`).

```js
import { GramjsAdapter, MtcuteAdapter, createAdapter } from 'tgcalls-js';
const adapter = createAdapter(client, { Api }); // or new GramjsAdapter(client, { Api })
const tg = new TgCallsClient({ client: adapter });
```

When mixing `telegram` and `teleproto` in one process, pass the matching `Api`
namespace per client to avoid ambiguous TL auto-detection. mtcute needs no `Api`.

> mtcute TL `Long` objects (low/high) are preserved **by reference** — do not convert
> them to JS bigint. GramJS/teleproto use plain bigint.

## Lifecycle & cleanup

- `leave(chat)` stops the native call and sends `LeaveGroupCall` (best-effort both).
- A failed `join()` cleans up the native call and leaves any zombie participant.
- On native `CLOSED`/`FAILED`, the library leaves via MTProto **before** notifying
  listeners, so you can safely destroy the MTProto client from the callback.
- `await tg.dispose()` before disposing the MTProto client; avoid `process.exit()`
  immediately after native use (WebRTC teardown can abort).

## Typed errors

```js
import { AlreadyInCallError, NoVoiceChatError, TgCallsError } from 'tgcalls-js';
try {
  await tg.join(chatId, src);
} catch (e) {
  if (e instanceof AlreadyInCallError) console.log('busy in', e.chatId);
  else if (e instanceof NoVoiceChatError) console.log('start a voice chat first');
}
```

All library errors extend `TgCallsError` (which extends `Error`). See the
[API reference](api.md#errors).
