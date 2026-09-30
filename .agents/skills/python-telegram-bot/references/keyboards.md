---
name: keyboards
description: Complete reference documentation and practical guide.
---

# Interactive Keyboards and Callback Handlers in python-telegram-bot v21+

Telegram bots interact visually using two types of markup:
1. **Reply Keyboard Markups** (`ReplyKeyboardMarkup`): Custom buttons that replace the user's system keyboard.
2. **Inline Keyboard Markups** (`InlineKeyboardMarkup`): Buttons attached directly to sent messages. Clicking these sends a non-visible event called a `CallbackQuery` back to your bot.

---

## 1. ReplyKeyboardMarkup Construction

Reply keyboards allow simple text input selection. Key options include:
- `resize_keyboard=True`: Fits the keyboard to the screen size (strongly recommended).
- `one_time_keyboard=True`: Dismisses the keyboard automatically after a selection is clicked.
- `input_field_placeholder`: Custom hint text visible inside the typing input.

### Code Example: Building a Grid Layout

```python
from telegram import ReplyKeyboardMarkup, KeyboardButton, Update
from telegram.ext import ContextTypes

async def send_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [KeyboardButton("📊 View Stats"), KeyboardButton("⚙️ Settings")],
        [KeyboardButton("❓ Help"), KeyboardButton("❌ Cancel")]
    ]
    
    reply_markup = ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,
        one_time_keyboard=False,
        input_field_placeholder="Select an option..."
    )
    
    await update.message.reply_text(
        "Welcome! Choose an option from the menu below:",
        reply_markup=reply_markup
    )
```

---

## 2. InlineKeyboardMarkup Construction

Inline keyboards support interactive actions without spamming the chat with text messages. Buttons contain `callback_data` payloads, which are returned to the bot when clicked.

### Grid Construction Pattern

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

async def send_dashboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Rows are lists of buttons. Each item in the parent list is a new row.
    keyboard = [
        [
            InlineKeyboardButton("Option A", callback_data="dash_opt_a"),
            InlineKeyboardButton("Option B", callback_data="dash_opt_b")
        ],
        [
            InlineKeyboardButton("🔗 External Link", url="https://example.com")
        ],
        [
            InlineKeyboardButton("🔙 Back to Main Menu", callback_data="dash_back")
        ]
    ]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Control Center:",
        reply_markup=reply_markup
    )
```

---

## 3. Interactive CallbackQuery Handling

When an inline button is pressed:
1. The update matches a `CallbackQueryHandler`.
2. Your handler callback receives the query via `update.callback_query`.
3. **CRITICAL**: You must always call `await query.answer()` to acknowledge the click. This stops the loading spinner on the button.

### Safe Callback Handling Lifecycle

```python
from telegram import Update
from telegram.ext import CallbackQueryHandler, ContextTypes

async def dashboard_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    
    # 1. Acknowledge button click. Can optionally pass custom popups or banners.
    await query.answer(text="Loading Option A...", show_alert=False)
    
    # 2. Extract button payload data
    data = query.data
    
    # 3. Perform dynamic page replacement (Editing the current message)
    if data == "dash_opt_a":
        await query.edit_message_text(
            text="You selected Option A. Details listed below...",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Back", callback_data="dash_main")
            ]])
        )
    elif data == "dash_main":
        # Loop back to dashboard menu
        await query.edit_message_text(
            text="Control Center:",
            reply_markup=get_main_keyboard()
        )
```

---

## 4. Advanced: Dynamic Grid Generation & Pagination

Often, you need to output dynamic tables or paginated lists of data fetched from a database.

### Dynamic Keyboard Builder Utility

```python
from typing import List
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

def build_dynamic_grid(items: List[dict], columns: int = 2) -> InlineKeyboardMarkup:
    """
    Constructs an InlineKeyboardMarkup grid from an arbitrary list of items.
    Each item is expected to have 'text' and 'callback_data' keys.
    """
    keyboard = []
    current_row = []
    
    for item in items:
        current_row.append(
            InlineKeyboardButton(text=item["text"], callback_data=item["callback_data"])
        )
        
        # When row is full, append to keyboard and start a new row
        if len(current_row) == columns:
            keyboard.append(current_row)
            current_row = []
            
    # Add any remaining buttons in the final row
    if current_row:
        keyboard.append(current_row)
        
    return InlineKeyboardMarkup(keyboard)
```

### Implementing Pagination Callback Logic

To construct a pagination layout with `◀️ Prev`, `Page X/Y`, and `Next ▶️` controls:

```python
def get_pagination_keyboard(current_page: int, total_pages: int) -> InlineKeyboardMarkup:
    keyboard = [
        # Action buttons
        [
            InlineKeyboardButton("Item 1", callback_data="item_1"),
            InlineKeyboardButton("Item 2", callback_data="item_2")
        ]
    ]
    
    # Pagination Row
    nav_row = []
    if current_page > 1:
        nav_row.append(InlineKeyboardButton("◀️ Prev", callback_data=f"page_{current_page - 1}"))
    
    nav_row.append(InlineKeyboardButton(f"Page {current_page}/{total_pages}", callback_data="noop"))
    
    if current_page < total_pages:
        nav_row.append(InlineKeyboardButton("Next ▶️", callback_data=f"page_{current_page + 1}"))
        
    keyboard.append(nav_row)
    return InlineKeyboardMarkup(keyboard)
```

### Ingestion Handler

```python
from telegram.ext import CallbackQueryHandler

async def handle_pagination(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    # Extract page index
    target_page = int(query.data.split("_")[-1])
    
    # Update UI
    new_keyboard = get_pagination_keyboard(current_page=target_page, total_pages=5)
    await query.edit_message_text(
        text=f"Displaying results for Page {target_page}:",
        reply_markup=new_keyboard
    )

# Registration
# CallbackQueryHandler(handle_pagination, pattern="^page_")
```
