---
name: games-and-mini-apps
description: Complete reference documentation and practical guide.
---

# Games and Mini Apps Reference Guide

This reference covers the Telegram Bot API specifications for Mini Apps, Attachment Menu integration, and HTML5 Games.

---

## 1. Telegram Mini Apps

Mini Apps (formerly Web Apps) are flexible web applications that run directly inside the Telegram client.

### Integration Points
1. **Keyboard Button**: A `KeyboardButton` with the `web_app` field of type `WebAppInfo` (user clicks to open).
2. **Inline Keyboard Button**: An `InlineKeyboardButton` with the `web_app` field of type `WebAppInfo`.
3. **Menu Button**: Programmatic app launch button next to the message input field (`MenuButtonWebApp`).
4. **Attachment Menu**: Configured via BotFather to allow launching the app from the paperclip/attachment menu.

### WebAppInfo Object
* `url`: HTTPS URL of the Mini App.

### Data Exchange and Communication

#### From Mini App to Bot (`web_app_data`)
If the Mini App was launched from a keyboard button (not inline), it can send data back to the bot by calling:
```javascript
window.Telegram.WebApp.sendData("custom_string_payload");
```
This closes the Mini App and generates a `web_app_data` (`WebAppData`) update on the bot:
* `data`: The string payload sent by the app.
* `button_text`: Text of the keyboard button that launched the app.

#### From Mini App to Inline Query Result (`answerWebAppQuery`)
If the Mini App was launched from an inline button, it can send a message on behalf of the user to the chat it was launched from by calling the API endpoint:
* **Method**: `answerWebAppQuery`
* **Parameters**:
  * `web_app_query_id` (String): Unique query ID received by the Web App from the launch context.
  * `result` (`InlineQueryResult`): The message payload (text, media, etc.) to be sent.
* **Returns**: A `SentWebAppMessage` object containing `inline_message_id`.

### Validate `initData`
Every Mini App receives initialization parameters in `window.Telegram.WebApp.initData` (a query string). To verify the data is authentic and comes from Telegram:
1. Parse the query string into key-value pairs.
2. Extract the `hash` field.
3. Sort all other parameters alphabetically and join them as `key=value` separated by newlines (`\n`). This is the `data-check-string`.
4. Generate a HMAC-SHA256 signature of the bot token using the constant string `"WebAppData"` as the key. Let this signature be the `secret_key`.
5. Generate a HMAC-SHA256 signature of the `data-check-string` using the `secret_key` as the key.
6. Compare the hex-encoded result with the extracted `hash` field.

---

## 2. Attachment Menu Integration

Mini Apps can be registered as Attachment Menu items to let users quickly access the app from any chat.
* Attachment Menu setup is configured via **BotFather** (Settings -> Bot Settings -> Attachment Menu).
* The Web App receives context about the current chat type and ID if launched from the attachment menu, allowing tailored features depending on whether it's a private chat, group, supergroup, or channel.

---

## 3. HTML5 Games

Telegram has a built-in gaming platform that lets you build rich HTML5 games that load inside Telegram and support global high scores.

### Methods

#### `sendGame`
Sends a game message.
* **Parameters**:
  * `chat_id` (Integer): Unique identifier for the target chat.
  * `game_short_name` (String): Short name of the game, acts as a unique identifier (configured via BotFather).
  * `reply_markup` (`InlineKeyboardMarkup`, optional): Must include an inline keyboard where the first button is a "Play" button (`callback_game`).

#### `setGameScore`
Updates the score of a user in a game.
* **Parameters**:
  * `user_id` (Integer): User identifier.
  * `score` (Integer): New score (must be non-negative).
  * `force` (Boolean, optional): Set to `true` if high scores can decrease (e.g. for timed puzzles).
  * `disable_edit_message` (Boolean, optional): Do not edit the game message containing high scores.
  * `chat_id` / `message_id` (Integer, optional): Required if `inline_message_id` is not specified.
  * `inline_message_id` (String, optional): Required if `chat_id` and `message_id` are not specified.

#### `getGameHighScores`
Retrieves the high score table for a game.
* **Parameters**:
  * `user_id` (Integer): Target user identifier.
  * `chat_id` / `message_id` / `inline_message_id`: (Same as `setGameScore`).
* **Returns**: Array of `GameHighScore` objects:
  * `position`: Position in the high score table.
  * `user`: `User` details.
  * `score`: High score.
