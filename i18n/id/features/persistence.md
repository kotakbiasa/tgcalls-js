# Persistensi & Pemulihan Restart

Bot musik, radio streaming, dan daemon perekam sering kali harus bertahan melewati proses restart atau deploy ulang. `tgcalls-js` menyediakan penyimpanan state atomik opsional (`statePath`) dan pemulihan eksplisit lewat `resumeFromState()`.

---

## Cara Penggunaan

1. Berikan `statePath` saat membuat `new TgCallsClient({ client, statePath })`.
2. Konstruktor **tidak pernah** otomatis bergabung ke panggilan — kamu memanggil `await tg.resumeFromState()` secara eksplisit setelah client MTProto terhubung.
3. Saat akan restart terencana, panggil `await tg.flushState()` lalu `await tg.dispose({ preserveState: true })`.

```ts
// --- Sebelum restart ---
const tg = new TgCallsClient({
  client,
  statePath: './private/calls-state.json',
});

tg.on('persistenceError', (err) => {
  console.error('Error state:', err.code, err.message);
});

await tg.play('@grupku', { kind: 'file', path: './lagu1.mp3' });
await tg.enqueue('@grupku', { kind: 'file', path: './lagu2.mp3' });

// Shutdown terencana (menyimpan state grup aktif)
await tg.flushState();
await tg.dispose({ preserveState: true });

// --- Setelah restart ---
const restarted = new TgCallsClient({
  client: clientBaru,
  statePath: './private/calls-state.json',
});

const laporan = await restarted.resumeFromState();
console.log('Berhasil dipulihkan:', laporan.restored);
```

---

## Apa yang Disimpan vs Tidak Disimpan

| Disimpan (`SavedGroup`) | Tidak Pernah Disimpan |
|---|---|
| ID chat grup (`group-rtc` & `group-viewer`) | Sesi telepon P2P 1-lawan-1 |
| `AudioSource` aktif (`file`, `url`, `external`; `shell` opt-in) | Kunci privat & blok subchain Konferensi E2E |
| Antrean `queue` dan lagu `hold` | Stream key RTMP / instance `RtmpPublisher` |
| Status `muted`, `paused`, `autoLeave`, `inviteHash` | Socket WebRTC native atau SSRC lama |
| Pengaturan video (`camera`/`screen` + `VideoOptions`) | Posisi detik di tengah lagu (dimulai ulang dari awal lagu) |
| Target perekaman aktif (`path` atau `{ dir, video }`) & nomor segmen | Objek mentah TL MTProto |
