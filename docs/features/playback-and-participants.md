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
| `playNext` | `(chat, source) => Promise<void>` | Inserts `source` at the front of the queue (`index 0`), or starts immediately if idle / not in a call. |
| `removeQueueTrack` | `(chat, index) => Promise<AudioSource \| null>` | Removes and returns the queued track at zero-based `index` (`null` if out of range). |
| `moveQueueTrack` | `(chat, fromIndex, toIndex) => Promise<boolean>` | Moves a track within the queue from `fromIndex` to `toIndex`. |
| `shuffleQueue` | `(chat) => Promise<AudioSource[]>` | Randomly shuffles the pending queue in place (Fisher-Yates) and returns a copy. |
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
const { volume, speed, loop, filter } = tg.getPlaybackControls('@mygroup');
```

### Audio Effect & Equalizer Presets (`setAudioFilter`)

Apply real-time `ffmpeg` audio effects on active `file` and `url` tracks (automatically resumes from the current playback timestamp):

| Preset | `ffmpeg` Filter (`-af`) | Effect |
|---|---|---|
| `'off'` | *(none)* | Default clean audio |
| `'bassboost'` | `equalizer=f=60:width_type=h:width=50:g=10` | Deep +10 dB sub-bass boost |
| `'nightcore'` | `asetrate=48000*1.25,aresample=48000` | Pitch + tempo up (1.25×) |
| `'vaporwave'` | `asetrate=48000*0.8,aresample=48000` | Slowed & pitch-shifted down (0.8×) |
| `'8d'` | `apulsator=hz=0.125` | Rotating stereo 8D panning |
| `'karaoke'` | `stereotools=mlev=0.03` | Center vocal reduction |
| `'treble'` | `equalizer=f=3000:width_type=h:width=1000:g=8` | Crisp +8 dB high-mid boost |
| `'normalizer'` | `dynaudnorm=f=150:g=15` | Dynamic loudness normalization |
| `'echo'` | `aecho=0.8:0.88:60:0.4` | Spatial echo / reverb |
| `{ custom: string }` | Your custom `-af` string | Any custom `ffmpeg` audio filter chain |

```ts
await tg.setAudioFilter('@mygroup', 'bassboost');
await tg.setAudioFilter('@mygroup', 'nightcore');
await tg.setAudioFilter('@mygroup', { custom: 'acompressor,dynaudnorm' });
await tg.setAudioFilter('@mygroup', 'off');
```

### Auto-Idle Disconnect (`idleTimeoutMs`)

Automatically leave the group voice chat if playback stays idle (queue & hold empty) for `idleTimeoutMs` milliseconds:

```ts
// Global default on client construction:
const tg = new TgCallsClient({ client, idleTimeoutMs: 180_000 }); // 3 minutes

// Or per-chat on join / play / joinIdle:
await tg.play('@mygroup', { kind: 'file', path: './song.mp3' }, {
  idleTimeoutMs: 120_000,
});
```

### Voice Chat Room Management (`setCallTitle`, `endGroupCall`, `exportCallInvite`, `toggleNativeRecording`)

```ts
// Update the Voice Chat title (e.g. Now Playing banner)
await tg.setCallTitle('@mygroup', '🎵 Now Playing: Lofi Beats');

// Generate a shareable Voice Chat invite link
const inviteLink = await tg.exportCallInvite('@mygroup', { canSelfUnmute: true });

// Start/stop Telegram's native server-side recording (red dot in Telegram UI, saved to Saved Messages)
await tg.toggleNativeRecording('@mygroup', true, { title: 'Podcast Episode 1', video: true });
await tg.toggleNativeRecording('@mygroup', false);

// Completely end/discard the Voice Chat for all participants (admin required)
await tg.endGroupCall('@mygroup');
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
