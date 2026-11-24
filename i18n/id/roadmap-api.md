# Ringkasan Extended API (v0.4.0+)

Ringkasan cepat seluruh API lanjutan yang dirilis di `v0.4.0`. Untuk tabel parameter lengkap dan contoh kode siap jalan, buka panduan fitur masing-masing:

- [Panggilan Suara & Video Grup](features/group-calls.md)
- [Pemutaran, Antrean & Kontrol Peserta](features/playback-and-participants.md)
- [Panggilan P2P 1-lawan-1 & Preflight](features/p2p-calls.md)
- [Perekaman (Gabungan & Per-Peserta)](features/recording.md)
- [Streaming RTMP & Penonton Siaran](features/rtmp-and-streams.md)
- [Konferensi Grup E2E](features/conferences.md)
- [Voice AI, Gemini Live & Frame Eksternal](features/external-frames.md)
- [Persistensi & Pemulihan Restart](features/persistence.md)

## Sekilas Cuplikan Kode

### Gemini Multimodal Live Voice AI

```ts
await tg.join('@grupku', { kind: 'external', sampleRate: 48000, channels: 1 });
const gemini = await tg.connectGeminiLive('@grupku', {
  apiKey: process.env.GEMINI_API_KEY!,
  voiceName: 'Aoede',
  enableInputTranscription: true,
  enableOutputTranscription: true,
});
```

### Perekaman Folder Per-Peserta

```ts
await tg.joinIdle('@grupku');
await tg.startRecording('@grupku', { dir: './rekaman', video: true });
const folder = await tg.stopRecording('@grupku');
```

### Publisher RTMP & Penonton Siaran

```ts
const { url, key } = await tg.getStreamRtmpUrl('@channelku');
const pub = await tg.joinRtmp('@channelku', url, key, { allowCreate: true });
await pub.play({ kind: 'file', path: './video.mp4' });
```
