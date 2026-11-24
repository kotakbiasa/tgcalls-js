# Voice AI, Gemini Live & Frame Eksternal

`tgcalls-js` menyediakan **jembatan frame audio PCM & video I420 dua arah tanpa `ffmpeg`** di atas `MediaSource.EXTERNAL` milik `ntgcalls`, lengkap dengan **integrasi langsung Google Gemini Multimodal Live (`connectGeminiLive`)**, resampler PCM murni (`16kHz / 24kHz ↔ 48kHz`), deteksi aktivitas suara (`onVoiceActivity` VAD), pemotongan antrean bicara (*barge-in* `interruptAudio`), dan langganan frame video (`onVideoFrame` + `i420ToBmp`).

---

## 1. Integrasi Langsung Gemini Live (`connectGeminiLive`)

Hubungkan voice chat grup, panggilan P2P 1-lawan-1, atau konferensi E2E langsung ke WebSocket **Google Gemini Multimodal Live (`BidiGenerateContent`)**:

```ts
import { TgCallsClient } from 'tgcalls-js';

// 1. Masuk ke voice chat grup (atau panggilan P2P) dengan { kind: 'external' }
await tg.join('@grupku', {
  kind: 'external',
  sampleRate: 48000,
  channels: 1,
});

// 2. Sambungkan ke Gemini Live
const gemini = await tg.connectGeminiLive('@grupku', {
  apiKey: process.env.GEMINI_API_KEY!,
  model: 'models/gemini-2.5-flash-native-audio-latest',
  voiceName: 'Aoede', // 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir'
  enableInputTranscription: true,
  enableOutputTranscription: true,
  videoFrameIntervalMs: 2000, // opsional: kirim 1 frame kamera/layar tiap 2 detik ke Gemini!
  systemInstruction:
    'Kamu adalah asisten suara AI berbahasa Indonesia di Voice Chat Telegram. Jawab dengan ramah dan singkat.',
  onInputTranscription: (teks) => console.log('[Peserta]:', teks),
  onOutputTranscription: (teks) => console.log('[Gemini]:', teks),
  onInterrupted: () => console.log('[Gemini]: Dipotong oleh peserta (barge-in)'),
});

// Kirim pemicu teks awal agar Gemini langsung menyapa
gemini.sendText('Sapa semua orang di voice chat ini!');

// Tutup sesi Gemini Live saat selesai
await gemini.close();
```

### Apa yang Ditangani `connectGeminiLive` Secara Otomatis?

1. **Suara Masuk (`48 kHz → 16 kHz`):** Mengambil frame suara peserta Telegram lewat `onAudioFrame` dengan `targetSampleRate: 16000` dan mengirimkannya ke `realtimeInput.audio` Gemini Live.
2. **Suara Balasan AI (`24 kHz → 48 kHz`):** Menerima chunk `audio/pcm;rate=24000` dari Gemini, me-resample ke `48000 Hz`, memotongnya menjadi frame 10 ms, dan memasukkannya ke antrean `paced` menuju `ntgcalls`.
3. **Barge-In Instan:** Saat peserta menyela pembicaraan Gemini (`serverContent.interrupted: true`), otomatis memanggil `tg.interruptAudio(chat)` untuk membuang sisa suara yang belum terputar.
4. **Penglihatan Multimodal (`videoFrameIntervalMs`):** Mengubah frame video I420 dari kamera/screen share peserta menjadi BMP RGB 24-bit lewat `i420ToBmp()` dan mengirimkannya ke Gemini Live.

---

## 2. Pipeline Voice AI Kustom (`onAudioFrame`, `pushAudioFrame`, `interruptAudio`, `onVoiceActivity`)

Cocok untuk menyambungkan panggilan Telegram ke **OpenAI Realtime API**, **Deepgram**, **Whisper**, atau **ElevenLabs**:

```ts
// Terima audio masuk yang sudah otomatis di-downsample ke 16 kHz mono
const berhentiDengar = await tg.onAudioFrame('@grupku', (frame) => {
  // frame: { ssrc, pcm: Buffer, sampleRate: 16000, channels: 1, rms, timestampMs, peer? }
  sttStream.write(frame.pcm);
}, {
  sampleRate: 48000,
  targetSampleRate: 16000,
  channels: 1,
});

// Deteksi aktivitas bicara (VAD) + auto barge-in
const berhentiVad = await tg.onVoiceActivity('@grupku', (ev) => {
  console.log(ev.type, 'dari SSRC', ev.ssrc, 'rms:', ev.rms);
}, {
  thresholdRms: 0.015,
  speechFrames: 3,
  silenceFrames: 15,
  autoInterrupt: true, // otomatis panggil interruptAudio() saat peserta mulai bicara!
});

// Kirim audio TTS 24 kHz kembali ke panggilan (otomatis di-upsample ke 48 kHz & dipotong per 10ms)
await tg.pushAudioFrame('@grupku', ttsPcm24kBuffer, {
  inputSampleRate: 24000,
  sampleRate: 48000,
  channels: 1,
  paced: true,
});

// Potong antrean suara TTS kapan saja secara manual
await tg.interruptAudio('@grupku');
```

---

## 3. Menerima & Mengirim Frame Video (`onVideoFrame` & `pushVideoFrame`)

```ts
import { i420ToBmp } from 'tgcalls-js';

// Terima frame video kamera & screen share peserta
const offVideo = await tg.onVideoFrame('@grupku', (frame) => {
  // frame: { ssrc, device: 'camera' | 'screen', i420: Buffer, width, height, rotation, timestampMs, peer? }
  const bmp = i420ToBmp(frame.i420, frame.width, frame.height);
});

// Kirim frame video I420 (YUV420p) buatan sendiri ke panggilan
await tg.pushVideoFrame('@grupku', i420Buffer, {
  width: 640,
  height: 360,
  device: 'camera',
  rotation: 0,
});
```
