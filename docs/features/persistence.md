# Persistence & Restart Recovery

`tgcalls-js` supports opt-in desired-state persistence so a music bot or recording daemon can survive process restarts and cleanly rejoin active group calls on startup.

## How It Works

1. Pass `statePath` to `new TgCallsClient(...)`.
2. Construction **never** auto-joins — you explicitly call `await tg.resumeFromState()` once your MTProto client is authorized and its updates loop is running.
3. For a planned restart, call `await tg.flushState()` and `await tg.dispose({ preserveState: true })`.

```ts
// --- Before restart ---
const tg = new TgCallsClient({
  client,
  statePath: './private/calls-state.json',
  persistence: {
    allowShell: false, // default: false (shell sources skipped unless explicitly opted in)
    maxBytes: 1024 * 1024, // default: 1 MiB
  },
  restore: {
    allowShell: false, // separate replay gate for shell sources
    resolveSource: async (chatId, source) => {
      // Optional hook to refresh expiring URLs (e.g., YouTube/CDN signed links)
      return source;
    },
  },
});

tg.on('persistenceError', (err) => {
  console.error('State error:', err.code, err.message);
});

await tg.play('@mygroup', { kind: 'file', path: './song.mp3' }, { autoLeave: false });
await tg.enqueue('@mygroup', { kind: 'file', path: './next.mp3' });

// Graceful shutdown while preserving desired calls
await tg.flushState();
await tg.dispose({ preserveState: true });

// --- After restart (new authorized MTProto client) ---
const restarted = new TgCallsClient({
  client: nextClient,
  statePath: './private/calls-state.json',
});

const report = await restarted.resumeFromState();
console.log(report);
// { restored: [-1001234567890n], skipped: [], failed: [] }
```

## What Is Persisted (and What Is Not)

| Persisted (`SavedGroup`) | Not Persisted |
|---|---|
| Group chat IDs (`group-rtc` & `group-viewer`) | 1-on-1 P2P sessions (never auto-redialed) |
| Current `AudioSource` (file, url, external; shell opt-in) | E2E Conference private keys & chain state |
| Playlist `queue` & `hold` track | RTMP stream keys / publishers |
| `muted`, `paused`, `autoLeave`, `inviteHash` | Native WebRTC sockets or SSRCs (freshly allocated on restore) |
| Active video (`camera` / `screen` + `VideoOptions`) | Exact mid-track playback timestamp (media restarts from beginning) |
| Active recording target (`path` or `{ dir, video }`) & segment index | Raw MTProto TL objects |

## Atomic Writes & Error Codes (`PersistenceError`)

State files are written via private temporary files, `fsync`, atomic `rename`, and conflict detection. Unknown schema versions are refused without overwriting the existing file.

| `PersistenceErrorCode` | Cause |
|---|---|
| `'INVALID_STATE'` | Corrupted or schema-invalid JSON |
| `'UNSUPPORTED_VERSION'` | State file has an unknown `version` number |
| `'STATE_TOO_LARGE'` | File exceeds `maxBytes` (default 1 MiB) before JSON parsing |
| `'IO_ERROR'` | Filesystem read/write failure |
| `'STATE_CONFLICT'` | Concurrent external modification detected |
| `'STATE_LOCKED'` | State file lock contention |

## Planned Shutdown vs Normal Leave

- Calling `tg.leave(chat)` removes that chat from the saved state file.
- Calling `tg.dispose()` (without `preserveState: true`) leaves all active calls and clears them from the state file.
- Calling `tg.dispose({ preserveState: true })` flushes the current snapshot first, suspends state removals during shutdown, and leaves the calls cleanly so `resumeFromState()` can restore them on the next boot.
