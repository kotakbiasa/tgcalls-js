# Playback, Queue & Participant Controls

`tgcalls-js` ships with high-level controls for building Telegram music bots, radio stations, and moderated voice chat assistants — including per-chat playlists, hold loops, seeking, dynamic volume/speed filters, loop modes, channel aliases (`joinAs`), and participant moderation.

---

## Playlist & Queue Architecture

Each chat maintains its own independent playlist state:
- **Current track** (`ActiveCall.source`) — the media currently streaming.
- **Queue** (`AudioSource[]`) — FIFO list of upcoming tracks.
- **Hold track** (`AudioSource | null`) — optional fallback track looped whenever the queue becomes empty.

### How Track Transitions Work

When the current track finishes (`streamEnd`), `tgcalls-js` resolves what to play next in this exact priority order:

1. **`loop === 'one'`:** Replays the current track from the beginning.
2. **`loop === 'all'`:** Pushes the finished track to the back of the queue and pops the next track from the front.
3. **Queued tracks:** Pops the next track from `queue` and calls `setSource()`.
4. **Hold track:** If the queue is empty and `playOnHold()` was set, plays the hold track.
5. **End of playback:** If none of the above apply, fires `streamEnd` (and auto-leaves only if `autoLeave` is `true` and no `streamEnd` listener is registered).

### Playlist Methods

| Method | Signature | Detailed Behavior |
|---|---|---|
| `play` | `(chat, source, options?) => Promise<JoinResult>` | If not in a call, joins with `autoLeave: false` and starts `source`. If already in a call, immediately replaces the current track via `setSource()` without leaving. |
| `enqueue` | `(chat, source) => Promise<void>` | If not in a call, joins with `autoLeave: false` and starts playing immediately. If currently idle (`joinIdle`), starts playing immediately. Otherwise appends `source` to the queue. |
| `then` | `(chat, source) => Promise<void>` | Chainable alias for `enqueue()`. |
| `skip` | `(chat) => Promise<void>` | Immediately advances to the next queued track (or hold track). If nothing is queued, pauses capture (`ntgcalls.pause()`) and keeps the call open. |
| `playOnHold` | `(chat, source \| null) => Promise<void>` | Sets background/hold music looped while the queue is empty. Pass `null` to disable. |
| `clearQueue` | `(chat) => Promise<void>` | Empties the queue and clears the hold track. The currently playing track keeps playing. |
| `getCurrent` | `(chat) => AudioSource \| null` | Synchronous lookup of the active track. |
| `getQueue` | `(chat) => AudioSource[]` | Synchronous shallow copy of the pending queue. |

```ts
// Start playing immediately (auto-joins if needed, keeps call open)
await tg.play('@mygroup', { kind: 'file', path: './intro.mp3' });

// Queue additional tracks
await tg.enqueue('@mygroup', { kind: 'file', path: './song1.mp3' });
await tg.then('@mygroup', { kind: 'url', url: 'https://cdn.example.com/song2.mp3' });

// Loop ambient music whenever the queue runs dry
await tg.playOnHold('@mygroup', { kind: 'file', path: './lofi-hold.mp3' });

// Inspect state synchronously
console.log('Playing:', tg.getCurrent('@mygroup'));
console.log('Queued:', tg.getQueue('@mygroup'));

// Skip to song1.mp3
await tg.skip('@mygroup');

// Clear upcoming tracks + hold (current track keeps playing)
await tg.clearQueue('@mygroup');
```

---

## Seek, Volume, Speed & Loop Controls

Playback controls operate on `file` and `url` sources by rebuilding the `ffmpeg` capture pipeline with the requested filters while preserving any active camera or screen video channel.

### How Each Control Works

- **`seek(chat, seconds)`:** Validates `seconds >= 0`, then calls `setSource()` with `-ss <seconds>` while preserving your current `volume`, `speed`, and video channel. Throws if the current source is `'shell'` or `'external'` (which are live streams with no seekable timeline).
- **`setVolume(chat, percent)`:** Accepts `0` to `200` (default `100`). Stores the setting per chat and, if a `file`/`url` track is active, queries `await tg.time(chat)` and restarts the pipeline from the current playback position with `-af volume=<percent/100>`.
- **`setSpeed(chat, rate)`:** Accepts `0.5` to `2.0` (default `1.0`). Applies `-af atempo=<rate>` to audio and `setpts=PTS/<rate>` to video (if active), resuming from the current playback position.
- **`setLoop(chat, mode)`:** Sets `'off'`, `'one'`, or `'all'`. Applies automatically on the next track transition.

| Method | Valid Input | Default | Persists across tracks in same call? |
|---|---|---|---|
| `seek(chat, seconds)` | Finite number `>= 0` | `0` | No (one-time jump on current track) |
| `setVolume(chat, percent)` | `0` – `200` | `100` | Yes (until `leave()` or changed again) |
| `setSpeed(chat, rate)` | `0.5` – `2.0` | `1.0` | Yes (until `leave()` or changed again) |
| `setLoop(chat, mode)` | `'off' \| 'one' \| 'all'` | `'off'` | Yes (until `leave()` or changed again) |
| `getLoop(chat)` | — | `'off'` | Sync getter |
| `getPlaybackControls(chat)` | — | `{ volume: 100, speed: 1, loop: 'off' }` | Sync snapshot |

```ts
await tg.play('@mygroup', { kind: 'file', path: './song.mp3' });

await tg.seek('@mygroup', 60);        // jump to 1:00
await tg.setVolume('@mygroup', 150);  // 150% volume
await tg.setSpeed('@mygroup', 1.25);  // 1.25x speed
await tg.setLoop('@mygroup', 'all');  // loop entire playlist

// Check current settings
const { volume, speed, loop } = tg.getPlaybackControls('@mygroup');
```

### Pause, Resume, Mute & Unmute

These map directly to native `ntgcalls` controls without restarting `ffmpeg`:

```ts
await tg.pause('@mygroup');   // pauses capture stream (keeps position)
await tg.resume('@mygroup');  // resumes capture stream
await tg.mute('@mygroup');    // mutes outgoing audio (stream keeps advancing)
await tg.unmute('@mygroup');  // unmutes outgoing audio
```

---

## Voice Chat Participant Controls & `joinAs`

`tgcalls-js` wraps Telegram's `phone.getGroupParticipants` and `phone.editGroupCallParticipant` RPCs so your bot/userbot can join as a channel, inspect speakers, raise its hand, or moderate participants.

### Joining as a Channel or Alias (`joinAs`)

By default, you join a voice chat as your own user account. Pass `joinAs` to appear as a channel or other allowed peer:

```ts
await tg.join('@mygroup', { kind: 'file', path: './broadcast.mp3' }, {
  joinAs: '@mychannel', // or channel numeric ID / bigint
});
```

### Listing Participants (`getParticipants`)

Fetches the full paginated participant list from Telegram and keeps an internal participant registry synchronized with `UpdateGroupCallParticipants` deltas:

```ts
const participants = await tg.getParticipants('@mygroup');
for (const p of participants) {
  console.log({
    peer: p.peer,          // { kind: 'user' | 'channel' | 'chat', id: bigint }
    ssrc: p.source,        // audio SSRC
    muted: p.muted,
    raiseHand: p.raiseHandRating,
    video: p.video?.endpoint,
  });
}
```

### Raising Hand, Muting & Adjusting Volume

| Method | Who can call it | Notes |
|---|---|---|
| `setRaiseHand(chat, raised)` | Any participant | Calls `editParticipant(chat, 'self', { raiseHand: raised })`. Useful in muted voice chats where listeners must request to speak. |
| `muteParticipant(chat, participant, muted = true)` | Group/channel admin | Mutes (`true`) or unmutes (`false`) another participant. |
| `setParticipantVolume(chat, participant, percent)` | Group/channel admin (or self) | Accepts `0`–`200%` and converts to Telegram's integer scale (`0`–`20000`, where `10000` = `100%`). |
| `editParticipant(chat, participant \| 'self', options)` | Varies | Low-level wrapper supporting all `EditParticipantOptions` fields at once. |

### `EditParticipantOptions`

| Field | Type | Description |
|---|---|---|
| `muted` | `boolean` | Mute or unmute the target participant |
| `volume` | `number` | Raw Telegram volume (`0`–`20000`, where `10000` = 100%) |
| `raiseHand` | `boolean` | Raise or lower hand |
| `videoStopped` | `boolean` | Stop participant's camera video |
| `videoPaused` | `boolean` | Pause participant's camera video |
| `presentationPaused` | `boolean` | Pause participant's screen share |

```ts
// Raise hand to request speaking permission
await tg.setRaiseHand('@mygroup', true);

// Admin: mute a noisy user
await tg.muteParticipant('@mygroup', 123456789n, true);

// Admin: boost a speaker to 175%
await tg.setParticipantVolume('@mygroup', 123456789n, 175);

// Low-level multi-field edit
await tg.editParticipant('@mygroup', 123456789n, {
  muted: false,
  volume: 12000, // 120%
  videoPaused: true,
});
```
