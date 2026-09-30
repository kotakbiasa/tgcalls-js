## 16. Design Guidelines

Telegram's official design principles for Mini Apps:

### Core Principles

1. **Mobile-First**: All elements must be responsive and optimized for mobile viewports
2. **Native Feel**: Mimic the style and behavior of existing Telegram UI components
3. **Smooth Animations**: Target 60fps for all animations
4. **Accessibility**: All inputs and images should have labels
5. **Theme Adaptive**: Use Telegram CSS variables for all colors
6. **Safe Area Aware**: Respect safe areas, especially in full-screen mode
7. **Performance Conscious**: On Android, check User-Agent for device performance class and reduce animations on low-end devices

### Recommended UI Patterns

| Element             | Recommended Style                                                                   |
| :------------------ | :---------------------------------------------------------------------------------- |
| Page background     | `var(--tg-theme-secondary-bg-color)`                                                |
| Cards / Sections    | `var(--tg-theme-section-bg-color)` with `border-radius: 14px`                       |
| Section labels      | Uppercase, small font, `var(--tg-theme-section-header-text-color)`                  |
| Hint text           | Smaller font, `var(--tg-theme-hint-color)`                                          |
| Separators          | 1px line with `var(--tg-theme-section-separator-color)`                             |
| Input font size     | ≥ 16px (prevents iOS auto-zoom on focus)                                            |
| Button              | Use `MainButton` for primary actions, or custom with `var(--tg-theme-button-color)` |
| Destructive actions | `var(--tg-theme-destructive-text-color)`                                            |
| Bottom padding      | Add enough padding to avoid overlap with MainButton (~80px)                         |

---
