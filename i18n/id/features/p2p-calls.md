# Panggilan P2P 1-lawan-1 & Preflight

`tgcalls-js` mendukung panggilan suara dan video 1-lawan-1 terenkripsi end-to-end (E2E) Telegram di **kedua arah** (menerima panggilan masuk & melakukan panggilan keluar), lengkap dengan pengecekan preflight tanpa dering, verifikasi kunci 4-emoji, dan perekaman media lawan bicara.

---

## Cek Kelayakan Tanpa Membunyikan Dering (Preflight)

Gunakan `getCallDenialReason()` atau `canRequestCall()` sebelum menelepon seseorang untuk memeriksa apakah panggilan diizinkan berdasarkan flag profil/privasi terbaru tanpa mengirim RPC `phone.requestCall`:

```ts
const alasan = await tg.getCallDenialReason('@alice', { video: true });
if (alasan !== null) {
  console.log(`Tidak bisa menelepon @alice: ${alasan}`);
} else {
  await tg.callUser('@alice', { video: true });
}
```

### Daftar Nilai `CallDenialReason`

| Nilai | Arti |
|---|---|
| `'INVALID_USER'` | Referensi user tidak valid (`<= 0`) |
| `'ADAPTER_UNSUPPORTED'` | Adapter kustom belum mengimplementasikan `getCallEligibility` |
| `'SESSION_UNAVAILABLE'` | Identitas sesi saat ini belum terbaca |
| `'BOT_ACCOUNT'` | Sesi yang dipakai adalah akun bot (bot tidak bisa menelepon) |
| `'SELF_CALL'` | Target panggilan adalah akun sendiri |
| `'USER_IS_BOT'` | Target yang ditelepon adalah bot Telegram |
| `'USER_DELETED'` | Akun target sudah dihapus |
| `'USER_BLOCKED'` | Akun target diblokir |
| `'PRIVACY_RESTRICTED'` | Pengaturan privasi target menolak panggilan dari akunmu |
| `'CALLS_UNAVAILABLE'` | Target tidak mendukung panggilan suara |
| `'VIDEO_UNAVAILABLE'` | Target tidak mendukung panggilan video (saat `{ video: true }`) |

---

## Menerima Panggilan Masuk (`listenCalls`)

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './sapaan.mp3' },
  video: { width: 640, height: 360, fps: 25 },
  autoAccept: false,
  onIncoming: ({ userId, callId }) => {
    console.log(`Panggilan masuk ${callId} dari ${userId}`);
    return daftarPutih.has(userId); // return false untuk menolak
  },
  record: { path: './rekaman/p2p-remote.mp4', video: true },
  debug: false,
});
```

---

## Melakukan Panggilan Keluar (`callUser`)

`callUser()` membutuhkan `listenCalls()` aktif terlebih dahulu karena listener tersebut menangani proses `PhoneCallAccepted` → `exchangeKeys` → `phone.confirmCall`:

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './halo.mp4' },
  video: { width: 640, height: 360, fps: 25 },
});

const callId = await tg.callUser('@alice', {
  video: true,
  record: { path: './rekaman/alice.mp4', video: true },
});
```

---

## Verifikasi Kunci E2E (4-Emoji Fingerprint)

```ts
tg.on('connectionChange', async (peerId, state) => {
  if (state === 2) { // ConnectionState.CONNECTED
    const emoji = await tg.getEmojiFingerprint(peerId);
    console.log(`Terhubung dengan ${peerId} — Emoji E2E: ${emoji}`); // mis. "🐧🏦🔬2⃣"
  }
});
```

> **Ingat untuk pengguna `@mtcute/node`:** Panggil `await client.start()`, bukan `client.connect()`, agar event `updatePhoneCall` berjalan.
