# Roadmap APIs (unreleased)

These APIs are available on the roadmap branch and are not part of the `v0.8.0` tag. Read [the roadmap](ROADMAP.md) for fixture evidence, live gates and native blockers.

## P2P preflight and recording

```ts
const reason = await tg.getCallDenialReason(peer, { video: true });
const allowed = await tg.canRequestCall(peer, { video: true });
// No ringing RPC is made by either preflight call.
await tg.listenCalls({ source: { kind: 'file', path: './tone.mp3' } });
await tg.callUser(peer, {
  video: true,
  record: { path: './remote.mp4', video: true },
});
```

A preflight uses the latest profile/session flags and can become stale before dialing. Denial reasons include invalid/self/bot/deleted peers, missing user session, blocking/privacy restrictions, and unavailable audio/video calls. Unknown network failures reject. `callUser` still needs `listenCalls` so update/signaling handlers are running.

`OutgoingCallOptions.record` inherits the listener default when omitted, disables it with `false`, or replaces it with a path/`CallRecordOptions`. Concurrent calls cannot use the same active target. P2P recording captures the remote media, not a mix with the local source.

## Participant folder recording

```ts
await tg.joinIdle(group);
tg.on('recordingStopped', (chatId, info) => {
  // info: path, peer?, device, segment, reason, status, error?
  // Only status === 'saved' means a closed and validated folder artifact.
});
tg.on('recordingError', (chatId, error) => console.error(error));
await tg.startRecording(group, { dir: './recordings', video: true });
const folder = await tg.stopRecording(group);
```

`FolderRecordingTarget` accepts `dir`, `video`, `sampleRate` (default 48000), and `channels` (1 or 2, default 1). Each peer kind/id, device, endpoint and resolution change receives a new segment. Microphone output is WAV; camera/screen output is H.264/AAC MP4. A manifest records identity, SSRC, segment timing, dropped frames and finalization status.

The recorder obtains all participant pages and follows MTProto deltas. `remoteSourceChange` retains native enum fields `ssrc`, `device`, `state` and adds optional `peer`, `endpoint`, `origin`. Group updates use `origin:'mtproto'`; a removed source maps to `StreamStatus.IDLING`. Native P2P source notifications do not identify group participants.

Only one PLAYBACK recording sink owns a group at a time. Starting another recording stops the previous one. Unified RTMP viewer media cannot be attributed per participant and is rejected for folder recording. Mixed audio recording with a string path remains available separately.

Folder `stopRecording` and group `leave` drain accepted frames, close writers, probe files and emit results before returning. Disk/encoder/probe failures remain observable; failed recovery sources are retained. Camera/screen uses a local monotonic arrival timeline with CFR output; native audio and video timestamp fields are not assumed to share a clock. Live AV-sync acceptance is still open.

## RTMP publication and stream viewing

```ts
// Fetching does not revoke the existing key. Never log this result.
const endpoint = await tg.getStreamRtmpUrl(group);
const publisher = await tg.joinRtmp(group, endpoint.url, endpoint.key);
await publisher.play({ kind: 'file', path: './clip.mp4' }, { width: 640, height: 360, fps: 25 });
publisher.queue({ kind: 'file', path: './next.mp4' });
publisher.hold({ kind: 'file', path: './hold.mp4' });
await publisher.skip();
await publisher.stop();

const viewer = await secondClient.joinStreamMode(group);
// viewer.mode: 'RTMP' | 'STREAM'; server chooses the actual transport.
await secondClient.leave(group);
```

`joinRtmp(chat,url,key,options)` prepares a publisher. It starts encoding only when `play()` is called, or when `options.source` is supplied. Existing ordinary voice chats are refused. `allowCreate:true` permits creation of a missing RTMP call, not conversion of an active RTC call. Files and URLs are accepted; caller-owned raw PCM shell sources are refused for RTMP.

The publisher uses ffmpeg H.264/AAC in FLV. State is `ready`, `starting`, `publishing`, `reconnecting`, `paused`, `stopped` or `failed`. Readiness requires encoder progress. `reconnect:{maxAttempts,maxDelayMs,baseDelayMs?}` bounds retries and restarts the current source from its beginning. POSIX pause/resume suspends/resumes the process; a long pause may expire the server connection. `close()` permanently closes the publisher. `dispose()` closes owned publishers.

`joinStreamMode(chat,{requireStream:true})` joins muted with the original native payload, downloads segments from the exact media DC and supplies replies to the native decoder. If the server selects RTC it rolls back and rejects. Set `requireStream:false` to explicitly allow RTC. There is no invented MTProto flag that forces STREAM mode. `broadcastError` reports failed downloads/recovery. Native broadcast download callbacks are separate from RTMP uploading.

## Experimental conference core

```ts
const handle = await tg.createConference({ source: { kind: 'file', path: './tone.mp3' } });
const link = await tg.exportConferenceInvite(handle);
const other = await secondClient.joinConference({ slug: 'invite_slug' });
await tg.inviteConferenceParticipants(handle, [peer], { video: false }); // rings peer
const emojiDisplay = await tg.getEmojiFingerprint(handle);
const capabilities = tg.getConferenceCapabilities();
await tg.leaveConference(handle);
```

`ConferenceRef` is `{slug}`, `{inviteMessageId}` or `{id,accessHash}`. `ConferenceHandle` is distinct from a group `ChatRef`; its native ID follows a fresh generation on recovery. Options include source, video, muted, videoStopped and cancellation signal. Capture is installed after native conference initialization. Private native keys and signed blocks are never synthesized by the wrapper.

`activeConferences()` lists active handles. `conferenceError` reports asynchronous chain/poll failures. `getEmojiFingerprint(handle)` returns a native display value or null while pending; it is not an attestation of chain health or current cryptographic conformance.

On `ntgcalls@3.0.7`, `removeConferenceParticipants`, `rekeyConference`, and `sendConferenceMessage` reject `UnsupportedNativeCapabilityError`. Encrypted application decoding and crypto-health are also unavailable. The wrapper has no plaintext or JavaScript crypto fallback. `getConferenceCapabilities()` reports these limits and `fullSecurityConformance:false`, `liveVerified:false`. Two-account Telegram audio/video and emoji validation remain open.

## Explicit restart recovery

```ts
const tg = new TgCallsClient({ client, statePath: './private/calls.json' });
await tg.play(group, { kind: 'file', path: './song.mp3' }, { autoLeave: false });
await tg.enqueue(group, { kind: 'file', path: './next.mp3' });
await tg.flushState();
await tg.dispose({ preserveState: true });

// New authorized MTProto client with its own running updates loop:
const restarted = new TgCallsClient({ client: nextClient, statePath: './private/calls.json' });
const { restored, skipped, failed } = await restarted.resumeFromState();
```

Construction never rejoins. The private versioned file stores desired group chats, current source, queue/hold, mute/pause, video settings and recording targets. Writes use private temporary files, fsync, atomic rename and conflict detection. Unknown schema versions are refused without overwriting the file. `persistenceError` makes errors observable.

Restore refetches current group calls, uses fresh native SSRCs, mutes/pauses capture before connecting, restores the queue, and opens recording in a fresh segment/directory. It starts media from the beginning. `restore.resolveSource` can refresh expiring URLs. Persisting shell sources requires `persistence.allowShell:true`; replaying them separately requires `restore.allowShell:true`. The default skips shell groups.

`dispose()` normally removes groups explicitly left; use `preserveState:true` for a planned restart. P2P sessions, conference private keys, native sockets and RTMP keys are not persisted or automatically redialed. `resumeFromState` returns per-chat results and does not create a missing group call by default.
