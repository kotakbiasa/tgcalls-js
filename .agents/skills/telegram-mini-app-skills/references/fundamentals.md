## 1. What is a Telegram Mini App?

Telegram Mini Apps are **web applications** (HTML, CSS, JavaScript) that run inside the Telegram messenger. They can be launched from:

- **Bot menus** — via BotFather's menu button configuration
- **Inline buttons** — `web_app` type in bot messages
- **Attachment menu** — bot added to the attachment menu
- **Direct links** — `t.me/botname/appname`
- **Keyboard buttons** — `web_app` type keyboard buttons
- **Home screen shortcuts** — users can add Mini Apps to their home screen

**Key characteristics:**

- Must be served over **HTTPS**
- Run in a WebView on all platforms (iOS, Android, Desktop, Web)
- Can access Telegram user data, theme, and native UI components
- Associated with a bot created via [@BotFather](https://t.me/BotFather)

---

## 2. Loading the SDK

### Option A: Script Tag (All Frameworks)

Place this in your `<head>` **before any other scripts**:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

This creates the `window.Telegram.WebApp` object and automatically injects CSS variables for theming.

### Option B: npm Packages

For modern JavaScript projects with bundlers:

```bash
# Official community SDK (TypeScript-first, tree-shakeable)
npm install @telegram-apps/sdk

# Alternative lightweight wrapper
npm install @twa-dev/sdk
```

### Framework-Specific Loading

| Framework              | How to Load                                                                                          |
| :--------------------- | :--------------------------------------------------------------------------------------------------- |
| **Vanilla HTML**       | `<script>` tag in `<head>`                                                                           |
| **React / Next.js**    | `<Script src="..." strategy="beforeInteractive" />` via `next/script`, or `<script>` in `index.html` |
| **Vue / Nuxt**         | `<script>` in `index.html`, or Nuxt plugin with `useHead()`                                          |
| **Svelte / SvelteKit** | `<svelte:head>` tag or `app.html`                                                                    |
| **Angular**            | Add to `angular.json` `scripts` array or `index.html`                                                |

---

## 3. The WebApp Object

Once the SDK is loaded, the main API is available at:

```javascript
const tg = window.Telegram.WebApp;
```

### Key Properties

| Property               | Type      | Description                                                                       |
| :--------------------- | :-------- | :-------------------------------------------------------------------------------- |
| `initData`             | `string`  | Raw init data string for backend validation                                       |
| `initDataUnsafe`       | `object`  | Parsed init data (user, chat, etc.) — **not validated, do not trust client-side** |
| `version`              | `string`  | SDK version (e.g., `"8.0"`)                                                       |
| `platform`             | `string`  | Platform identifier (`"android"`, `"ios"`, `"tdesktop"`, `"web"`, `"unknown"`)    |
| `colorScheme`          | `string`  | `"light"` or `"dark"`                                                             |
| `themeParams`          | `object`  | Current theme colors as key-value pairs                                           |
| `isExpanded`           | `boolean` | Whether the Mini App is expanded to full height                                   |
| `viewportHeight`       | `number`  | Current viewport height in pixels                                                 |
| `viewportStableHeight` | `number`  | Stable viewport height (doesn't change with keyboard)                             |
| `headerColor`          | `string`  | Current header color (`#RRGGBB`)                                                  |
| `backgroundColor`      | `string`  | Current background color (`#RRGGBB`)                                              |
| `bottomBarColor`       | `string`  | Current bottom bar color (`#RRGGBB`)                                              |
| `isFullscreen`         | `boolean` | Whether full-screen mode is active                                                |

### Key Sub-Objects

| Sub-Object          | Description                                                       |
| :------------------ | :---------------------------------------------------------------- |
| `BackButton`        | Controls the back button in the header                            |
| `MainButton`        | Controls the primary bottom button                                |
| `SecondaryButton`   | Controls the secondary bottom button                              |
| `SettingsButton`    | Controls the settings item in the context menu                    |
| `HapticFeedback`    | Controls haptic/vibration feedback                                |
| `CloudStorage`      | Cloud key-value storage (up to 1024 items, synced across devices) |
| `DeviceStorage`     | Persistent local storage (up to 5 MB, device-only)                |
| `SecureStorage`     | Encrypted storage using OS keychain/keystore (up to 10 items)     |
| `BiometricManager`  | Biometric authentication                                          |
| `Accelerometer`     | Accelerometer sensor data                                         |
| `Gyroscope`         | Gyroscope sensor data                                             |
| `DeviceOrientation` | Device orientation data                                           |
| `LocationManager`   | Location access                                                   |

---

## 4. Initialization Lifecycle

Every Mini App must call `tg.ready()` to signal to Telegram that the app is ready to be displayed.

### Universal Pattern (Any Framework)

```javascript
// 1. Get the WebApp instance
const tg = window.Telegram.WebApp;

// 2. Signal ready
tg.ready();

// 3. Expand to full height (recommended)
tg.expand();

// 4. Access user data
const user = tg.initDataUnsafe?.user;
console.log(user?.first_name, user?.username);
```

### Why `ready()` Matters

- Telegram shows a loading placeholder until `ready()` is called
- Call it as early as possible after your app's initial UI has rendered
- Don't call it before your app has something meaningful to display

---
