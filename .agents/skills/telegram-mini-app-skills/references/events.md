## 14. Available Events

Register handlers with `tg.onEvent(eventType, handler)` and remove with `tg.offEvent(eventType, handler)`:

| Event                     | Trigger                                    |
| :------------------------ | :----------------------------------------- |
| `activated`               | Mini App becomes active/visible            |
| `deactivated`             | Mini App becomes inactive/hidden           |
| `themeChanged`            | User changed Telegram theme                |
| `viewportChanged`         | Viewport height changed (keyboard, expand) |
| `safeAreaChanged`         | System safe area insets changed            |
| `contentSafeAreaChanged`  | Telegram content safe area changed         |
| `mainButtonClicked`       | Main button was pressed                    |
| `secondaryButtonClicked`  | Secondary button was pressed               |
| `backButtonClicked`       | Back button was pressed                    |
| `settingsButtonClicked`   | Settings button was pressed                |
| `invoiceClosed`           | Payment invoice was closed                 |
| `popupClosed`             | Popup was closed                           |
| `qrTextReceived`          | QR code was scanned                        |
| `clipboardTextReceived`   | Clipboard text was received                |
| `writeAccessRequested`    | Write access permission result             |
| `contactRequested`        | Contact sharing result                     |
| `fullscreenChanged`       | Full-screen state changed                  |
| `fullscreenFailed`        | Full-screen request failed                 |
| `homeScreenAdded`         | App was added to home screen               |
| `homeScreenChecked`       | Home screen status checked                 |
| `biometricManagerUpdated` | Biometric manager state changed            |
| `biometricAuthRequested`  | Biometric auth result                      |
| `shareMessageSent`        | Share message was sent                     |
| `shareMessageFailed`      | Share message failed                       |
| `emojiStatusSet`          | Emoji status was set                       |
| `emojiStatusFailed`       | Emoji status setting failed                |
| `fileDownloadRequested`   | File download request result               |
| `scanQrPopupClosed`       | Scan QR popup was closed                   |
| `clipboardTextRequested`  | App asked for clipboard text (via readTextFromClipboard) |
| `emojiStatusAccessRequested` | User prompted to grant emoji-status access |
| `locationManagerUpdated`  | LocationManager state changed              |
| `locationRequested`       | Location request result (granted/denied)   |
| `accelerometerChanged`    | New accelerometer sample                   |
| `accelerometerFailed`     | Accelerometer access failed                |
| `deviceOrientationChanged`| New device-orientation sample              |
| `deviceOrientationFailed` | Orientation access failed                  |
| `gyroscopeChanged`        | New gyroscope sample                       |
| `gyroscopeFailed`         | Gyroscope access failed                    |
| `biometricTokenUpdated`   | Biometric token changed                    |
| `isUpdated`               | BiometricManager availability/enabled state changed |

---
