## 10. Data Validation & Security

### Client-Side Data

`tg.initDataUnsafe` gives you parsed user data, but it can be spoofed. **Always validate on your backend.**

```javascript
// Client: send initData to your backend
const response = await fetch("/api/your-endpoint", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": tg.initData, // raw string for validation
  },
  body: JSON.stringify({
    /* your payload */
  }),
});
```

### Server-Side Validation (HMAC-SHA256)

The backend must validate `initData` using the bot's token:

```
1. Parse initData as query string
2. Extract `hash` parameter, keep remaining fields
3. Sort remaining fields alphabetically
4. Create data_check_string = sorted fields joined with '\n' in "key=value" format
5. secret_key = HMAC_SHA256(bot_token, "WebAppData")
6. Compare: HMAC_SHA256(data_check_string, secret_key) == hash
7. Check auth_date for freshness
```

**Pseudocode:**

```
data_check_string = "auth_date=<auth_date>\nquery_id=<query_id>\nuser=<user>"
secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
if hex(HMAC_SHA256(data_check_string, secret_key)) == hash:
    # Data is genuine and from Telegram
```

### Third-Party Validation (Ed25519 Signatures)

For sharing data with third parties (who don't have your bot token), use the `signature` field with Telegram's public keys:

- **Production**: `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`
- **Test env**: `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`

### Bot API 10.2 Mini App Security Hardening (cross-origin)

**Bot API 10.2 (July 14, 2026)** hardened Mini App security by, in the official wording,
*"disallowing the usage of Mini App methods from origins different from the original Mini App domain."*

**This is already in force.** The protection was **automatically enabled for all Mini Apps on
July 20, 2026**, with an opt-out available through `@BotFather`. Verify against the
[official changelog](https://core.telegram.org/bots/api-changelog) — do not assume a method is
allowed just because it was callable in Bot API 9.x or 10.1.

Practical implications:

- **Serve all Mini App code from your registered Mini App domain.** Calls issued from any other
  origin — an embedded third-party iframe, a CDN-hosted widget on a different host, a local dev
  server on a different domain, a preview deployment on `*.vercel.app` when your Mini App domain
  is your own — are now rejected. This is the most common cause of "worked before the July 20
  rollout, broken now".
- Treat `Telegram.WebApp` client-side methods as a **UI convenience only**, not a security
  boundary. Methods that worked in older SDK versions may now be ignored or rejected when
  invoked cross-origin.
- **Always validate `initData` on the server side** (HMAC-SHA256 as above) for any
  security-sensitive flow — authentication, authorization, payments, or data mutation. Never
  rely solely on client-side `Telegram.WebApp` method return values to gate access.
- If a previously-working Mini App method silently stops responding in production, check the
  **origin of the calling document** first, before assuming a bug in your code.
- Keep your Mini App Web SDK (`telegram-web-app.js`) updated; the official script is the source
  of truth for which methods remain callable in which context.

> Note: earlier revisions of this document attributed this change to Bot API 10.1. That was
> incorrect — the cross-origin restriction landed in **10.2**. Bot API 10.1 (June 11, 2026)
> shipped Rich Messages, not Mini App hardening.

---
