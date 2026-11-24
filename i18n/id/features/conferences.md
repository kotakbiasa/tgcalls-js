# Konferensi Grup E2E

**Konferensi Grup (Group Conference)** Telegram adalah panggilan multi-peserta terenkripsi end-to-end di mana seluruh peserta memelihara rantai blok (*subchain*) keanggotaan yang ditandatangani secara kriptografis dan menghasilkan 4-emoji fingerprint bersama.

---

## Matriks Kemampuan Native (`ntgcalls` 3.0.7 vs 4.0.0+)

Gunakan `tg.getConferenceCapabilities()` untuk memeriksa kemampuan binary `ntgcalls` saat runtime:

| Kemampuan | `ntgcalls@3.0.7` | `ntgcalls >= 4.0.0-alpha03` | Keterangan |
|---|---|---|---|
| `coreLifecycle` (buat, gabung, undang, subchain, audio/video, emoji fingerprint) | ✅ Didukung | ✅ Didukung | Terverifikasi live dengan 2 akun |
| `applicationEncryption` (`sendConferenceMessage` / `conferenceMessage`) | ❌ Melempar `UnsupportedNativeCapabilityError` | ✅ Otomatis aktif | Memakai `encryptMessage` / `decryptMessage` native |
| `removeParticipants` / `rekey` | ❌ Menunggu upstream | ❌ Menunggu upstream | Tidak pernah fallback ke plaintext |

---

## Contoh Lengkap Konferensi 2 Akun

```ts
// Host membuat konferensi & mengekspor link undangan
const hostHandle = await host.createConference({
  source: { kind: 'file', path: './audio-host.mp3' },
});
const inviteUrl = await host.exportConferenceInvite(hostHandle);
console.log('Link undangan:', inviteUrl);

// Undang user tertentu (membunyikan dering telepon)
await host.inviteConferenceParticipants(hostHandle, ['@alice'], { video: false });

// Peserta kedua bergabung lewat slug
const slug = inviteUrl.split('/').pop()!;
const guestHandle = await guest.joinConference({ slug }, {
  source: { kind: 'file', path: './audio-tamu.mp3' },
});

// Bandingkan 4-emoji E2E fingerprint di kedua sisi
const emojiHost = await host.getEmojiFingerprint(hostHandle);
const emojiGuest = await guest.getEmojiFingerprint(guestHandle);
console.log('Fingerprint cocok:', emojiHost === emojiGuest, emojiHost);

// Keluar dari konferensi
await guest.leaveConference(guestHandle);
await host.leaveConference(hostHandle);
```

---

## Pesan Terenkripsi E2E di Dalam Konferensi (`ntgcalls >= 4.0.0-alpha03`)

```ts
if (tg.getConferenceCapabilities().applicationEncryption) {
  tg.on('conferenceMessage', (event) => {
    console.log(`Pesan dari ${event.fromUserId}:`, event.text ?? event.raw);
  });

  await tg.sendConferenceMessage(hostHandle, 'Halo konferensi E2E!');
}
```
