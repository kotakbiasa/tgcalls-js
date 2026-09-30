---
name: conversations
description: Complete reference documentation and practical guide.
---

# ConversationHandler Reference for python-telegram-bot v21+

`ConversationHandler` is a specialized handler in `python-telegram-bot` (PTB) that manages multi-step dialogs. It tracks user states and routes incoming messages or callback queries to specific handler functions based on the user's current state.

---

## Core Architecture

A `ConversationHandler` is constructed with four primary parameters:
1. `entry_points`: Handlers that trigger the start of the conversation.
2. `states`: A dictionary mapping state identifiers (usually integers or strings) to lists of handlers to execute when the user is in that state.
3. `fallbacks`: Handlers that can be triggered from *any* state if no state-specific handler matches, or to handle global exit commands like `/cancel`.
4. `map_to_parent` (Optional): Used in nested conversations to map child states back to parent states.

```python
from telegram.ext import ConversationHandler, CommandHandler, MessageHandler, filters

CHOOSING, TYPING_REPLY, PHOTO_UPLOAD = range(3)

conv_handler = ConversationHandler(
    entry_points=[CommandHandler("start", start_callback)],
    states={
        CHOOSING: [
            MessageHandler(filters.Regex("^(Choice 1|Choice 2)$"), choice_callback),
            MessageHandler(filters.TEXT & ~filters.COMMAND, invalid_choice_callback),
        ],
        TYPING_REPLY: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, reply_callback),
        ],
        PHOTO_UPLOAD: [
            MessageHandler(filters.PHOTO, photo_callback),
        ]
    },
    fallbacks=[CommandHandler("cancel", cancel_callback)],
    name="my_conversation",
    persistent=True
)
```

---

## State Transition Flows

Handler callbacks control transitions by returning the next state:
- **Transition**: Return the integer/string of the next state (e.g., `return TYPING_REPLY`).
- **Remain in State**: Return the current state or `None` (which defaults to keeping the user in the current state).
- **End Conversation**: Return `ConversationHandler.END` or `-1`.

### Example Flow Callback

```python
from telegram import Update
from telegram.ext import ContextTypes

async def start_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Please choose an option:")
    return CHOOSING

async def choice_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["choice"] = update.message.text
    await update.message.reply_text(f"You chose {update.message.text}. Now upload a photo.")
    return PHOTO_UPLOAD

async def photo_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    photo_file = await update.message.photo[-1].get_file()
    await photo_file.download_to_drive("user_photo.jpg")
    await update.message.reply_text("Photo saved! Conversation complete.")
    return ConversationHandler.END

async def cancel_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Conversation cancelled.")
    return ConversationHandler.END
```

---

## Timeouts

To prevent orphaned states where a user starts a conversation but walks away, configure a `conversation_timeout`.

- When a timeout occurs, a special update of type `ConversationHandler.TIMEOUT` is generated and routed to the fallback handlers.
- The handler must return `ConversationHandler.END` (or the next state) within the fallback callback to clean up.

### Implementing Timeout Handlers

```python
from telegram.ext import ConversationHandler

conv_handler = ConversationHandler(
    entry_points=[CommandHandler("start", start)],
    states={
        CHOOSING: [MessageHandler(filters.TEXT, choice)]
    },
    fallbacks=[
        CommandHandler("cancel", cancel),
        MessageHandler(filters.ALL, timeout_handler)  # Catches timeout updates
    ],
    conversation_timeout=300.0  # Timeout in seconds (5 minutes)
)
```

Within the fallback or timeout callback:

```python
async def timeout_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    # Note: When a timeout triggers, `update` might be None or represent the final message.
    # PTB passes a dummy update containing the last chat/user info or None.
    # To detect a timeout, check the context or just clean up directly.
    if update.message:
        await update.message.reply_text("Session expired due to inactivity.")
    else:
        # Send message via bot client directly if update object is limited
        chat_id = context.user_data.get("chat_id")
        if chat_id:
            await context.bot.send_message(chat_id=chat_id, text="Session expired.")
            
    return ConversationHandler.END
```

---

## Nested Conversations

Nesting conversations allows modular, hierarchical dialog design. For example, a main menu conversation triggers a sub-conversation for settings, which returns control back to the main menu upon completion.

To implement nested conversations:
1. Define a child `ConversationHandler`.
2. Map the child's exit states to parent states using `map_to_parent` parameter.
3. Place the child `ConversationHandler` inside the `states` dictionary of the parent `ConversationHandler`.

### Code Example: Parent and Child Conversations

```python
from telegram.ext import ConversationHandler, CommandHandler, MessageHandler, filters

# Parent States
PARENT_MENU, CHILD_CONV, PARENT_END = range(3)
# Child States
CHILD_MENU, CHILD_TYPING = range(10, 12)

# 1. Define Child Conversation Handler
child_conv = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^Open Settings$"), child_start)],
    states={
        CHILD_MENU: [
            MessageHandler(filters.Regex("^Change Name$"), child_change_name),
            MessageHandler(filters.Regex("^Back to Main$"), child_back)
        ],
        CHILD_TYPING: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, child_save_name)
        ]
    },
    fallbacks=[CommandHandler("cancel", child_cancel)],
    map_to_parent={
        # Map child END state to return the user to the PARENT_MENU state
        ConversationHandler.END: PARENT_MENU,
        # Map child custom return states if needed
        CHILD_MENU: PARENT_MENU
    }
)

# 2. Define Parent Conversation Handler
parent_conv = ConversationHandler(
    entry_points=[CommandHandler("start", parent_start)],
    states={
        PARENT_MENU: [
            child_conv,  # The child conversation handler is nested here
            MessageHandler(filters.Regex("^Exit$"), parent_exit)
        ]
    },
    fallbacks=[CommandHandler("cancel", parent_cancel)]
)
```

### Callback Handlers for Nested Flow

```python
# Parent Callbacks
async def parent_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Welcome to Parent Menu. Reply 'Open Settings' to configure options, or 'Exit'."
    )
    return PARENT_MENU

async def parent_exit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Goodbye!")
    return ConversationHandler.END

# Child Callbacks
async def child_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Settings Menu:\n1. Change Name\n2. Back to Main")
    return CHILD_MENU

async def child_change_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Type your new name:")
    return CHILD_TYPING

async def child_save_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["name"] = update.message.text
    await update.message.reply_text(f"Name changed to {update.message.text}!")
    return CHILD_MENU  # Loops back to Child Menu

async def child_back(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    # Returning ConversationHandler.END here maps to PARENT_MENU via map_to_parent
    return ConversationHandler.END
```

---

## Dynamic Entry and Exit Paths

In advanced scenarios, entry and exit states might need to be resolved dynamically based on user role, feature flags, database status, or external API responses.

### Dynamic Exit Decisions
Instead of static exits, check conditions in your callback before returning `ConversationHandler.END` or a specific state.

```python
async def check_progress(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user_status = await database.get_user_status(update.effective_user.id)
    
    if user_status == "completed":
        await update.message.reply_text("Profile complete! Returning to main menu.")
        return ConversationHandler.END
    elif user_status == "missing_email":
        await update.message.reply_text("We still need your email. Please enter it:")
        return GET_EMAIL
    else:
        await update.message.reply_text("Let's proceed to photo upload.")
        return PHOTO_UPLOAD
```

### Dynamic Entry Points using Callback Queries
Using `CallbackQueryHandler` in entry points allows starting a conversation from inline buttons generated by external messages.

```python
conv_handler = ConversationHandler(
    entry_points=[
        CallbackQueryHandler(start_dynamic_conv, pattern="^start_survey_")
    ],
    states={
        SURVEY_QUESTIONS: [MessageHandler(filters.TEXT, handle_answer)]
    },
    fallbacks=[CommandHandler("cancel", cancel)]
)

async def start_dynamic_conv(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    
    survey_id = query.data.split("_")[-1]
    context.user_data["survey_id"] = survey_id
    
    await query.edit_message_text(text=f"Starting Survey #{survey_id}. Question 1: ...")
    return SURVEY_QUESTIONS
```
