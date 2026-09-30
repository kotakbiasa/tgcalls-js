---
name: keyboards-and-input
description: Complete reference documentation and practical guide.
---

# Keyboards and Input

This reference guide provides an exhaustive specification of keyboard types, callback query handling, input redirects, and prepared button interactions in the Telegram Bot API.

---

## 1. Reply Keyboards

Reply keyboards replace the standard system keyboard shown to the user with custom buttons.

### A. ReplyKeyboardMarkup
*   `keyboard` (Array of Array of KeyboardButton): Array of button rows, each represented by an Array of KeyboardButton objects.
*   `is_persistent` (Boolean): Requests clients to always show the keyboard when the regular keyboard is hidden.
*   `resize_keyboard` (Boolean): Requests clients to resize the keyboard vertically for optimal fit (default `false`).
*   `one_time_keyboard` (Boolean): Requests clients to hide the keyboard as soon as it's been used (default `false`).
*   `input_field_placeholder` (String): The placeholder to be shown in the input field when the keyboard is active (1-64 characters).
*   `selective` (Boolean): Use this parameter if you want to show the keyboard to specific users only (e.g. users mentioned in the `text` of the Message object).

### B. KeyboardButton Types
*   **Simple Text**: Triggers sending the text written on the button back as a message.
*   `request_users` (KeyboardButtonRequestUsers): Pressing the button prompts the user to select one or more shared users from their contact list.
*   `request_chat` (KeyboardButtonRequestChat): Pressing the button prompts the user to select a chat.
*   `request_contact` (Boolean): Triggers sending the user's phone number as a contact.
*   `request_location` (Boolean): Triggers sending the user's current location.
*   `request_poll` (KeyboardButtonPollType): Triggers prompting the user to create a poll.
*   `web_app` (WebAppInfo): Launches a configured Telegram Mini App.

### C. ReplyKeyboardRemove
Hides the active reply keyboard.
*   `remove_keyboard` (True): Requests clients to hide the custom keyboard.
*   `selective` (Boolean): Target specific users only.

---

## 2. Inline Keyboards & Callback Queries

Inline keyboards are attached directly to the message they belong to. Unlike reply keyboards, pressing buttons on inline keyboards does not send messages to the chat. Instead, it generates a `CallbackQuery`.

### A. InlineKeyboardMarkup
*   `inline_keyboard` (Array of Array of InlineKeyboardButton): Array of button rows.

### B. InlineKeyboardButton Fields
*   `text` (String): Label text on the button.
*   `callback_data` (String): Data to be sent in a callback query to the bot when the button is pressed (1-64 bytes).
*   `url` (String): HTTP or tg:// URL to be opened.
*   `web_app` (WebAppInfo): Description of the Web App that will be launched.
*   `login_url` (LoginUrl): An HTTP URL used to automatically authorize the user.
*   `switch_inline_query` (String): Pressing the button prompts the user to select one of their chats and inserts the bot's username and the specified inline query.
*   `switch_inline_query_current_chat` (String): Inline query in the current chat.
*   `pay` (Boolean): Send a Pay button.

### C. CallbackQuery Handling
When a user presses an inline button, the bot receives an `Update` containing a `callback_query` object:
*   `id` (String): Unique identifier for this query.
*   `from` (User): Sender of the query.
*   `message` (MaybeInaccessibleMessage): Message sent by the bot containing the keyboard.
*   `inline_message_id` (String): Identifier of the message sent via the bot in inline mode.
*   `data` (String): Data associated with the callback button (up to 64 bytes).

> [!IMPORTANT]
> You **must** answer all callback queries by calling `answerCallbackQuery` to clear the loading state on the user's client, even if you do not display a notification:
> *   `callback_query_id` (String): Unique ID of the query to respond to.
> *   `text` (String): Optional notification message (0-200 characters).
> *   `show_alert` (Boolean): If `true`, an alert is shown instead of a toast notification.
> *   `url` (String): URL of the game or redirection target.
> *   `cache_time` (Integer): Maximum time in seconds that the client may cache the result (default 0).

---

## 3. ForceReply

Shows a reply interface to the user as if they selected the bot's message and tapped 'Reply'. Great for step-by-step onboarding wizard flows.
*   `force_reply` (True): Shows reply interface.
*   `input_field_placeholder` (String): Placeholder text.
*   `selective` (Boolean): Target specific users.

---

## 4. PreparedKeyboardButton

A prepared inline keyboard button allows bots to prompt users to share a pre-defined post to multiple chats or channels.
*   When clicked, it opens a dialog where the user can choose multiple chats, groups, or channels.
*   Once selected, the platform automatically shares the prepared message draft to all chosen destinations.

---

## 5. Callback Data Design & Grid Layouts

### Callback Data Serialization
Since `callback_data` is strictly limited to **64 bytes**, you must pack payload data efficiently.
*   **Delimiter Pattern**: Use short characters like `:` or `|` to separate fields.
    *   *Example*: `view:prod:9912` (Action: `view`, Entity: `prod`, ID: `9912`).
*   **Compression**: Use base64 or custom dictionaries for status fields if space is tight.

### Dynamic Grid Layout Engine
When building menus (such as dynamic paginated catalogues), standardizing a layout generator helper is a best practice.

```python
# Helper to chunk list of buttons into rows of a fixed width
def build_grid(buttons, row_width=2):
    grid = []
    for i in range(0, len(buttons), row_width):
        grid.append(buttons[i:i + row_width])
    return grid
```
