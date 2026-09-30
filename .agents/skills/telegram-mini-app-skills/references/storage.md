## 11. Storage APIs

### CloudStorage (Synced Across Devices)

Up to 1024 key-value pairs, 4096 bytes per value, synced via Telegram's servers:

```javascript
tg.CloudStorage.setItem("theme_pref", "dark", (err, success) => {});
tg.CloudStorage.getItem("theme_pref", (err, value) => {});
tg.CloudStorage.getItems(["key1", "key2"], (err, values) => {});
tg.CloudStorage.removeItem("theme_pref", (err, success) => {});
tg.CloudStorage.getKeys((err, keys) => {});
```

### DeviceStorage (Local Only, Bot API 9.0+)

Up to 5 MB, persists on device, similar to `localStorage`:

```javascript
tg.DeviceStorage.setItem("draft", longText);
tg.DeviceStorage.getItem("draft");
```

### SecureStorage (Encrypted, Bot API 9.0+)

Up to 10 items, uses OS Keychain (iOS) / Keystore (Android):

```javascript
tg.SecureStorage.setItem("auth_token", token);
tg.SecureStorage.getItem("auth_token");
```

---
