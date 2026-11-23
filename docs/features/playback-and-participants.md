# Playback, Queue & Participant Controls

`tgcalls-js` includes built-in music bot primitives — playlist queues, hold tracks, seeking, volume/speed filters, loop modes, and Telegram group voice chat participant moderation.

## Playlist & Queue Management

| Method | Behavior |
|---|---|
| `play(chat, source, options?)` | Joins if not in a call (with `autoLeave: false`), or swaps the current track immediately while keeping the call open |
| `enqueue(chat, source)` / `then(chat, source)` | Appends a track to the queue (joins if not in a call; starts immediately if idle) |
| `skip(chat)` | Jumps to the next queued track (or the hold track). Pauses if nothing is queued |
| `playOnHold(chat, source \| null)` | Sets a track to loop whenever the queue is empty; pass `null` to clear |
| `clearQueue(chat)` | Clears the queue and hold track (the currently playing track continues) |
| `getCurrent(chat)` | Sync lookup of the active `AudioSource` (or `null`) |
| `getQueue(chat)` | Sync copy of queued `AudioSource[]` |

```ts
await tg.play('@mygroup', { kind: 'file', path: './track1.mp3' });
await tg.enqueue('@mygroup', { kind: 'file', path: './track2.mp3' });
await tg.then('@mygroup', { kind: 'file', path: './track3.mp3' }); // alias of enqueue
await tg.playOnHold('@mygroup', { kind: 'file', path: './lofi-hold.mp3' });

console.log('Now playing:', tg.getCurrent('@mygroup'));
console.log('Up next:', tg.getQueue('@mygroup').length);

await tg.skip('@mygroup');
await tg.clearQueue('@mygroup');
```

## Seek, Volume, Speed & Loop Controls

All playback controls work on `file` and `url` sources and automatically preserve active camera/screen video channels:

| Method | Range / Values | Default | How it works |
|---|---|---|---|
| `seek(chat, seconds)` | Finite number `>= 0` | — | Restarts the `ffmpeg` pipeline at `-ss <seconds>` while keeping current volume, speed, and video |
| `setVolume(chat, percent)` | `0` – `200` | `100` | Applies `-af volume=<percent/100>` immediately from the current playback position |
| `setSpeed(chat, rate)` | `0.5` – `2.0` | `1.0` | Applies `-af atempo=<rate>` (and video `setpts`) immediately from the current position |
| `setLoop(chat, mode)` | `'off' \| 'one' \| 'all'` | `'off'` | `'one'` repeats current track; `'all'` rotates finished tracks to the back of the queue |
| `getLoop(chat)` | returns `LoopMode` | `'off'` | Synchronous lookup |
| `getPlaybackControls(chat)` | returns `{ volume, speed, loop }` | `{ 100, 1, 'off' }` | Synchronous snapshot |

```ts
await tg.play('@mygroup', { kind: 'file', path: './song.mp3' });

await tg.seek('@mygroup', 45);        // jump to 0:45
await tg.setVolume('@mygroup', 140);  // boost to 140%
await tg.setSpeed('@mygroup', 1.25);  // 1.25x speed
await tg.setLoop('@mygroup', 'all');  // repeat entire playlist

const state = tg.getPlaybackControls('@mygroup');
// { volume: 140, speed: 1.25, loop: 'all' }
```

### Low-level `setSource` with `PlaybackFilterOptions`

You can also pass filters directly when manually swapping tracks:

```ts
await tg.setSource('@mygroup', { kind: 'file', path: './next.mp3' }, {
  startSec: 30,
  volume: 120,
  speed: 1.1,
});
```

### Pause, Resume, Mute & Unmute

```ts
await tg.pause('@mygroup');   // pause capture stream
await tg.resume('@mygroup');  // resume capture stream
await tg.mute('@mygroup');    // mute local microphone
await tg.unmute('@mygroup');  // unmute local microphone
```

## Voice Chat Participant Controls & `joinAs`

Inspect active participants, join as a channel/alias, raise hand, mute participants, or adjust participant volume via `phone.editGroupCallParticipant`.

| Method | Permission | Description |
|---|---|---|
| `join(chat, source, { joinAs })` | Channel admin (if joining as channel) | Join the voice chat under a channel/peer identity |
| `getParticipants(chat)` | Any participant | Fetches and returns `ParticipantInfo[]` snapshot for the active group call |
| `setRaiseHand(chat, raised)` | Any participant | Raises or lowers your own hand (`true` / `false`) |
| `muteParticipant(chat, participant, muted?)` | Group admin | Mutes or unmutes a participant (defaults to `muted = true`) |
| `setParticipantVolume(chat, participant, percent)` | Group admin / self | Sets participant volume (`0`–`200%`, mapped to Telegram's `0`–`20000` scale) |
| `editParticipant(chat, participant \| 'self', options)` | Varies | Full control over `EditParticipantOptions` |

### `EditParticipantOptions`

| Field | Type | Description |
|---|---|---|
| `muted` | `boolean` | Mute or unmute the participant |
| `volume` | `number` | Raw Telegram volume (`0`–`20000`, where `10000` = 100%) |
| `raiseHand` | `boolean` | Raise/lower hand |
| `videoStopped` | `boolean` | Stop participant's video |
| `videoPaused` | `boolean` | Pause participant's video |
| `presentationPaused` | `boolean` | Pause participant's screen share |

```ts
// Join as a channel
await tg.join('@mygroup', { kind: 'file', path: './podcast.mp3' }, {
  joinAs: '@mychannel',
});

// List participants
const participants = await tg.getParticipants('@mygroup');
for (const p of participants) {
  console.log(p.peer, 'ssrc:', p.source, 'muted:', p.muted);
}

// Raise hand
await tg.setRaiseHand('@mygroup', true);

// Admin moderation
await tg.muteParticipant('@mygroup', 123456789n, true);
await tg.setParticipantVolume('@mygroup', 123456789n, 150); // 150%
```
