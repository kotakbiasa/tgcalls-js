## 15. Framework Integration Recipes

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--tg-theme-bg-color, #fff);
        color: var(--tg-theme-text-color, #000);
      }
      .card {
        background: var(--tg-theme-section-bg-color, #f5f5f5);
        border-radius: 14px;
        padding: 16px;
        margin: 16px;
      }
      .hint {
        color: var(--tg-theme-hint-color, #999);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hello, <span id="username">User</span>!</h1>
      <p class="hint">Welcome to the Mini App</p>
    </div>
    <script>
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      const user = tg.initDataUnsafe?.user;
      if (user) {
        document.getElementById("username").textContent = user.first_name;
      }

      tg.MainButton.setText("DONE");
      tg.MainButton.show();
      tg.MainButton.onClick(() => {
        tg.HapticFeedback.notificationOccurred("success");
        tg.close();
      });
    </script>
  </body>
</html>
```

---

### React / Next.js

```tsx
// hooks/useTelegram.ts — Reusable hook
import { useEffect, useState, useCallback } from "react";

export function useTelegram() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      const webapp = window.Telegram.WebApp;
      webapp.ready();
      webapp.expand();
      setTg(webapp);
      setUser(webapp.initDataUnsafe?.user || null);
    }
  }, []);

  const showMainButton = useCallback(
    (text: string, onClick: () => void) => {
      if (!tg) return;
      tg.MainButton.setText(text);
      tg.MainButton.show();
      tg.MainButton.onClick(onClick);
      return () => tg.MainButton.offClick(onClick);
    },
    [tg],
  );

  const showBackButton = useCallback(
    (onClick: () => void) => {
      if (!tg) return;
      tg.BackButton.show();
      tg.BackButton.onClick(onClick);
      return () => {
        tg.BackButton.offClick(onClick);
        tg.BackButton.hide();
      };
    },
    [tg],
  );

  return { tg, user, showMainButton, showBackButton };
}
```

```tsx
// pages/MyPage.tsx
"use client";
import { useEffect } from "react";
import { useTelegram } from "@/hooks/useTelegram";

export default function MyPage() {
  const { tg, user, showBackButton } = useTelegram();

  useEffect(() => {
    return showBackButton?.(() => window.history.back());
  }, [showBackButton]);

  return (
    <main style={{ background: "var(--tg-theme-secondary-bg-color)" }}>
      <h1 style={{ color: "var(--tg-theme-text-color)" }}>
        Hello, {user?.first_name}!
      </h1>
    </main>
  );
}
```

#### Next.js Layout Setup

```tsx
// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
```

> **`suppressHydrationWarning`** is required because Telegram's script injects style attributes into the DOM during SSR/hydration.

---

### Vue 3 / Nuxt

```vue
<!-- composables/useTelegram.ts -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const tg = ref<any>(null);
const user = ref<any>(null);

export function useTelegram() {
  onMounted(() => {
    if (window.Telegram?.WebApp) {
      tg.value = window.Telegram.WebApp;
      tg.value.ready();
      tg.value.expand();
      user.value = tg.value.initDataUnsafe?.user || null;
    }
  });

  function showBackButton(onClick: () => void) {
    tg.value?.BackButton.show();
    tg.value?.BackButton.onClick(onClick);
    onUnmounted(() => {
      tg.value?.BackButton.offClick(onClick);
      tg.value?.BackButton.hide();
    });
  }

  return { tg, user, showBackButton };
}
</script>
```

```vue
<!-- pages/MyPage.vue -->
<template>
  <main :style="{ background: 'var(--tg-theme-secondary-bg-color)' }">
    <h1 :style="{ color: 'var(--tg-theme-text-color)' }">
      Hello, {{ user?.first_name }}!
    </h1>
  </main>
</template>

<script setup lang="ts">
import { useTelegram } from "@/composables/useTelegram";
import { useRouter } from "vue-router";

const { user, showBackButton } = useTelegram();
const router = useRouter();

showBackButton(() => router.back());
</script>
```

---

### Svelte / SvelteKit

```svelte
<!-- lib/telegram.ts -->
<script context="module" lang="ts">
  export function getTelegram() {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      return window.Telegram.WebApp;
    }
    return null;
  }
</script>
```

```svelte
<!-- routes/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getTelegram } from '$lib/telegram';

  let user: any = null;

  onMount(() => {
    const tg = getTelegram();
    if (tg) {
      tg.ready();
      tg.expand();
      user = tg.initDataUnsafe?.user;

      tg.BackButton.show();
      tg.BackButton.onClick(() => history.back());
    }
  });

  onDestroy(() => {
    const tg = getTelegram();
    tg?.BackButton.hide();
  });
</script>

<main style="background: var(--tg-theme-secondary-bg-color); color: var(--tg-theme-text-color);">
  <h1>Hello, {user?.first_name ?? 'User'}!</h1>
</main>
```

#### SvelteKit Layout

```html
<!-- src/app.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    %sveltekit.head%
  </head>
  <body>
    %sveltekit.body%
  </body>
</html>
```

---
