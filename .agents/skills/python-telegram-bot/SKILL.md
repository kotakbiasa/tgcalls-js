---
name: python-telegram-bot
version: 22.8
description: "Guidance for building Telegram bots in Python using python-telegram-bot v22.8+ with asyncio."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐍",
      },
  }
---

# Production-Grade python-telegram-bot (v22.8+) Engineering Guide

> **Bot API coverage — verified September 2026 against v22.8 package.**
> PTB 22.8 reports `BOT_API_VERSION_INFO = (10, 0)`, i.e. it targets **Bot API 10.0**. Tiga
> rilis terbaru (**10.1, 10.2, 10.3**) **belum** di-wrap:
>
> | Bot API | Feature | PTB 22.8 status |
> |---|---|---|
> | 10.0 | Guest Mode, `sendLivePhoto`, poll media, reaction deletion | ✅ supported |
> | 10.1 | Rich Messages — `sendRichMessage`, `sendRichMessageDraft`, `InputRichMessage` | ❌ absent |
> | 10.2 | Outgoing block JSON (`InputRichMessage.blocks`), media bindings (`InputRichMessageMedia`, multipart upload), `RichBlockThinking` streaming, ephemeral messages, Communities (`Community`), Mini App domain enforcement | ❌ absent |
> | 10.3 | Rich message buttons (`RichBlockButtons`), `DisabledButton`, expandable blockquote, `EphemeralMessageParameters`, draft stop controls (`can_stop`) | ❌ absent |
>
> Untuk fitur 10.1–10.3, panggil endpoint HTTP langsung via `bot.request.post(...)`, atau
> gunakan library yang sudah membungkusnya secara native (seperti **grammY 1.46+** atau **aiogram 3.30+**).
> Periksa kembali `telegram.constants.BOT_API_VERSION_INFO` saat versi PTB diperbarui.

This guide outlines the production-ready architecture, code patterns, and best practices for building scalable, high-performance Telegram bots in Python using the `python-telegram-bot` (v22.8+) framework.

---

## 1. Architectural Blueprint: ApplicationBuilder, Application, & Handlers

The `python-telegram-bot` library relies on an asynchronous event-driven loop. The central coordinator is the `Application` class, which orchestrates incoming update fetching (via polling or webhooks), passes updates to the `BaseHandler` chain inside the `Dispatcher`, and handles context propagation.

### Core Architecture Flow
```
[Telegram Bot API Server] 
          │
          ▼ (Webhooks / Polling)
┌──────────────────────────────────────────────┐
│                 Application                  │
│  ┌────────────────────────────────────────┐  │
│  │               Dispatcher               │  │
│  │  ┌───────────────┐   ┌──────────────┐  │  │
│  │  │ Handlers List │──►│ Error Handler│  │  │
│  │  └───────────────┘   └──────────────┘  │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │         Persistence Provider           │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

- **ApplicationBuilder**: Used to declaratively configure the `Application` instance.
- **Handlers**: Evaluated sequentially in order of registration. A handler checks if an update matches its filter. If so, it processes it. If a handler returns `None` or raises an exception, the dispatch chain stops for that update unless `collect_additional_data` or specific handler behaviors are configured.
- **ContextTypes**: Strongly typed context helper that allows custom subclasses for typing benefits and dependency injection.

### Blueprint Snippet
```python
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Always check if message exists (can be edited messages, inline queries, etc.)
    if update.effective_message:
        await update.effective_message.reply_text("System initialized.")

def main() -> None:
    # Declaring the Application with Builder Pattern
    application = (
        ApplicationBuilder()
        .token("YOUR_BOT_TOKEN_HERE")
        .concurrent_updates(True) # Enable concurrent processing of updates
        .build()
    )

    # Register handlers. 
    # CommandHandler checks specifically for '/start' command.
    application.add_handler(CommandHandler("start", start_handler))

    # Run the application using the default long-polling method
    application.run_polling()

if __name__ == "__main__":
    main()
```

---

## 2. Asynchronous Concurrency Patterns & Task Management

To maintain a responsive bot, blocking CPU-bound tasks or network I/O must never block the main event loop.

### Concurrency Settings
- **`concurrent_updates`**: Setting `concurrent_updates=True` or a specific integer (e.g., `concurrent_updates=8`) in `ApplicationBuilder` executes update handling concurrently via `asyncio.create_task`.
- **Non-blocking Background Tasks**: Use `asyncio.create_task` or the application's built-in `JobQueue` to schedule background operations.

### Production Async Pattern Snippet
```python
import asyncio
import httpx
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler, ApplicationBuilder

async def fetch_external_data(url: str) -> dict:
    # Use httpx.AsyncClient for non-blocking HTTP requests
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=10.0)
        return response.json()

async def long_running_task(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Confirm receipt of request
    sent_message = await update.effective_message.reply_text("Processing request...")
    
    # Offload blocking external API calls to non-blocking tasks
    try:
        data = await fetch_external_data("https://api.github.com/repos/python-telegram-bot/python-telegram-bot")
        stars = data.get("stargazers_count", "unknown")
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=sent_message.message_id,
            text=f"python-telegram-bot stars: {stars}"
        )
    except Exception as e:
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=sent_message.message_id,
            text=f"Failed to fetch data: {str(e)}"
        )

def setup_async_bot() -> None:
    app = (
        ApplicationBuilder()
        .token("TOKEN")
        .concurrent_updates(16)  # Process up to 16 updates concurrently
        .build()
    )
    app.add_handler(CommandHandler("fetch", long_running_task))
```

---

## 3. High-Fidelity ConversationHandler Architecture

`ConversationHandler` orchestrates structured user dialogue. It requires an entry point handler, a mapping of conversation states to lists of matching handlers, and a list of fallback handlers.

### Key Production Requirements
1. **Dynamic Timeout**: Handle state timeouts cleanly using the `ConversationHandler.TIMEOUT` state.
2. **Fallback Behavior**: Ensure users can exit or reset the conversation state.
3. **Per-user/Per-chat Routing**: Ensure conversation state persists correctly across user actions.

```python
from typing import Dict, List
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import (
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    ContextTypes,
    filters,
)

# Define State constants
CHOOSING, TYPING_REPLY, CONFIRMATION = range(3)

async def start_convo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    reply_keyboard = [["Name", "Age"], ["Done"]]
    await update.message.reply_text(
        "Please choose an attribute to edit:",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True),
    )
    return CHOOSING

async def choice_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text
    context.user_data["choice"] = choice
    await update.message.reply_text(
        f"Provide a value for '{choice}':",
        reply_markup=ReplyKeyboardRemove()
    )
    return TYPING_REPLY

async def value_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    val = update.message.text
    choice = context.user_data.get("choice")
    context.user_data[choice] = val
    
    await update.message.reply_text(
        f"Saved: {choice} = {val}. Please confirm or type /done to exit.",
    )
    return CHOOSING

async def cancel_convo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Process cancelled.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def timeout_convo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.effective_message.reply_text("Session timed out due to inactivity.")
    return ConversationHandler.END

# Constructing the Conversation Handler
conv_handler = ConversationHandler(
    entry_points=[CommandHandler("register", start_convo)],
    states={
        CHOOSING: [
            MessageHandler(filters.Regex("^(Name|Age)$"), choice_handler),
        ],
        TYPING_REPLY: [
            MessageHandler(filters.TEXT & ~(filters.COMMAND), value_handler),
        ],
        ConversationHandler.TIMEOUT: [
            MessageHandler(filters.ALL, timeout_convo)
        ],
    },
    fallbacks=[
        CommandHandler("cancel", cancel_convo),
        CommandHandler("done", cancel_convo)
    ],
    conversation_timeout=60.0  # Seconds of user inactivity
)
```

---

## 4. State Persistence and DB Integration

Persistence preserves `user_data`, `chat_data`, `bot_data`, and the state of `ConversationHandler` across bot restarts.

### Built-in Persistence
- **PicklePersistence**: Serializes data to a local binary file.
- **DictPersistence**: Keeps data in-memory (useful for testing).

### Database Persistence Setup (SQLAlchemy Pattern)
To build a highly available database-backed persistence layer, inherit from `BasePersistence`.

```python
import pickle
from telegram.ext import BasePersistence, PersistenceInput
from telegram.ext._utils.types import BD, CD, CDC, UD

class PostgresPersistence(BasePersistence):
    def __init__(self, db_session_maker, store_data=None):
        super().__init__(store_data=store_data or PersistenceInput(bot_data=True, chat_data=True, user_data=True))
        self.session_maker = db_session_maker

    async def get_user_data(self) -> Dict[int, UD]:
        # Implementation fetches user_data from DB using SQLAlchemy
        # return loaded dictionary
        return {}

    async def update_user_data(self, user_id: int, data: UD) -> None:
        # Save user_data dict to DB (e.g. serialize to JSON column)
        pass

    async def get_chat_data(self) -> Dict[int, CD]:
        return {}

    async def update_chat_data(self, chat_id: int, data: CD) -> None:
        pass

    async def get_bot_data(self) -> BD:
        return {}

    async def update_bot_data(self, data: BD) -> None:
        pass

    async def get_conversations(self, name: str) -> Dict[tuple, object]:
        return {}

    async def update_conversation(self, name: str, key: tuple, new_state: object) -> None:
        pass

    async def flush(self) -> None:
        # Sync buffer
        pass
```

### Implementing PicklePersistence
```python
from telegram.ext import PicklePersistence

persistence = PicklePersistence(
    filepath="bot_state.pickle",
    update_interval=60 # Flush to disk every 60 seconds
)

app = ApplicationBuilder().token("TOKEN").persistence(persistence).build()
```

---

## 5. CallbackQueryHandler & Inline Keyboards

Inline Keyboards are interactive buttons linked directly to a message. Every click generates a `CallbackQuery` that **must** be explicitly answered within 10 seconds to dismiss the loading state on the user's client.

### Lifecycle of a Callback Query
```
[User Clicks Button] ──► [CallbackQueryUpdate Sent] ──► [Bot Handler Processes]
                                                               │
[Client Loading Stops] ◄── [Answer Callback Query] ◄───────────┘
```

### Clean Callback Handler Pattern
```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, CallbackQueryHandler, CommandHandler

async def show_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    keyboard = [
        [
            InlineKeyboardButton("Option A", callback_data="opt_a"),
            InlineKeyboardButton("Option B", callback_data="opt_b"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Please choose an option:", reply_markup=reply_markup)

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    
    # 1. Always answer the callback query immediately
    await query.answer(text="Selection registered.")
    
    # 2. Modify inline interface based on context
    if query.data == "opt_a":
        new_keyboard = [[InlineKeyboardButton("Back", callback_data="main_menu")]]
        await query.edit_message_text(
            text="You selected Option A. Details loaded.",
            reply_markup=InlineKeyboardMarkup(new_keyboard)
        )
    elif query.data == "main_menu":
        keyboard = [
            [
                InlineKeyboardButton("Option A", callback_data="opt_a"),
                InlineKeyboardButton("Option B", callback_data="opt_b"),
            ]
        ]
        await query.edit_message_text("Please choose an option:", reply_markup=InlineKeyboardMarkup(keyboard))
```

---

## 6. Extending with Custom Context and Bot Subclasses

Extending `CallbackContext` allows type safety, custom data caches, and project-specific helper methods to be globally available across handlers.

```python
from telegram import Update
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackContext,
    ExtBot,
    ContextTypes,
)

# Custom Bot class to override default behavior or implement caching
class CustomBot(ExtBot):
    def __init__(self, token: str, *args, **kwargs):
        super().__init__(token, *args, **kwargs)
        self._user_cache = {}

# Custom Context class extending CallbackContext
class CustomContext(CallbackContext[CustomBot, dict, dict, dict]):
    def __init__(self, application: Application, chat_id: int | None, user_id: int | None, check_types: bool):
        super().__init__(application, chat_id, user_id, check_types)
        
    @property
    def bot_cache(self) -> dict:
        return self.bot._user_cache

    def log_event(self, text: str) -> None:
        print(f"[CUSTOM CONTEXT LOG] User: {self.user_id} - Chat: {self.chat_id} - {text}")

# Hook Context to Handler Pipeline
context_types = ContextTypes(context=CustomContext, bot=CustomBot)

def run_custom_app():
    app = (
        ApplicationBuilder()
        .token("TOKEN")
        .context_types(context_types)
        .build()
    )
```

---

## 7. Webhook & Deployment Infrastructure

For production setups handling high loads, webhooks are preferred over long polling to reduce network latency and server overhead.

### Reverse Proxy Architecture (Nginx + SSL)
Webhooks require HTTPS. Nginx acts as a reverse proxy, handling SSL termination before proxying updates to the bot application listening locally.

```
                  ┌───────────────────────┐
                  │   Telegram Bot API    │
                  └───────────────────────┘
                              │ HTTPS (Port 443 / 8443)
                              ▼
                  ┌───────────────────────┐
                  │      Nginx Proxy      │
                  └───────────────────────┘
                              │ HTTP (e.g. Local Port 8000)
                              ▼
                  ┌───────────────────────┐
                  │    PTB Python App     │
                  └───────────────────────┘
```

#### Production Nginx Block (`/etc/nginx/sites-available/telegram_bot`)
```nginx
server {
    listen 443 ssl http2;
    server_name bot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/bot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.yourdomain.com/privkey.pem;

    location /YOUR_SECRET_TOKEN {
        proxy_pass http://127.0.0.1:8000/YOUR_SECRET_TOKEN;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Configuring Webhook in Python Application
```python
def main() -> None:
    app = ApplicationBuilder().token("YOUR_BOT_TOKEN").build()

    # Register handlers
    # ...

    # Configure webhook properties
    app.run_webhook(
        listen="127.0.0.1",
        port=8000,
        url_path="YOUR_SECRET_TOKEN",
        webhook_url="https://bot.yourdomain.com/YOUR_SECRET_TOKEN",
        allowed_updates=["message", "callback_query"], # Restrict updates to only what is needed
        secret_token="CRYPTOGRAPHICALLY_SECURE_VERIFICATION_TOKEN"
    )
```

---

## 8. Critical Troubleshooting & Common Pitfalls

| Issue | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **`NetworkError: urllib3 HTTPError`** | Rate limiting or temporary Telegram Bot API issues. | Implement resilient retry loops. Use `httpx` instead of raw urllib3 calls in custom HTTP clients. |
| **State transitions failing in `ConversationHandler`** | Handlers within the state return incorrect state codes or custom exceptions bypass state management. | Always return standard integers. Double-check that filters explicitly capture targeted input. |
| **`Conflict: terminated by other getUpdates request`** | Multiple instances of the bot token running concurrently (e.g. Local debug session vs Production system). | Kill all active sessions. In webhooks, delete webhooks via `/deleteWebhook` API before transitioning back to polling. |
| **`Blocked event loop` warnings** | Heavy cryptographic, file system operations, or synchronous requests (`requests.get`) inside handlers. | Run CPU-bound work using `asyncio.to_thread` or offload to process pools. Use `aiofiles` for disk writes. |
| **`CallbackQuery` spins indefinitely** | Missing `await query.answer()` inside a registered `CallbackQueryHandler`. | Ensure `query.answer()` is the first non-conditional execution path inside the handler. |

---

## References
- [Telegram Bot API — main index](../telegram-bot-api/SKILL.md)
- [Updates & Webhooks](../telegram-bot-api/references/updates-and-webhooks.md)
- [Keyboards & Interactive Input](../telegram-bot-api/references/keyboards-and-input.md)
- [Advanced Features (inline mode, guest mode)](../telegram-bot-api/references/advanced-features.md)
