# API reference

All exports come from the package root (`import … from 'tgcalls-js'`).

## `TgCallsClient`

### Constructor

```ts
new TgCallsClient(options: TgCallsOptions)
```

#### `TgCallsOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `client` | `MTProtoLike \| MtcuteLike \| MTProtoAdapter` | — | teleproto/GramJS client, mtcute client, or a custom adapter |
| `Api` | `unknown` | auto | TL API namespace; pass per client when mixing `telegram` + `teleproto` |
| `ffmpegPath` | `string` | `"ffmpeg"` | ffmpeg binary |
| `ffprobePath` | `string` | `"ffprobe"` | ffprobe binary |
| `ytDlpPath` | `string` | `"yt-dlp"` | yt-dlp binary |
| `logger` | `{ error(...args: unknown[]): void }` | `console.error` | sink for internal warnings (e.g. a throwing event handler) |

### Properties

| Property | Type | Description |
|---|---|---|
| `ntg` | `NTgCalls` | the underlying native instance (advanced use) |

### Methods

#### Joining

```ts
join(chat: ChatRef, source: AudioSource, options?: JoinOptions): Promise<JoinResult>
joinYouTube(chat: ChatRef, url: string, options?: JoinOptions): Promise<JoinResult>
joinIdle(chat: ChatRef, options?: JoinOptions): Promise<JoinResult>
resolveYouTube(url: string, video?: boolean): Promise<string | null>
```

- `join` — join the voice chat and stream `source`. Throws `AlreadyInCallError` if
  already in a call (or mid-join) in that chat.
- `joinYouTube` — resolve `url` via yt-dlp, then `join`.
- `joinIdle` — join with no media. With `allowCreate: true`, creates a missing call
  in RTMP-stream mode (for UDP-blocked hosts); an existing call is not converted.
  Throws `NoVoiceChatError` if there is no call and `allowCreate` is not set.
- `resolveYouTube` — resolve a page URL to a direct media URL (or `null`).

#### Presentation (screen share)

```ts
startPresentation(chat: ChatRef, source: Exclude<AudioSource, {kind:'shell'}>, video?: VideoOptions): Promise<void>
stopPresentation(chat: ChatRef): Promise<void>
```

`startPresentation` joins the presentation channel with a file/url video source
(replaces the camera channel). `stopPresentation` leaves the presentation channel;
the call stays.

#### Playback control

```ts
setSource(chat: ChatRef, source: AudioSource): Promise<void>  // swap audio, keep video (queue)
pause(chat: ChatRef): Promise<boolean>
resume(chat: ChatRef): Promise<boolean>
mute(chat: ChatRef): Promise<boolean>
unmute(chat: ChatRef): Promise<boolean>
time(chat: ChatRef): Promise<number>                          // seconds streamed
```

#### Playlist / queue

```ts
play(chat: ChatRef, source: AudioSource, options?: JoinOptions): Promise<JoinResult>
enqueue(chat: ChatRef, source: AudioSource): Promise<void>   // alias: then()
then(chat: ChatRef, source: AudioSource): Promise<void>
skip(chat: ChatRef): Promise<void>
playOnHold(chat: ChatRef, source: AudioSource | null): Promise<void>
clearQueue(chat: ChatRef): Promise<void>
getCurrent(chat: ChatRef): AudioSource | null                // sync
getQueue(chat: ChatRef): AudioSource[]                       // sync; copy
```

- `play` — join (if not already in a call) and start `source` now, replacing the
  current track. The call is kept open (`autoLeave` off) so the playlist decides
  when to leave.
- `enqueue` / `then` — queue a track after the current one. Joins if no call is
  active; starts immediately if the call is idle; otherwise appends to the queue.
- `skip` — jump to the next queued track (or the hold track). With nothing queued,
  pauses playback (the call stays open).
- `playOnHold` — set a track looped while the queue is empty (hold music); `null` clears it.
- `clearQueue` — empty the queue and clear the hold track (current track keeps playing).
- `getCurrent` / `getQueue` — inspect the playing track and queued tracks (sync;
  numeric id or previously-resolved alias).

When a track ends, the next queued track (or the hold loop) starts automatically.
The call only auto-leaves when the queue **and** hold are empty (and `autoLeave` is
on with no `streamEnd` handler). The lower-level `setSource()` still works for
manual swapping.

#### Recording

```ts
startRecording(chat: ChatRef, path: string, options?: RecordOptions): Promise<RecordingInfo>
stopRecording(chat: ChatRef): Promise<string | null>   // returns the recorded path
getRecording(chat: ChatRef): RecordingInfo | null      // sync
isRecording(chat: ChatRef): boolean                    // sync
```

Records **incoming** call audio (what other participants say). ntgcalls mixes all
remote speakers natively and pipes s16le PCM to ffmpeg, which encodes to `path` —
the container is inferred from the extension (`.wav`, `.mp3`, `.opus`, …).
`RecordOptions`: `sampleRate` (default 48000), `channels` (default 1 mono).

Requires an active call. One recording per chat; calling `startRecording` again
replaces it. `stopRecording` closes the native writer, which SIGTERMs ffmpeg so the
container finalizes cleanly — allow a moment before reading the file. Leaving the
call also stops any recording.

#### P2P calls (incoming)

> **✅ Verified live** (tgcalls-js 0.7.0): incoming 1-on-1 calls connect and stream
> audio end-to-end (ICE `CONNECTED`, RTP flowing, audio heard by the caller).
>
> Notes for implementers:
> - Byte parameters passed to the ntgcalls binding must be **plain JS arrays**
>   (`Array.from(buf)`); `Buffer`/`Uint8Array` throw `An array was expected`.
>   The wrapper does this for you.
> - Signaling must use **V2 external signaling** (`8.0.0`/`9.0.0`). Passing
>   `12.0.0`/`13.0.0` makes ntgcalls route signaling over an SCTP data channel and
>   the call times out. `listenCalls` restricts the version list automatically.
> - Set `debug: true` to log per-step signaling/ICE diagnostics.

```ts
listenCalls(options: ListenCallsOptions): Promise<void>
stopListeningCalls(): Promise<void>
activeCallPeers(): bigint[]
```

`listenCalls` answers incoming 1-on-1 voice calls and streams `options.source` into
them. `ListenCallsOptions`: `source` (AudioSource), `autoAccept` (default true),
`onIncoming({userId, callId}) => boolean` (gate to accept/reject), `ffmpegPath`,
`debug` (verbose `[p2p]` signaling/ICE logs, default false), `logger`. The DH exchange + WebRTC run in ntgcalls; the library handles the MTProto
signaling. Requires a GramJS/teleproto client. One listener per client; calling
again replaces it. `stopListeningCalls` hangs up active calls.

#### Outgoing calls

```ts
callUser(userId: ChatRef, options?: { video?: boolean | VideoOptions }): Promise<bigint>
```

Calls `userId` and streams the same `source` into the call once the callee answers.
Requires `listenCalls()` first — that installs the update handler which drives the
accept → confirm steps. Returns the Telegram call id. The call is hung up by
`stopListeningCalls()` / `dispose()`, or when the peer ends it.

```ts
await tgcalls.listenCalls({ source: { kind: 'file', path: 'song.mp3' }, video: { width: 640, height: 360, fps: 25 } });
const callId = await tgcalls.callUser(123456789n, { video: true });
```

How it works: `initExchange` is called with a `null` gaHash so the native core
returns `SHA256(g_a)` for `phone.requestCall`; on `PhoneCallAccepted` the library
calls `exchangeKeys(gB, 0)` (the native core computes the fingerprint) and then
`phone.confirmCall(gA, keyFingerprint)`. `phone.requestCall` returns
`USER_PRIVACY_RESTRICTED` when the callee only accepts calls from contacts.

Multi-party conference is not yet supported.

#### Lifecycle

```ts
leave(chat: ChatRef): Promise<void>   // ntgcalls.stop + phone.leaveGroupCall (best-effort)
dispose(): Promise<void>              // stop all calls + detach update handlers; await before disposing the MTProto client
```

#### Introspection

```ts
activeCalls(): bigint[]                       // marked ids of all active calls
getCall(chat: ChatRef): ActiveCall | null     // sync; numeric id or previously-resolved alias
isActive(chat: ChatRef): boolean              // sync; same alias rules
resolveChatId(chat: ChatRef): Promise<bigint> // username / t.me link / id → marked id
```

#### Events

```ts
on<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): () => void
off<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): void
once<K extends keyof TgCallsEvents>(event: K, handler: TgCallsEvents[K]): () => void
```

Multiple handlers per event are supported — all run in registration order. `on`
and `once` return an unsubscribe function; `off` removes a specific handler.
`once` runs a handler a single time then removes it. A handler that throws/rejects
is logged (via `logger`) and never blocks the other handlers or crashes the process.
Registering any `streamEnd` handler suppresses auto-leave.

## Types

### `ChatRef`

```ts
type ChatRef = string | number | bigint;
```

Async methods accept a marked id (`-100…`), `@username`, or `t.me` link. Sync
`getCall()` / `isActive()` accept numeric ids or aliases previously resolved by this
client. `activeCalls()` always returns marked ids.

### `AudioSource`

```ts
type AudioSource =
  | { kind: 'file'; path: string }
  | { kind: 'url'; url: string; audioUrl?: string }
  | { kind: 'shell'; command: string };
```

### `JoinOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `muted` | `boolean` | `false` | join with microphone muted |
| `autoLeave` | `boolean` | `true` | leave when the audio stream ends (suppressed by a `streamEnd` handler) |
| `allowCreate` | `boolean` | `false` | create a missing voice chat (requires admin rights) |
| `inviteHash` | `string` | — | invite hash when joining via a call invite link |
| `video` | `VideoOptions \| false` | — | share video from the same source |
| `presentation` | `boolean` | `false` | use the presentation channel for this call |

### `VideoOptions`

| Field | Type | Default |
|---|---|---|
| `width` | `number` | probed / 640 |
| `height` | `number` | probed / 360 |
| `fps` | `number` | probed / 25 |
| `adjustByHeight` | `boolean` | `true` |

### `VideoQuality` (presets)

```ts
VideoQuality.UHD_4K   // { width: 3840, height: 2160, fps: 60 }
VideoQuality.QHD_2K   // { width: 2560, height: 1440, fps: 60 }
VideoQuality.FHD_1080p// { width: 1920, height: 1080, fps: 60 }
VideoQuality.HD_720p  // { width: 1280, height: 720,  fps: 30 }
VideoQuality.SD_480p  // { width: 854,  height: 480,  fps: 30 }
VideoQuality.SD_360p  // { width: 640,  height: 360,  fps: 30 }
```

### `JoinResult`

```ts
interface JoinResult { chatId: bigint; call: unknown; ssrc: number; }
```

### `ActiveCall`

```ts
interface ActiveCall {
  chatId: bigint; call: unknown; ssrc: number; source: AudioSource;
  videoActive: boolean; presentationActive: boolean;
  muted: boolean; autoLeave: boolean; joinedAt: number;
}
```

### `StreamEndInfo`

```ts
interface StreamEndInfo {
  chatId: bigint;
  source: AudioSource | null;
  willAutoLeave: boolean; // true when no streamEnd handler is registered and autoLeave is on
}
```

### `TgCallsEvents`

```ts
interface TgCallsEvents {
  streamEnd: (info: StreamEndInfo) => void | Promise<void>;
  connectionChange: (chatId: bigint, state: ConnectionState) => void | Promise<void>;
  update: (update: unknown) => void | Promise<void>;
}
```

`ConnectionState` is a numeric enum (from ntgcalls): `CONNECTING=1`, `CONNECTED=2`,
`FAILED=4`, `TIMEOUT=8`, `CLOSED=16`.

## Errors

All extend `TgCallsError` (which extends `Error`); `error.name` is the class name.

| Class | Extra | Thrown when |
|---|---|---|
| `TgCallsError` | — | base class for all library errors |
| `AlreadyInCallError` | `chatId: bigint` | `join`/`joinIdle` while already in a call (or mid-join) in that chat |
| `NoVoiceChatError` | — | no active voice chat and `allowCreate` not set |
| `UnrecognizedClientError` | — | the `client` is neither GramJS-family, mtcute, nor an adapter |

## Adapters

```ts
class GramjsAdapter implements MTProtoAdapter { constructor(client: MTProtoLike, opts?: { Api?: unknown }) }
class MtcuteAdapter implements MTProtoAdapter { constructor(client: MtcuteLike) }
function createAdapter(client: SupportedClient, opts?: { Api?: unknown }): MTProtoAdapter
function isAdapter(client: unknown): client is MTProtoAdapter
function isMtcuteClient(client: unknown): client is MtcuteLike
function isGramjsClient(client: unknown): client is MTProtoLike
```

`MTProtoAdapter` interface: `resolveChatId`, `getGroupCall`, `joinGroupCall`,
`leaveGroupCall`, `joinPresentationCall`, `leavePresentationCall`,
`extractConnectionParams`, `installUpdateHandler`, optional `dispose`.

## Media helpers

```ts
pcmCommand(source: AudioSource, opts: TgCallsOptions): string
audioDescription(source: AudioSource, opts: TgCallsOptions): object
videoDescription(source, video: VideoOptions, opts): object
probeVideo(filePathOrUrl: string, opts, target?: VideoOptions): Promise<{width,height,fps}>
resolveYouTube(url: string, opts, video?: boolean): Promise<string | null>
resolveYouTubeStreams(url: string, opts, maxHeight?: number): Promise<{ url: string; audioUrl?: string } | null>
```

## TL helpers

```ts
loadTl(provided?: unknown): AnyApi   // resolve/cache the raw TL namespace (telegram → teleproto)
resetTlCache(): void
loadEvents(...): unknown
```
