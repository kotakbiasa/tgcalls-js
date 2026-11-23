# E2E Group Conferences

Telegram **Group Conferences** are end-to-end encrypted multi-party calls where participants maintain a cryptographically signed subchain of membership blocks and derive a shared 4-emoji verification fingerprint. `tgcalls-js` implements the full conference signaling, subchain block synchronization, participant SSRC/video mapping, and capability-aware E2E message encryption on top of `ntgcalls`.

---

## Native Capability Matrix (`ntgcalls` 3.0.7 vs 4.0.0+)

Because `ntgcalls` evolves independently, `tgcalls-js` inspects the loaded native binary at runtime via `tg.getConferenceCapabilities()`:

| Capability | `ntgcalls@3.0.7` | `ntgcalls >= 4.0.0-alpha03` | Notes |
|---|---|---|---|
| `coreLifecycle` (create, join, invite, subchains, audio/video, emoji fingerprint) | ✅ Supported | ✅ Supported | Verified live with 2 accounts |
| `applicationEncryption` (`sendConferenceMessage` / `conferenceMessage`) | ❌ Throws `UnsupportedNativeCapabilityError` | ✅ Auto-enabled | Uses native `encryptMessage` / `decryptMessage` |
| `removeParticipants` (`removeConferenceParticipants`) | ❌ Throws `UnsupportedNativeCapabilityError` | ❌ Upstream pending | Never falls back to insecure ops |
| `rekey` (`rekeyConference`) | ❌ Throws `UnsupportedNativeCapabilityError` | ❌ Upstream pending | Never synthesizes JS keys |

> **Security guarantee:** `tgcalls-js` **never** falls back to plaintext, never implements custom JavaScript cryptography, and never synthesizes private keys or signed chain blocks. All cryptographic primitives stay inside `ntgcalls`.

---

## How Conference Lifecycle Works

1. **Create or Join:** `createConference()` / `joinConference()` allocates a dedicated native handle (`ConferenceHandle = { nativeId, callId }`), initializes the native conference (`createP2pCall` → `initConference`), installs your capture media (`prepareCapture`), and sends the MTProto create/join RPC.
2. **Subchain Sync:** `tgcalls-js` validates incoming `UpdateGroupCallChainBlocks` server block constructors, applies them to `ntgcalls.applyBlocks()`, and responds to native `outboundBlock` / `subchainRequest` / `requestParticipants` events automatically.
3. **Emoji Fingerprint:** As participants join and subchains converge, `ntgcalls` emits `updateEmojis`. Read the current 4-emoji string anytime via `getEmojiFingerprint(handle)`.
4. **Separate from `ChatRef`:** Conferences are identified by an opaque `ConferenceHandle` (not a group `ChatRef`). Always pass the handle returned by `createConference` or `joinConference` to conference methods.

---

## Complete Two-Client Conference Example

```ts
// --- Host creates the conference ---
host.on('conferenceError', (err) => console.error('[host] conference error:', err));

const hostHandle = await host.createConference({
  source: { kind: 'file', path: './host-audio.mp3' },
});

// Export shareable invite link (https://t.me/call/<slug>)
const inviteLink = await host.exportConferenceInvite(hostHandle);
console.log('Invite link:', inviteLink);

// Optionally ring a specific Telegram user directly
await host.inviteConferenceParticipants(hostHandle, ['@alice'], { video: false });

// --- Guest joins via slug ---
guest.on('conferenceError', (err) => console.error('[guest] conference error:', err));

const slug = inviteLink.split('/').pop()!;
const guestHandle = await guest.joinConference({ slug }, {
  source: { kind: 'file', path: './guest-audio.mp3' },
});

// Compare 4-emoji E2E fingerprint out-of-band
const hostEmojis = await host.getEmojiFingerprint(hostHandle);
const guestEmojis = await guest.getEmojiFingerprint(guestHandle);
console.log('Fingerprints match:', hostEmojis === guestEmojis, hostEmojis);

// Leave cleanly
await guest.leaveConference(guestHandle);
await host.leaveConference(hostHandle);
```

### Supported `ConferenceRef` Formats for `joinConference()`

```ts
type ConferenceRef =
  | { slug: string }                       // from https://t.me/call/<slug>
  | { inviteMessageId: number }            // from an invite message ID
  | { id: bigint; accessHash: bigint };    // raw call ID + access hash
```

### `ConferenceOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `AudioSource` | — | Optional audio source (`'file'`, `'url'`, `'shell'`, or `'external'`) |
| `video` | `VideoOptions` | — | Optional camera video (for `'file'` / `'url'` sources) |
| `muted` | `boolean` | `!source` | Join with microphone muted |
| `videoStopped` | `boolean` | `!video` | Join with camera disabled |
| `signal` | `AbortSignal` | — | Cancel in-flight create/join/subchain RPCs |

---

## E2E Encrypted Conference Messages (`ntgcalls >= 4.0.0-alpha03`)

Check `getConferenceCapabilities().applicationEncryption` before sending or receiving encrypted conference messages:

```ts
const caps = tg.getConferenceCapabilities();

if (caps.applicationEncryption) {
  // Listen for incoming decrypted messages
  tg.on('conferenceMessage', (event) => {
    console.log(`[call ${event.callId}] from ${event.fromUserId}:`, {
      text: event.text,         // decoded UTF-8 text (when JSON text payload)
      randomId: event.randomId, // message random ID
      raw: event.raw,           // raw decrypted Buffer
      parsed: event.parsed,     // parsed JSON object (if valid JSON)
    });
  });

  // Send a plain text message
  const receipt = await tg.sendConferenceMessage(handle, 'Hello E2E conference!');
  console.log('Sent:', receipt.randomId, receipt.bytes, 'bytes');

  // Send formatted message object or raw Uint8Array bytes
  await tg.sendConferenceMessage(handle, { text: 'Bold alert', entities: [] });
  await tg.sendConferenceMessage(handle, new Uint8Array([1, 2, 3, 4]));
}
```

## Introspection & Cleanup

```ts
tg.activeConferences();                // ConferenceHandle[] of active conferences
tg.getConferenceCapabilities();        // frozen capability snapshot
await tg.leaveConference(handle);      // leave one conference
await tg.dispose();                    // automatically leaves all active conferences
```
