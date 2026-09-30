---
name: telegram-mini-app-skills
version: 2.1.0
description: "Comprehensive guide for developing Telegram Mini Apps with any web framework (React, Vue, Svelte, vanilla JS, etc.). Covers the Telegram Web App SDK, theming, UI components, navigation, data validation, and platform best practices."
metadata:
  {
    "openclaw":
      {
        "emoji": "📱",
      },
  }
---

# Telegram Mini App Development Guide

> **Official Reference**: [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps)

This skill is a **framework-agnostic** guide for building Telegram Mini Apps. Whether you use React, Vue, Svelte, Angular, Solid, or vanilla HTML/JS — this guide covers the universal SDK concepts, theming system, and best practices.

---


## Where things live

The full guide is split into `references/` — load only what the task needs:

- `references/fundamentals.md` — apa itu Mini App, loading SDK (script tag / npm / per-framework), `WebApp` object, init lifecycle (`ready()`, `expand()`).
- `references/theming.md` — semua CSS variables Telegram, golden rule theming, shorthand variable system, theme change listener.
- `references/ui-components.md` — BackButton, SettingsButton, MainButton, SecondaryButton (termasuk handler cleanup), haptic feedback, popups & alerts.
- `references/security.md` — validasi `initData` client/server (HMAC-SHA256), Ed25519 third-party validation, Bot API 10.2 hardening.
- `references/storage.md` — CloudStorage, DeviceStorage, SecureStorage.
- `references/layout.md` — full-screen mode, safe areas (system & content), safe area events.
- `references/events.md` — daftar event lengkap (themeChanged, viewportChanged, dll).
- `references/frameworks.md` — resep integrasi React, Vue, Svelte, vanilla JS.
- `references/design.md` — panduan desain Mini App.
- `references/testing-pitfalls.md` — testing, debugging (Eruda, devtools), dan 18 common pitfalls.
- `references/quick-reference.md` — ringkasan method yang paling sering dipakai.

## Quick rules

1. Selalu load SDK (`telegram-web-app.js` atau `@telegram-apps/sdk`), panggil `WebApp.ready()` setelah render pertama — tanpa itu WebView tetap blank.
2. Styling HARUS lewat CSS variables Telegram (`var(--tg-theme-bg-color)` dsb) — jangan hardcode warna.
3. JANGAN percaya `initData` di client — selalu validasi HMAC-SHA256 di server.
4. Handler tombol harus di-cleanup saat unmount/navigation (lihat `ui-components.md`).
5. Untuk kerangka apa pun: fundamentals → frameworks → lalu referensi spesifik sesuai fitur yang dibangun.

## Cakupan versi (update 2026-09-02, diverifikasi vs core.telegram.org/bots/webapps)

- Bot API **9.5**: `iconCustomEmojiId` di BottomButton → `ui-components.md`
- Bot API **9.6**: `requestChat(req_id)` (dialog pilih/buat chat, pasangan `savePreparedKeyboardButton`) → `quick-reference.md`
- Bot API **10.1** (11 Jun 2026): field `chat_join_request_query_id` di `WebAppInitData` — alur join-request via Mini App, bot menuntaskan dengan `answerChatJoinRequestQuery` → `quick-reference.md`
- Bot API **10.2/10.3**: tidak menambah API Mini App baru (fokus Rich Messages — lihat skill `telegram-rich-messages`); hardening cross-origin 10.2 sudah dicatat di `security.md`
- SDK npm `@telegram-apps/sdk` terbaru: **3.11.8** (Des 2025)
