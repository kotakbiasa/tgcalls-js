## Quick Reference: Useful Methods

```javascript
const tg = window.Telegram.WebApp;

// Basics
tg.ready(); // Signal app is ready
tg.expand(); // Expand to full height
tg.close(); // Close the Mini App

// User data
tg.initData; // Raw string for server validation
tg.initDataUnsafe.user; // User object (not validated!)

// Navigation
tg.openLink(url); // Open URL in browser
tg.openLink(url, { try_instant_view: true }); // Try Instant View
tg.openTelegramLink(url); // Open telegram link (resolves inside Telegram)

// Sharing
tg.switchInlineQuery(query, ["users", "groups"]); // Switch to inline mode
tg.shareToStory(mediaUrl, params); // Share to Stories

// Clipboard
tg.readTextFromClipboard((text) => {}); // Read clipboard

// QR Code
tg.showScanQrPopup({ text: "Scan QR" }, (data) => {
  // Handle QR data
  return true; // return true to close popup
});
tg.closeScanQrPopup();

// Payments
tg.openInvoice(invoiceUrl, (status) => {
  // status: "paid", "cancelled", "failed", "pending"
});

// Colors
tg.setHeaderColor("#RRGGBB"); // Custom header color
tg.setBackgroundColor("#RRGGBB"); // Custom background color
tg.setBottomBarColor("#RRGGBB"); // Custom bottom bar color

// Permissions
tg.requestWriteAccess((granted) => {}); // Request PM write access
tg.requestContact((shared) => {}); // Request phone contact

// Home screen
tg.addToHomeScreen(); // Prompt add to home screen
tg.checkHomeScreenStatus((status) => {}); // 'added', 'missed', etc.

// Fullscreen
tg.requestFullscreen();
tg.exitFullscreen();

// Closing confirmation
tg.enableClosingConfirmation(); // Warn user before closing
tg.disableClosingConfirmation();

// Send data to bot (limited to 4096 bytes)
tg.sendData(JSON.stringify({ action: "submit" }));

// Keyboard & swipes
tg.hideKeyboard(); // 9.1+ hide on-screen keyboard
tg.enableVerticalSwipes(); // 7.7+ allow swipe to close/minimize
tg.disableVerticalSwipes(); // 7.7+ if app uses conflicting swipe gestures

// Chat selection (9.6+) — req_id from PreparedKeyboardButton
// (bot: savePreparedKeyboardButton -> pass req_id here)
tg.requestChat(reqId, (ok) => {}); // user picks/creates a chat to share

// File download popup (8.0+)
tg.downloadFile({ url, file_name, event_id }, (ok) => {});

// Location (8.0+) — needs user gesture
tg.LocationManager.getLocation((data) => {}); // null if denied
tg.LocationManager.openSettings(); // jump to bot location settings

// Emoji status (8.0+)
tg.setUserEmojiStatus(customEmojiId); // requires emoji-status access
```

## initData fields (server-side, from `initData`)

| Field | Meaning |
| :-- | :-- |
| `query_id` | For `answerWebAppQuery` (inline-style response) |
| `chat_join_request_query_id` | 10.1+ present when launched from a chat-join-request flow; bot finishes with `answerChatJoinRequestQuery` |
| `start_param` | Value after `startapp=` in the deep link |
| `auth_date` | Unix ts — reject if too old (replay protection) |
