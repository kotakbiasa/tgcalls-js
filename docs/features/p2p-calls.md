# 1-on-1 P2P Calls & Preflight

`tgcalls-js` supports full end-to-end encrypted 1-on-1 Telegram voice and video calls in **both directions** (incoming and outgoing), complete with non-ringing eligibility preflight checks, 4-emoji MITM key verification, and remote audio/video recording.

---

## How P2P Calls Work Under the Hood

1. **DH Key Exchange:** `ntgcalls` generates Diffie-Hellman parameters (`initExchange` / `exchangeKeys`) and computes the key fingerprint.
2. **MTProto Signaling:** `tgcalls-js` handles `phone.requestCall`, `phone.acceptCall`, `phone.confirmCall`, `phone.sendSignalingData`, and `UpdatePhoneCall` / `UpdatePhoneCallSignalingData`.
3. **V2 External Signaling:** `tgcalls-js` automatically negotiates `8.0.0`/`9.0.0` V2 external signaling (avoiding the SCTP data-channel timeout pitfall in `12.0.0`/`13.0.0`) and converts binary buffers to plain JS arrays across the `ntgcalls` N-API boundary.
4. **WebRTC Media:** Once confirmed, `ntgcalls.connectP2p` establishes the encrypted ICE/SRTP peer connection and streams your configured `AudioSource` (plus optional camera video).

> **Important for `mtcute` users:** Call `await client.start()`, **not** `await client.connect()`. `mtcute` only runs its updates dispatcher (which delivers `updatePhoneCall`) after `start()`.

---

## Preflight Eligibility Checks (No Ringing)

Before dialing a user with `callUser()`, you can inspect whether Telegram's profile/privacy flags allow the call — **without** sending a ringing `phone.requestCall` RPC:

```ts
const reason = await tg.getCallDenialReason('@alice', { video: true });
if (reason !== null) {
  console.log(`Cannot call @alice: ${reason}`);
} else {
  await tg.callUser('@alice', { video: true });
}

// Or boolean shorthand:
if (await tg.canRequestCall('@alice', { video: false })) {
  await tg.callUser('@alice');
}
```

### All `CallDenialReason` Values

| Reason | Meaning & Recommended Action |
|---|---|
| `'INVALID_USER'` | The target reference is invalid or non-positive (`<= 0`). |
| `'ADAPTER_UNSUPPORTED'` | Custom `MTProtoAdapter` does not implement `getCallEligibility`. |
| `'SESSION_UNAVAILABLE'` | Could not read the current logged-in session identity (`getMe`). |
| `'BOT_ACCOUNT'` | Logged in as a bot account — Telegram forbids bots from placing P2P calls. |
| `'SELF_CALL'` | Target user ID is the same as your own account. |
| `'USER_IS_BOT'` | Target user is a Telegram bot. |
| `'USER_DELETED'` | Target account is deleted. |
| `'USER_BLOCKED'` | Target user is blocked. |
| `'PRIVACY_RESTRICTED'` | Target user's privacy settings forbid calls from your account. |
| `'CALLS_UNAVAILABLE'` | Target user cannot receive Telegram voice calls. |
| `'VIDEO_UNAVAILABLE'` | Target user cannot receive video calls (only returned when `{ video: true }`). |

> **Caveat:** Preflight reads the latest `users.getFullUser` flags; a user's privacy settings can still change between preflight and dialing. Network/RPC errors are **not** swallowed and reject normally.

---

## Answering Incoming P2P Calls (`listenCalls`)

Install a P2P call listener with `listenCalls()`. Only one listener is active per `TgCallsClient`; calling `listenCalls()` again replaces the previous listener.

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './greeting.mp3' },
  video: { width: 640, height: 360, fps: 25 },
  autoAccept: false,
  onIncoming: async ({ userId, callId }) => {
    console.log(`Incoming call ${callId} from user ${userId}`);
    // Return true to answer, false to decline (PhoneCallDiscardReasonBusy)
    return allowedUserIds.has(userId);
  },
  record: { path: './recordings/p2p-remote.mp4', video: true },
  debug: false,
});
```

### `ListenCallsOptions`

| Option | Type | Default | Detailed Behavior |
|---|---|---|---|
| `source` | `AudioSource` | required | Audio/video streamed into answered and outgoing calls. Supports `'file'`, `'url'`, `'shell'`, and `'external'` (for Voice AI). |
| `autoAccept` | `boolean` | `true` | Automatically accepts every incoming call. Set to `false` to let `onIncoming` decide. |
| `onIncoming` | `({ userId, callId }) => boolean \| Promise<boolean>` | — | Gate callback invoked on `PhoneCallRequested`. Return `false` to decline. |
| `video` | `boolean \| VideoOptions` | `false` | Stream camera video into 1:1 video calls (requires a `file`/`url` source containing video). |
| `record` | `string \| CallRecordOptions` | — | Default recording target for remote audio (`.wav`/`.mp3`/`.opus`) or remote video+audio (`.mp4`/`.mkv`). |
| `ffmpegPath` | `string` | inherited | Override `ffmpeg` binary path. |
| `ffprobePath` | `string` | inherited | Override `ffprobe` binary path (used when `video` is enabled). |
| `debug` | `boolean` | `false` | Logs detailed `[p2p]` signaling, DH, and ICE diagnostics. |
| `logger` | `{ error(...args: unknown[]): void }` | inherited | Custom warning/error sink. |

---

## Placing Outgoing P2P Calls (`callUser`)

`callUser()` **requires `listenCalls()` to be running first** because the listener processes `PhoneCallAccepted` and drives `exchangeKeys` → `phone.confirmCall`.

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './intro.mp4' },
  video: { width: 640, height: 360, fps: 25 },
  record: './recordings/default-remote.wav',
});

// Dial with video and override recording to muxed MP4
const callId = await tg.callUser('@alice', {
  video: true,
  record: { path: './recordings/alice.mp4', video: true },
});

// Dial audio-only and disable recording for this specific call
await tg.callUser('@bob', {
  video: false,
  record: false,
});
```

### `OutgoingCallOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `video` | `boolean \| VideoOptions` | listener default | Request a 1:1 video call (`true` uses listener's `video` config or probed defaults) |
| `record` | `false \| string \| CallRecordOptions` | listener default | `false` disables recording; string or object overrides the listener's recording target |

> **Recording rules:** P2P recording captures the **remote** party's media (not a mix with your local source). Two concurrent P2P calls cannot write to the same recording file path simultaneously.

---

## 4-Emoji E2E Verification & Events

Once the call connects (`ConnectionState.CONNECTED = 2`), both sides can compare the 4-emoji fingerprint derived from the DH shared secret:

```ts
tg.on('connectionChange', async (peerId, state) => {
  if (state === 2) { // ConnectionState.CONNECTED
    const emojis = await tg.getEmojiFingerprint(peerId);
    console.log(`Connected to ${peerId} — E2E emojis: ${emojis}`);
  }
});

tg.on('recordingStopped', (peerId, info) => {
  console.log(`P2P recording for ${peerId}: ${info.status} → ${info.path}`);
});
```

## Managing Active P2P Calls

```ts
const peers = tg.activeCallPeers(); // bigint[] of active P2P peer user IDs
await tg.stopListeningCalls();      // stops listener and hangs up all active P2P calls
```
