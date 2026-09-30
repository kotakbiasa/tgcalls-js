---
name: payments-and-stars
description: Complete reference documentation and practical guide.
---

# Payments and Stars Reference Guide

This reference covers the Telegram Bot API specifications for standard Payments, Telegram Stars Economy, Paid Media, and Gifts / Collectibles.

---

## 1. Traditional Payments Architecture

Telegram Bots can accept payments for goods and services from users worldwide. Payments are processed via third-party payment providers (e.g., Stripe, Payme, LiqPay).

### Payment Flow
1. **Send Invoice**: The bot sends an invoice using `sendInvoice` or creates a link with `createInvoiceLink`.
2. **Pre-Checkout Query**: The Telegram client sends a `PreCheckoutQuery` update to the bot containing user details and shipping decisions.
3. **Approve or Reject**: The bot must respond to the `PreCheckoutQuery` using `answerPreCheckoutQuery` within 10 seconds.
4. **Receipt**: Upon successful payment, a message with `successful_payment` (`SuccessfulPayment`) is received by the bot.

### Key Methods

#### `sendInvoice`
Sends an invoice message.
* **Parameters**:
  * `chat_id` (Integer or String): Unique identifier for the target chat.
  * `title` (String): Product name, 1-32 characters.
  * `description` (String): Product description, 1-255 characters.
  * `payload` (String): Bot-defined invoice payload, 1-128 bytes.
  * `provider_token` (String): Payment provider token from BotFather (empty for Telegram Stars payments).
  * `currency` (String): Three-letter ISO 4217 currency code.
  * `prices` (Array of `LabeledPrice`): Price breakdown (e.g. `[{"label": "Product", "amount": 1000}]` for 10.00 currency units).
  * `suggested_tip_amounts` (Array of Integer, optional)
  * `need_name` / `need_phone_number` / `need_email` / `need_shipping_address` (Boolean, optional)
  * `send_phone_number_to_provider` / `send_email_to_provider` (Boolean, optional)
  * `is_flexible` (Boolean, optional): True if the final price depends on the shipping method.

#### `answerPreCheckoutQuery`
* **Parameters**:
  * `pre_checkout_query_id` (String): Unique identifier for the query to be answered.
  * `ok` (Boolean): Specify `true` if everything is option-ready to proceed; `false` otherwise.
  * `error_message` (String, optional): Required if `ok` is `false`.

---

## 2. Telegram Stars Economy

Telegram Stars is a virtual currency that users can purchase inside Telegram via app stores and spend on digital goods or services provided by bots or Mini Apps.

### Stars Payments Setup
To send a Stars invoice, call `sendInvoice` or `createInvoiceLink` with:
* `provider_token` = `""` (empty string)
* `currency` = `"XTR"`
* Prices must be listed in whole numbers of Stars (e.g. `{"label": "Premium Upgrade", "amount": 50}`).

### Managing Transactions and Refunds

#### `refundStarPayment`
Refunds a completed payment in Telegram Stars.
* **Parameters**:
  * `user_id` (Integer): Identifier of the user who made the payment.
  * `telegram_payment_charge_id` (String): Charge ID of the transaction to refund (found in the `SuccessfulPayment` or `StarTransaction` object).

#### `getStarTransactions`
Retrieves a list of Star transactions for the bot (both incoming and outgoing).
* **Parameters**:
  * `offset` (Integer, optional): Number of transactions to skip.
  * `limit` (Integer, optional): Number of transactions to retrieve (1-100).
* **Returns**: A `StarTransactions` object containing a list of `StarTransaction` items:
  * `id`: Unique identifier for the transaction.
  * `amount`: Number of Stars.
  * `date`: Transaction date (Unix timestamp).
  * `source` / `receiver`: Transaction partner details (e.g. `TransactionPartnerUser`, `TransactionPartnerFragment`, etc.).

---

## 3. Paid Media

Paid media allows bots to send photo/video messages that are blurred until the user pays a specified amount of Telegram Stars.

### Methods

#### `sendPaidMedia`
Sends paid media to a channel or user chat.
* **Parameters**:
  * `chat_id` (Integer or String): Unique identifier for the target chat.
  * `star_count` (Integer): Number of Telegram Stars that must be paid to view the media.
  * `media` (Array of `InputPaidMedia`): Up to 10 photos or videos representing the paid media.
    * `InputPaidMediaPhoto`: `{ "type": "photo", "media": "file_id_or_url" }`
    * `InputPaidMediaVideo`: `{ "type": "video", "media": "file_id_or_url", "width": 640, "height": 360, "duration": 15, "supports_streaming": true }`
  * `caption` (String, optional): Paid media caption.
  * `parse_mode` (String, optional): MarkdownV2 or HTML.
  * `show_caption_above_media` (Boolean, optional)

---

## 4. Gifts & Collectibles

Bots can send, track, and manage unique Gifts and Collectibles on Telegram.

### Object Models

#### `Gift`
Represents a gift that can be sent by a bot or user.
* `id`: Unique identifier of the gift.
* `sticker`: `Sticker` representing the visual appearance of the gift.
* `star_count`: The price of the gift in Telegram Stars.
* `total_count` (Integer, optional): The total number of copies of this gift that can exist.
* `remaining_count` (Integer, optional): The remaining number of copies of this gift that can be sent.

### Methods
* `getAvailableGifts`: Retrieves list of gifts available for purchase. Returns a `Gifts` object.
* `sendGift`: Sends a gift to a user from the bot's inventory/balance.
  * **Parameters**:
    * `user_id` (Integer): Target user ID.
    * `gift_id` (String): Identifier of the gift.
    * `text` (String, optional): Custom message text to accompany the gift.
    * `text_parse_mode` (String, optional)
