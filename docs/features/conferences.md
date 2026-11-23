# E2E Group Conferences

`tgcalls-js` exposes Telegram's end-to-end encrypted **Group Conference** protocol (blockchain-style subchain blocks + native E2E key derivation via `ntgcalls`).

> **Note:** Conference support is marked **experimental** because `ntgcalls@3.0.7` does not expose `removeConferenceParticipants`, `rekeyConference`, or `encryptMessage`/`decryptMessage`. See the capability matrix below.

## Quick Example

```ts
// Host creates a conference and exports an invite link
const handle = await host.createConference({
  source: { kind: 'file', path: './tone.mp3' },
});
const inviteUrl = await host.exportConferenceInvite(handle);
console.log('Share invite:', inviteUrl);

// Invite a specific user (rings them)
await host.inviteConferenceParticipants(handle, ['@alice'], { video: false });

// Second client joins via slug, inviteMessageId, or { id, accessHash }
const slug = inviteUrl.split('/').pop()!;
const guestHandle = await guest.joinConference({ slug }, {
  source: { kind: 'file', path: './hello.mp3' },
});

// Verify 4-emoji E2E fingerprint matches on both sides
const hostEmojis = await host.getEmojiFingerprint(handle);
const guestEmojis = await guest.getEmojiFingerprint(guestHandle);
console.log({ hostEmojis, guestEmojis }); // e.g. "🔶🐚🚶🔋"

// Leave
await guest.leaveConference(guestHandle);
await host.leaveConference(handle);
```

## Conference Methods

| Method | Signature | Description |
|---|---|---|
| `createConference` | `(options?) => Promise<ConferenceHandle>` | Create a new E2E conference and initialize native subchain |
| `joinConference` | `(ref: ConferenceRef, options?) => Promise<ConferenceHandle>` | Join via `{ slug }`, `{ inviteMessageId }`, or `{ id, accessHash }` |
| `exportConferenceInvite` | `(handle) => Promise<string>` | Returns the conference invite URL |
| `inviteConferenceParticipants` | `(handle, users: ChatRef[], { video? }) => Promise<void>` | Rings users to join the conference |
| `getEmojiFingerprint` | `(handle) => Promise<string \| null>` | Returns 4-emoji verification string (`null` while pending) |
| `activeConferences` | `() => ConferenceHandle[]` | Lists all active conference handles |
| `getConferenceCapabilities` | `() => ConferenceCapabilities` | Inspects native `ntgcalls` capabilities at runtime |
| `sendConferenceMessage` | `(handle, input) => Promise<ConferenceMessageReceipt>` | Send an E2E-encrypted conference message (requires `ntgcalls >= 4.0.0-alpha03`) |
| `leaveConference` | `(handle) => Promise<void>` | Leave the conference and stop native resources |

### `ConferenceOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `AudioSource` | — | Optional audio source (`'file'`, `'url'`, `'shell'`, or `'external'`) |
| `video` | `VideoOptions` | — | Optional camera video (for `file`/`url` sources) |
| `muted` | `boolean` | `!source` | Join muted |
| `videoStopped` | `boolean` | `!video` | Join with video disabled |
| `signal` | `AbortSignal` | — | Optional cancellation signal |

## Capability-Aware E2E Encrypted Messages (`ntgcalls >= 4.0.0-alpha03`)

`tgcalls-js` inspects `ntgcalls` at runtime via `getConferenceCapabilities()`:

```ts
const caps = tg.getConferenceCapabilities();
console.log(caps);
// On ntgcalls 3.0.7:
//   { nativeVersion: '3.0.7', coreLifecycle: true, applicationEncryption: false, removeParticipants: false, rekey: false, ... }
// On ntgcalls >= 4.0.0-alpha03:
//   { nativeVersion: '4.0.0+', coreLifecycle: true, applicationEncryption: true, ... }
```

When `caps.applicationEncryption === true`:

```ts
// Listen for decrypted incoming conference messages
tg.on('conferenceMessage', (event) => {
  // event: { handle, callId, fromUserId, raw: Buffer, text?, randomId?, parsed? }
  console.log(`Message from ${event.fromUserId}:`, event.text ?? event.raw);
});

// Send text, formatted object, or raw encrypted bytes
const receipt = await tg.sendConferenceMessage(handle, 'Hello E2E conference!');
// Or structured: { text: 'Hi', entities: [], randomId: 123n }
// Or raw bytes: new Uint8Array([...])
```

- On `ntgcalls@3.0.7`, calling `sendConferenceMessage`, `removeConferenceParticipants`, or `rekeyConference` rejects with `UnsupportedNativeCapabilityError`.
- `tgcalls-js` **never** falls back to plaintext or custom JavaScript cryptography, and never synthesizes private keys or signed chain blocks.
- Asynchronous chain/poll failures are emitted on `tg.on('conferenceError', (err) => ...)`.
