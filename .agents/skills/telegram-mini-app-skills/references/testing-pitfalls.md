## 17. Testing & Debugging

### Development Environment

1. **Run your dev server** on `localhost`
2. **Expose via HTTPS tunnel**: `ngrok http 3000` (or Cloudflare Tunnel, localtunnel, etc.)
3. **Configure BotFather**:
   - Create/select your bot
   - Set the Web App URL via `/setmenubutton` or `/newapp`
4. **Open in Telegram** and test

### Debugging Tips

| Platform         | Method                                                                      |
| :--------------- | :-------------------------------------------------------------------------- |
| **Android**      | Enable WebView debugging in Android Developer Settings → `chrome://inspect` |
| **iOS**          | Safari → Develop → your device → your WebView                               |
| **Desktop**      | Right-click inside Mini App → "Inspect Element" (on some builds)            |
| **Telegram Web** | Regular browser DevTools                                                    |

### Testing Outside Telegram

Wrap all `tg` calls with a safety check. Provide fallback UI for development:

```javascript
const tg = window.Telegram?.WebApp;
const isInTelegram = !!tg?.initData;

if (isInTelegram) {
  tg.ready();
  tg.MainButton.show();
} else {
  // Show a regular HTML button instead for local testing
  console.log("Running outside Telegram — showing fallback UI");
}
```

---

## 18. Common Pitfalls

| Pitfall                                 | Solution                                                                                                   |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| Colors look wrong in Telegram           | Use `--tg-theme-*` CSS variables, never hardcode                                                           |
| App stuck on loading spinner            | Call `tg.ready()` after initial render                                                                     |
| MainButton not responding               | Always `offClick(handler)` before registering new handler                                                  |
| iOS zooms in on input focus             | Set input `font-size` to ≥ 16px                                                                            |
| SSR hydration errors (Next.js, Nuxt)    | Add `suppressHydrationWarning` to `<html>` tag                                                             |
| initData is empty                       | App was launched via keyboard button (expected) — handle gracefully                                        |
| API calls return 403                    | Validate `initData` correctly on server; check `auth_date` freshness                                       |
| Stale state in button handlers          | Use refs (React) or reactive getters (Vue) — handlers capture closure variables                            |
| Content hidden behind MainButton        | Add bottom padding (~80–100px) to main content                                                             |
| Safe area content overlap in fullscreen | Use `--tg-safe-area-inset-*` and `--tg-content-safe-area-inset-*` CSS variables                            |
| `window.Telegram` is undefined          | SDK script not loaded yet — ensure it loads before your app code                                           |
| Double-click on MainButton              | Disable button and show progress immediately on click                                                      |
| Theme not updating dynamically          | Listen to `themeChanged` event; CSS variables update automatically                                         |
| Clipboard API not working               | Use `tg.readTextFromClipboard()`, not the browser Clipboard API                                            |
| File download not working on web        | Include `Content-Disposition` and `Access-Control-Allow-Origin: https://web.telegram.org` response headers |

---
