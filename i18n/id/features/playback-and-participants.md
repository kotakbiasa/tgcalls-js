# Pemutaran, Antrean & Kontrol Peserta

`tgcalls-js` menyediakan fitur lengkap untuk bot musik Telegram, radio 24/7, dan asisten moderasi voice chat — mulai dari manajemen antrean, lagu tunggu (`playOnHold`), `seek`, filter equalizer (`setAudioFilter`), `idleTimeoutMs`, hingga kontrol judul room dan moderasi peserta.

---

## Manajemen Antrean (Playlist & Queue)

| Method | Signature | Perilaku |
|---|---|---|
| `play` | `(chat, source, options?) => Promise<JoinResult>` | Bergabung jika belum ada panggilan (`autoLeave: false`), atau langsung mengganti lagu yang sedang diputar tanpa keluar dari panggilan |
| `enqueue` / `then` | `(chat, source) => Promise<void>` | Menambahkan lagu ke urutan belakang antrean (langsung memutar jika panggilan sedang idle) |
| `playNext` | `(chat, source) => Promise<void>` | Menyisipkan lagu ke urutan paling depan antrean (`index 0`) untuk diputar tepat setelah lagu saat ini |
| `removeQueueTrack` | `(chat, index) => Promise<AudioSource \| null>` | Menghapus dan mengembalikan lagu pada posisi `index` (berbasis 0) |
| `moveQueueTrack` | `(chat, from, to) => Promise<boolean>` | Memindahkan urutan lagu di dalam antrean dari `from` ke `to` |
| `shuffleQueue` | `(chat) => Promise<AudioSource[]>` | Mengacak urutan antrean lagu (Fisher-Yates) |
| `skip` | `(chat) => Promise<void>` | Melompat ke lagu berikutnya di antrean (atau lagu hold). Menjeda pemutaran jika antrean kosong |
| `playOnHold` | `(chat, source \| null) => Promise<void>` | Memutar lagu latar berulang kali setiap kali antrean kosong (`null` untuk menghapus) |
| `clearQueue` | `(chat) => Promise<void>` | Mengosongkan antrean dan lagu hold (lagu yang sedang berjalan tetap diputar) |
| `getCurrent` | `(chat) => AudioSource \| null` | Mengecek lagu yang sedang diputar secara sinkron |
| `getQueue` | `(chat) => AudioSource[]` | Mengambil salinan daftar antrean secara sinkron |

```ts
await tg.play('@grupku', { kind: 'file', path: './lagu1.mp3' });
await tg.enqueue('@grupku', { kind: 'file', path: './lagu2.mp3' });
await tg.playNext('@grupku', { kind: 'file', path: './vip.mp3' });
await tg.shuffleQueue('@grupku');
await tg.playOnHold('@grupku', { kind: 'file', path: './lofi-hold.mp3' });
```

---

## Kontrol Pemutaran (`seek`, `setVolume`, `setSpeed`, `setLoop`)

Semua kontrol bekerja pada sumber `file` dan `url`, diterapkan langsung dari posisi detik saat ini (`time()`), serta mempertahankan kanal video kamera/presentasi yang sedang aktif:

```ts
await tg.seek('@grupku', 45);        // loncat ke detik 45
await tg.setVolume('@grupku', 140);  // volume 140% (rentang 0..200)
await tg.setSpeed('@grupku', 1.25);  // kecepatan 1.25x (rentang 0.5..2.0)
await tg.setLoop('@grupku', 'all');  // 'off' | 'one' | 'all'

console.log(tg.getPlaybackControls('@grupku'));
// { volume: 140, speed: 1.25, loop: 'all', filter: 'off' }
```

---

## Preset Efek Audio & Equalizer (`setAudioFilter`)

Terapkan filter audio `ffmpeg` secara real-time di tengah pemutaran lagu:

| Preset | Filter `ffmpeg` (`-af`) | Efek Suara |
|---|---|---|
| `'off'` | *(tanpa filter)* | Suara asli |
| `'bassboost'` | `equalizer=f=60:width_type=h:width=50:g=10` | Boost sub-bass +10 dB |
| `'nightcore'` | `asetrate=48000*1.25,aresample=48000` | Pitch & tempo naik 1.25× |
| `'vaporwave'` | `asetrate=48000*0.8,aresample=48000` | Pitch & tempo melambat 0.8× |
| `'8d'` | `apulsator=hz=0.125` | Efek suara berputar stereo 8D |
| `'karaoke'` | `stereotools=mlev=0.03` | Reduksi vokal tengah |
| `'treble'` | `equalizer=f=3000:width_type=h:width=1000:g=8` | Boost vokal/treble +8 dB |
| `'normalizer'` | `dynaudnorm=f=150:g=15` | Normalisasi keras-lembut suara otomatis |
| `'echo'` | `aecho=0.8:0.88:60:0.4` | Efek gema ruangan |
| `{ custom: string }` | String `-af` bebas | Rangkaian filter `ffmpeg` kustom pilihanmu |

```ts
await tg.setAudioFilter('@grupku', 'bassboost');
await tg.setAudioFilter('@grupku', 'nightcore');
await tg.setAudioFilter('@grupku', { custom: 'acompressor,dynaudnorm' });
await tg.setAudioFilter('@grupku', 'off');
```

---

## Otomatis Keluar Saat Idle (`idleTimeoutMs`)

Agar userbot tidak terus menggantung di voice chat kosong setelah semua lagu selesai, atur `idleTimeoutMs`:

```ts
const tg = new TgCallsClient({
  client,
  idleTimeoutMs: 180_000, // otomatis leave() jika 3 menit tidak ada lagu
});
```

---

## Manajemen Room Voice Chat & Kontrol Peserta

### Mengubah Judul, Link Undangan, Rekaman Native & Membubarkan Room

```ts
// Ubah judul Voice Chat (butuh admin)
await tg.setCallTitle('@grupku', '🎵 Sedang Memutar: Lofi Chill');

// Buat link undangan Voice Chat
const link = await tg.exportCallInvite('@grupku', { canSelfUnmute: true });

// Nyalakan/matikan rekaman native server Telegram (tersimpan ke Saved Messages)
await tg.toggleNativeRecording('@grupku', true, { title: 'Rekaman Podcast', video: true });
await tg.toggleNativeRecording('@grupku', false);

// Tutup/bubarkan Voice Chat untuk semua peserta (phone.discardGroupCall)
await tg.endGroupCall('@grupku');
```

### Moderasi Peserta & `joinAs`

```ts
// Bergabung sebagai channel
await tg.join('@grupku', { kind: 'file', path: './siaran.mp3' }, {
  joinAs: '@channelku',
});

// Ambil daftar peserta aktif
const daftar = await tg.getParticipants('@grupku');

// Angkat tangan (raise hand)
await tg.setRaiseHand('@grupku', true);

// Mute/unmute peserta & atur volume peserta (0..200%)
await tg.muteParticipant('@grupku', 123456789n, true);
await tg.setParticipantVolume('@grupku', 123456789n, 150);
```
