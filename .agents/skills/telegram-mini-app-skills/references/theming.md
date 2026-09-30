## 5. Theming & CSS Variables

### The Golden Rule

> **NEVER hardcode colors**. Use the CSS variables that Telegram's SDK injects automatically. This ensures your app looks native in **Light mode**, **Dark mode**, and across all platforms.

### Available CSS Variables

The SDK automatically sets these CSS variables on the `<html>` element:

| CSS Variable                           | JS Property (`themeParams.X`) | Description                            |
| :------------------------------------- | :---------------------------- | :------------------------------------- |
| `--tg-theme-bg-color`                  | `bg_color`                    | Main background                        |
| `--tg-theme-text-color`                | `text_color`                  | Primary text                           |
| `--tg-theme-hint-color`                | `hint_color`                  | Secondary/hint text                    |
| `--tg-theme-link-color`                | `link_color`                  | Links                                  |
| `--tg-theme-button-color`              | `button_color`                | Primary button background              |
| `--tg-theme-button-text-color`         | `button_text_color`           | Button text                            |
| `--tg-theme-secondary-bg-color`        | `secondary_bg_color`          | Secondary background (cards, sections) |
| `--tg-theme-header-bg-color`           | `header_bg_color`             | Header background                      |
| `--tg-theme-bottom-bar-bg-color`       | `bottom_bar_bg_color`         | Bottom bar background                  |
| `--tg-theme-accent-text-color`         | `accent_text_color`           | Accent text                            |
| `--tg-theme-section-bg-color`          | `section_bg_color`            | Section/card background                |
| `--tg-theme-section-header-text-color` | `section_header_text_color`   | Section header text                    |
| `--tg-theme-section-separator-color`   | `section_separator_color`     | Separator lines                        |
| `--tg-theme-subtitle-text-color`       | `subtitle_text_color`         | Subtitle text                          |
| `--tg-theme-destructive-text-color`    | `destructive_text_color`      | Destructive/danger text                |

### Additional CSS Variables

| CSS Variable                          | Description                    |
| :------------------------------------ | :----------------------------- |
| `--tg-color-scheme`                   | `"light"` or `"dark"`          |
| `--tg-viewport-height`                | Current viewport height        |
| `--tg-viewport-stable-height`         | Stable viewport height         |
| `--tg-safe-area-inset-top`            | System safe area (top)         |
| `--tg-safe-area-inset-bottom`         | System safe area (bottom)      |
| `--tg-safe-area-inset-left`           | System safe area (left)        |
| `--tg-safe-area-inset-right`          | System safe area (right)       |
| `--tg-content-safe-area-inset-top`    | Telegram UI safe area (top)    |
| `--tg-content-safe-area-inset-bottom` | Telegram UI safe area (bottom) |
| `--tg-content-safe-area-inset-left`   | Telegram UI safe area (left)   |
| `--tg-content-safe-area-inset-right`  | Telegram UI safe area (right)  |

### Usage Examples

#### ✅ CORRECT — Using CSS Variables

```css
/* CSS */
body {
  background-color: var(--tg-theme-bg-color, #ffffff);
  color: var(--tg-theme-text-color, #000000);
}

.card {
  background-color: var(--tg-theme-section-bg-color, #f5f5f5);
  border: 1px solid var(--tg-theme-section-separator-color, #e0e0e0);
}

.button-primary {
  background-color: var(--tg-theme-button-color, #3b82f6);
  color: var(--tg-theme-button-text-color, #ffffff);
}

.hint-text {
  color: var(--tg-theme-hint-color, #999999);
}
```

> **Always provide fallback values** (the second argument in `var()`) so your app works outside of Telegram during development.

#### ❌ WRONG — Hardcoded Colors

```css
/* NEVER do this */
body {
  background-color: #ffffff;
  color: #000000;
}
.dark body {
  background-color: #1a1a1a;
  color: #ffffff;
}
```

### Creating a Shorthand Variable System (Recommended)

For convenience, map Telegram's verbose variables to shorter names in your global CSS:

```css
:root {
  --bg: var(--tg-theme-bg-color, #ffffff);
  --fg: var(--tg-theme-text-color, #171717);
  --btn: var(--tg-theme-button-color, #3b82f6);
  --btn-text: var(--tg-theme-button-text-color, #ffffff);
  --hint: var(--tg-theme-hint-color, #a1a1aa);
  --link: var(--tg-theme-link-color, #007aff);
  --secondary-bg: var(--tg-theme-secondary-bg-color, #efeff4);
  --section-bg: var(--tg-theme-section-bg-color, #ffffff);
  --section-header: var(--tg-theme-section-header-text-color, #6d6d72);
  --subtitle: var(--tg-theme-subtitle-text-color, #8e8e93);
  --destructive: var(--tg-theme-destructive-text-color, #ff3b30);
  --accent: var(--tg-theme-accent-text-color, #007aff);
  --separator: var(--tg-theme-section-separator-color, #c8c7cc);
}
```

### Listening to Theme Changes

```javascript
tg.onEvent("themeChanged", () => {
  // Theme params have been updated
  // CSS variables are auto-updated by the SDK
  // If using JS theming, re-read tg.themeParams
  console.log("New color scheme:", tg.colorScheme);
});
```

---
