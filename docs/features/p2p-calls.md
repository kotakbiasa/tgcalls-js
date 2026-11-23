# 1-on-1 P2P Calls & Preflight

`tgcalls-js` supports both **incoming** and **outgoing** end-to-end encrypted 1-on-1 Telegram voice and video calls (DH key exchange + WebRTC via `ntgcalls`, MTProto signaling via `teleproto`/GramJS or `mtcute`), plus non-ringing preflight eligibility checks and remote media recording.

> **mtcute note:** Call `await client.start()`, not `client.connect()`, so the MTProto updates loop receives `updatePhoneCall` events.

## Preflight Eligibility Check (No Ringing)

Check whether a user can be called before dialing — no `phone.requestCall` RPC is sent:

```ts
const reason = await tg.getCallDenialReason('@alice', { video: true });
if (reason !== null) {
  console.log('Cannot call:', reason);
}

// Boolean shorthand
const ok = await tg.canRequestCall('@alice', { video: true });
```

### Possible `CallDenialReason` Values

| Reason | Meaning |
|---|---|
| `'INVALID_USER'` | Invalid or non-positive user reference |
| `'ADAPTER_UNSUPPORTED'` | Custom adapter does not implement `getCallEligibility` |
| `'SESSION_UNAVAILABLE'` | Current MTProto session identity unavailable |
| `'BOT_ACCOUNT'` | Current account is a bot (Telegram forbids bot calls) |
| `'SELF_CALL'` | Target is the current user |
| `'USER_IS_BOT'` | Target user is a bot |
| `'USER_DELETED'` | Target user account is deleted |
| `'USER_BLOCKED'` | Target user is blocked |
| `'PRIVACY_RESTRICTED'` | Target user's privacy settings forbid calls from you |
| `'CALLS_UNAVAILABLE'` | Target user cannot receive voice calls |
| `'VIDEO_UNAVAILABLE'` | Target user cannot receive video calls (when `{ video: true }`) |

> Preflight reflects the latest profile flags and can become stale before dialing; network/RPC failures still reject normally.

## Answering Incoming P2P Calls

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './greeting.mp3' },
  video: { width: 640, height: 360, fps: 25 },
  autoAccept: false,
  onIncoming: ({ userId, callId }) => {
    console.log(`Incoming call ${callId} from ${userId}`);
    return allowedUsers.has(userId); // return false to decline
  },
  record: { path: './calls/remote.mp4', video: true },
  debug: false,
});
```

### `ListenCallsOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `AudioSource` | required | Audio/video streamed into answered (and outgoing) calls. Supports `'file'`, `'url'`, `'shell'`, and `'external'` |
| `autoAccept` | `boolean` | `true` | Automatically accept incoming calls. If `false`, `onIncoming` decides |
| `onIncoming` | `({ userId, callId }) => boolean \| Promise<boolean>` | — | Gate function to accept or decline incoming calls |
| `video` | `boolean \| VideoOptions` | `false` | Send camera video into 1:1 video calls (requires `file`/`url` source with video) |
| `record` | `string \| CallRecordOptions` | — | Default recording target for P2P calls (remote party's audio or video+audio) |
| `ffmpegPath` | `string` | inherited | Override `ffmpeg` binary |
| `ffprobePath` | `string` | inherited | Override `ffprobe` binary |
| `debug` | `boolean` | `false` | Enable verbose `[p2p]` signaling/ICE diagnostics |
| `logger` | `{ error(...args: unknown[]): void }` | inherited | Custom warning/error sink |

## Placing Outgoing P2P Calls

`callUser()` requires `listenCalls()` to be active first (it drives the accept → confirm signaling state machine):

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './hello.mp4' },
  video: { width: 640, height: 360, fps: 25 },
});

const callId = await tg.callUser('@alice', {
  video: true,
  record: { path: './alice-remote.mp4', video: true },
});
```

### `OutgoingCallOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `video` | `boolean \| VideoOptions` | listener default | Request a 1:1 video call |
| `record` | `false \| string \| CallRecordOptions` | listener default | Override listener recording; pass `false` to disable recording for this call |

## E2E Key Verification (4-Emoji Fingerprint)

Verify that both sides see the exact same 4 emojis (out-of-band MITM check):

```ts
tg.on('connectionChange', async (peerId, state) => {
  if (state === 2) { // ConnectionState.CONNECTED
    const emojis = await tg.getEmojiFingerprint(peerId);
    console.log('Verify with peer:', emojis); // e.g. "🔶🐚🚶🔋"
  }
});
```

## Stopping & Introspection

```ts
tg.activeCallPeers();         // bigint[] of active P2P peer user IDs
await tg.stopListeningCalls(); // stop listening and hang up active P2P calls
```

> **Note:** P2P recording captures the **remote** party's audio/video (not a mix with your local source). Concurrent P2P calls cannot write to the same recording file path simultaneously.
