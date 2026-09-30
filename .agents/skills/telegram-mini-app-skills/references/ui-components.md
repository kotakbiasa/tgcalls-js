## 6. Navigation Components

### BackButton

Controls the native back button in the Telegram header. Use this instead of building your own back button.

```javascript
// Show the back button
tg.BackButton.show();

// Handle clicks
tg.BackButton.onClick(() => {
  // Navigate back in your app's routing
  history.back(); // or your router's back method
});

// Hide when no longer needed
tg.BackButton.hide();

// Remove a specific handler
tg.BackButton.offClick(handler);
```

### SettingsButton

Adds a "Settings" option to the Mini App's context menu (three-dot menu).

```javascript
tg.SettingsButton.show();
tg.SettingsButton.onClick(() => {
  // Navigate to settings page
});
```

---

## 7. Bottom Buttons

Telegram provides **two bottom buttons**: `MainButton` (primary) and `SecondaryButton` (secondary). They appear fixed at the bottom of the Mini App.

### MainButton

```javascript
const btn = tg.MainButton;

// Configure and show
btn.setText("SUBMIT ORDER");
btn.show();

// Or use setParams for multiple properties at once
btn.setParams({
  text: "SUBMIT ORDER",
  color: tg.themeParams.button_color,
  text_color: tg.themeParams.button_text_color,
  is_active: true,
  is_visible: true,
  has_shine_effect: false,
});

// Handle click
btn.onClick(() => {
  // Perform the action
});

// Show loading state
btn.showProgress(true); // true = leave button active
btn.disable(); // prevent double-clicks

// Reset after completion
btn.hideProgress();
btn.enable();
btn.hide();
```

### SecondaryButton

Works identically to `MainButton`:

```javascript
tg.SecondaryButton.setParams({
  text: "CANCEL",
  is_visible: true,
});

tg.SecondaryButton.onClick(() => {
  // Handle secondary action
});
```

### BottomButton Properties

| Property / Method            | Description                          |
| :--------------------------- | :----------------------------------- |
| `.text`                      | Button text                          |
| `.color`                     | Background color                     |
| `.textColor`                 | Text color                           |
| `.isVisible`                 | Whether the button is shown          |
| `.isActive`                  | Whether the button is clickable      |
| `.isProgressVisible`         | Whether the loading spinner is shown |
| `.setText(text)`             | Update button text                   |
| `.show()` / `.hide()`        | Toggle visibility                    |
| `.enable()` / `.disable()`   | Toggle clickability                  |
| `.showProgress(leaveActive)` | Show spinner                         |
| `.hideProgress()`            | Hide spinner                         |
| `.setParams(params)`         | Set multiple properties at once      |
| `.onClick(cb)`               | Register click handler               |
| `.offClick(cb)`              | Remove click handler                 |
| `.iconCustomEmojiId`         | Custom emoji icon on the button (Bot API 9.5+) |

### Important: Handler Cleanup

Always remove click handlers when they're no longer relevant (e.g., on component unmount or page navigation). Failure to do so can cause ghost handlers.

---

## 8. Haptic Feedback

Trigger native haptic vibrations for tactile feedback:

```javascript
const haptic = tg.HapticFeedback;

// Impact feedback — for button presses, interactions
haptic.impactOccurred("light"); // light tap
haptic.impactOccurred("medium"); // medium tap
haptic.impactOccurred("heavy"); // strong tap
haptic.impactOccurred("rigid"); // rigid tap
haptic.impactOccurred("soft"); // soft tap

// Notification feedback — for results/outcomes
haptic.notificationOccurred("success"); // operation succeeded
haptic.notificationOccurred("error"); // operation failed
haptic.notificationOccurred("warning"); // caution

// Selection feedback — for selection changes
haptic.selectionChanged(); // e.g., picker/slider changes
```

### When to Use

| Scenario                   | Type                              |
| :------------------------- | :-------------------------------- |
| Button tap                 | `impactOccurred("light")`         |
| Form submit success        | `notificationOccurred("success")` |
| Error response             | `notificationOccurred("error")`   |
| Toggling a switch          | `impactOccurred("medium")`        |
| Slider/picker value change | `selectionChanged()`              |
| Deleting an item           | `impactOccurred("heavy")`         |
| Clear/reset action         | `impactOccurred("light")`         |

---

## 9. Popups & Alerts

Use native Telegram dialogs instead of browser `alert()` / `confirm()`:

```javascript
// Simple alert
tg.showAlert("File saved successfully!", () => {
  // Callback after user dismisses
});

// Confirmation dialog
tg.showConfirm("Are you sure you want to delete this?", (confirmed) => {
  if (confirmed) {
    // User tapped "OK"
  }
});

// Custom popup with buttons
tg.showPopup(
  {
    title: "Choose an option", // optional
    message: "What would you like to do?",
    buttons: [
      { id: "save", type: "default", text: "Save" },
      { id: "delete", type: "destructive", text: "Delete" },
      { id: "cancel", type: "cancel" }, // text is auto-set
    ],
  },
  (buttonId) => {
    switch (buttonId) {
      case "save":
        /* ... */ break;
      case "delete":
        /* ... */ break;
      case "cancel":
        /* ... */ break;
    }
  },
);
```

### Popup Button Types

| Type            | Behavior                      |
| :-------------- | :---------------------------- |
| `"default"`     | Regular button                |
| `"ok"`          | "OK" text, closes popup       |
| `"close"`       | "Close" text, closes popup    |
| `"cancel"`      | "Cancel" text, closes popup   |
| `"destructive"` | Red/destructive styled button |

---
