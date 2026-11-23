# Persistence & Restart Recovery

Long-running music bots, radio streams, and group recording daemons often need to survive process restarts or deployments. `tgcalls-js` provides an **opt-in, crash-safe desired-state store** (`statePath`) and an explicit `resumeFromState()` controller.

---

## Design Principles

1. **No surprise side effects:** Constructing `new TgCallsClient({ client, statePath })` **never** auto-joins calls. You explicitly decide when to call `await tg.resumeFromState()` after your MTProto client is connected and its updates loop is running.
2. **Desired intent only:** The JSON file stores high-level desired group state (chat IDs, media sources, queues, flags, recording targets) — never raw MTProto TL objects, native WebRTC sockets, P2P sessions, RTMP stream keys, or E2E conference private keys.
3. **Atomic, conflict-safe writes:** Every update writes to a private temporary file, calls `fsync`, and atomically renames it into place with conflict detection and size bounds (`maxBytes`, default 1 MiB). Unknown schema versions are rejected without overwriting the file.
4. **Two-gate shell safety:** Because `{ kind: 'shell', command }` executes arbitrary shell commands, persisting shell groups requires `persistence: { allowShell: true }` **and** replaying them requires `restore: { allowShell: true }`. By default, shell groups are skipped safely.

---

## Complete Restart Lifecycle Example

### Phase 1: Running & Planned Shutdown

```ts
const tg = new TgCallsClient({
  client,
  statePath: './private/tgcalls-state.json',
  persistence: {
    allowShell: false,    // default: false
    maxBytes: 1024 * 1024, // default: 1 MiB
  },
});

tg.on('persistenceError', (err) => {
  console.error(`[persistence] ${err.code}: ${err.message}`);
});

// Join, queue tracks, and optionally record
await tg.play('@mygroup', { kind: 'file', path: './track1.mp3' }, { autoLeave: false });
await tg.enqueue('@mygroup', { kind: 'file', path: './track2.mp3' });
await tg.startRecording('@mygroup', { dir: './recordings/group1', video: true });

// Graceful restart: flush latest snapshot and keep saved groups intact
process.once('SIGTERM', async () => {
  await tg.flushState();
  await tg.dispose({ preserveState: true });
  await client.disconnect();
  process.exit(0);
});
```

### Phase 2: Resuming After Restart

```ts
const restarted = new TgCallsClient({
  client: freshMtprotoClient,
  statePath: './private/tgcalls-state.json',
  restore: {
    allowShell: false,
    // Optional: refresh expiring CDN / YouTube URLs before rejoining
    resolveSource: async (chatId, source) => {
      if (source.kind === 'url' && isExpired(source.url)) {
        const freshUrl = await fetchFreshUrl(chatId, source.url);
        return { kind: 'url', url: freshUrl };
      }
      return source;
    },
  },
});

const report = await restarted.resumeFromState();
console.log('Restored chats:', report.restored); // bigint[]
console.log('Skipped chats:', report.skipped);   // e.g. already active or shell disabled
console.log('Failed chats:', report.failed);     // per-chat errors (other chats still restore)
```

---

## What Happens During `resumeFromState()`

For each saved group in the state file:
1. Skips chats that are already active or joining.
2. Refetches the current Telegram `InputGroupCall` (`allowCreate: false` — does not create a missing call by default).
3. Allocates fresh native SSRCs and joins with capture initially muted and paused.
4. Restores the playlist (`queue` + `hold`), video channel (`camera` or `screen`), `autoLeave`, `muted`, and `paused` states.
5. Reopens any saved recording target in a fresh segment/directory.
6. Media playback starts from the beginning of the saved current track.
7. If any step fails for one chat, that chat is rolled back cleanly (`leave()`) and recorded in `report.failed` without aborting the remaining chats.

---

## Persisted vs Non-Persisted State

| Persisted (`SavedGroup`) | Never Persisted |
|---|---|
| Group chat IDs (`group-rtc` & `group-viewer`) | 1-on-1 P2P calls (never auto-redialed) |
| Current `AudioSource` (`file`, `url`, `external`; `shell` opt-in) | E2E Conference private keys & chain blocks |
| Playlist `queue` and `hold` track | RTMP stream keys / `RtmpPublisher` instances |
| `muted`, `paused`, `autoLeave`, `inviteHash` | Native WebRTC sockets or SSRCs |
| Active video (`camera`/`screen` + `VideoOptions`) | Mid-track seek position |
| Active recording target (`path` or `{ dir, video }`) & segment | Raw MTProto TL objects |

---

## `dispose()` vs `dispose({ preserveState: true })`

| Call | Effect on `statePath` | When to use |
|---|---|---|
| `await tg.leave(chat)` | Removes `chat` from saved state | User explicitly asked bot to leave |
| `await tg.dispose()` | Leaves all calls and clears them from saved state | Permanent shutdown |
| `await tg.dispose({ preserveState: true })` | Flushes latest snapshot, suspends state deletions, then leaves calls cleanly | Planned restart / deploy (followed by `resumeFromState()`) |

---

## Error Codes (`PersistenceError`)

All persistence errors throw `PersistenceError` (and emit `persistenceError` on `TgCallsClient`). Error messages name schema locations only — never source URLs, shell commands, or file contents.

| `code` | Meaning |
|---|---|
| `'INVALID_STATE'` | Malformed JSON or failed schema validation |
| `'UNSUPPORTED_VERSION'` | File contains an unknown `version` (refused without overwriting) |
| `'STATE_TOO_LARGE'` | File exceeds `persistence.maxBytes` (default 1 MiB) |
| `'IO_ERROR'` | Filesystem open/read/write/rename failure |
| `'STATE_CONFLICT'` | File was modified concurrently by another process |
| `'STATE_LOCKED'` | State file lock could not be acquired |
