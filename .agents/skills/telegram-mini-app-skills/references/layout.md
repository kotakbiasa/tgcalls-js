## 12. Full-Screen Mode

Available since Bot API 8.0 (November 2024). Allows the Mini App to use the entire screen:

```javascript
// Enter full-screen
tg.requestFullscreen();

// Exit full-screen
tg.exitFullscreen();

// Check status
console.log(tg.isFullscreen);

// Listen for changes
tg.onEvent("fullscreenChanged", () => {
  console.log("Fullscreen:", tg.isFullscreen);
});

tg.onEvent("fullscreenFailed", (event) => {
  console.log("Fullscreen failed:", event.error);
});
```

> **Important**: When in full-screen mode, you **must** handle safe areas to avoid content overlapping with system UI elements (notch, status bar, etc.).

---

## 13. Safe Areas

Two types of safe areas to handle, especially critical in full-screen mode:

### System Safe Area (notch, status bar, home indicator)

```css
.content {
  padding-top: var(--tg-safe-area-inset-top, 0px);
  padding-bottom: var(--tg-safe-area-inset-bottom, 0px);
  padding-left: var(--tg-safe-area-inset-left, 0px);
  padding-right: var(--tg-safe-area-inset-right, 0px);
}
```

### Content Safe Area (Telegram's own header, bottom bar)

It is highly recommended in frameworks like React/Next.js to avoid applying these to the raw document `body`, as Telegram's Webview injection can cause `100vw` or scaling constraints to clip or shrink off-screen horizontally.

Instead, the most bulletproof approach across all Webview versions involves a hybrid Javascript-to-CSS fallback. Combining `contentSafeAreaInset.top` (Telegram UI) and `safeAreaInset.top` (Mobile Device Notches) prevents overlap completely:

**1. Calculate and combine the padding natively in your Telegram Initialization loop:**

```javascript
// Add base safeArea (device notches) + contentSafe (Telegram header ui) together
// Apply a hard fallback (e.g., 48px) just in case Telegram fails to inject variables entirely
const top = Math.max(
  48,
  (tg.contentSafeAreaInset?.top || 0) + (tg.safeAreaInset?.top || 0),
);
const bottom = Math.max(
  32,
  (tg.contentSafeAreaInset?.bottom || 0) + (tg.safeAreaInset?.bottom || 0),
);

// Explicitly inject safe bounds into your root HTML variables
document.documentElement.style.setProperty("--safe-top", `${top}px`);
document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
```

**2. In your CSS (like `globals.css` or Tailwind config), reference the injected variables:**

```css
:root {
  /* You can optionally add env() fallbacks here if you want native browser backup */
  --safe-top: env(safe-area-inset-top, 48px);
  --safe-bottom: env(safe-area-inset-bottom, 32px);
}
```

**3. Finally, in your React individual Page wrappers padding:**

```tsx
<main
  style={{
    // Add your desired extra padding (e.g., 1rem) to the base safe area boundary mathematically
    paddingTop: "calc(1rem + var(--safe-top))",
    paddingBottom: "calc(2rem + var(--safe-bottom))",
  }}
>
  {/* Content goes here safely below the Close/Settings notch */}
</main>
```

### Listening for Safe Area Changes

```javascript
tg.onEvent("safeAreaChanged", () => {
  // System safe area changed (e.g., orientation change)
});

tg.onEvent("contentSafeAreaChanged", () => {
  // Telegram UI safe area changed
});
```

---
