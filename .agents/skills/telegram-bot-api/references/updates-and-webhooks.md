---
name: updates-and-webhooks
description: Complete reference documentation and practical guide.
---

# Updates and Webhooks

This reference guide provides an in-depth analysis of getting updates from the Telegram Bot API using either long polling (`getUpdates`) or webhooks (`setWebhook`), including payload structures, security practices, and polling architectures.

---

## 1. getUpdates vs. setWebhook

Telegram offers two mutually exclusive methods for receiving incoming updates: **Long Polling** (`getUpdates`) and **Webhooks** (`setWebhook`). You cannot use both concurrently. If you set a webhook, `getUpdates` requests will fail with a `400 Bad Request` error.

| Feature | Long Polling (`getUpdates`) | Webhooks (`setWebhook`) |
| :--- | :--- | :--- |
| **Protocol** | Outbound HTTP POST/GET from bot server | Inbound HTTPS POST from Telegram to bot server |
| **Network Req.** | Public IP/Domain NOT required | Public IP & verified SSL/TLS Domain required |
| **Latency** | Dependent on polling frequency (near real-time) | Real-time / Immediate |
| **Statefulness** | Easy to run locally/development | Requires exposure to public internet |
| **Concurrency** | Single worker processes sequentially/concurrently | Highly concurrent, fits serverless (AWS Lambda, Cloudflare Workers) |
| **Port limits** | N/A | Restricted to `443`, `80`, `88`, or `8443` |

---

## 2. The Update Object

An `Update` represents an incoming event from the Telegram platform. A single `Update` object containing exactly one optional field representing the new event.

### Schema Structure
```json
{
  "update_id": 10000000,
  "message": {
    "message_id": 99,
    "from": {
      "id": 12345678,
      "is_bot": false,
      "first_name": "Alice"
    },
    "chat": {
      "id": 12345678,
      "type": "private",
      "first_name": "Alice"
    },
    "date": 1625097600,
    "text": "/start"
  }
}
```

### Supported Update Fields

*   `update_id` (Integer): The update's unique identifier. Update identifiers start at a certain positive number and increase sequentially.
*   `message` (Message): New incoming message of any kind — text, photo, sticker, etc.
*   `edited_message` (Message): New version of a message that is known to the bot and was edited.
*   `channel_post` (Message): New incoming message of any kind in a channel.
*   `edited_channel_post` (Message): New version of a channel post that is known to the bot and was edited.
*   `business_connection` (BusinessConnection): The bot was connected or disconnected from a Telegram Business account.
*   `business_message` (Message): New message from a Telegram Business account that is associated with the bot.
*   `edited_business_message` (Message): New version of a message from a Telegram Business account.
*   `deleted_business_messages` (BusinessMessagesDeleted): Messages were deleted from a Telegram Business account.
*   `message_reaction` (MessageReactionUpdated): A reaction to a message was changed by a user.
*   `message_reaction_count` (MessageReactionCountUpdated): Reactions to a message with anonymous reactions were changed.
*   `inline_query` (InlineQuery): New incoming inline query.
*   `chosen_inline_result` (ChosenInlineResult): The result of an inline query that was chosen by a user and sent to their chat partner.
*   `callback_query` (CallbackQuery): New incoming callback query (e.g., from inline keyboards).
*   `shipping_query` (ShippingQuery): New incoming shipping query. Only for invoices with flexible shipping.
*   `pre_checkout_query` (PreCheckoutQuery): New incoming pre-checkout query. Contains full info about checkout.
*   `purchased_paid_media` (PurchasedPaidMedia): A user purchased paid media from the bot.
*   `poll` (Poll): New poll state. Bots receive updates about stopped polls and polls, which are sent by the bot.
*   `poll_answer` (PollAnswer): A user changed their answer in a non-anonymous poll.
*   `my_chat_member` (ChatMemberUpdated): The bot's chat member status was updated in a chat.
*   `chat_member` (ChatMemberUpdated): A chat member's status was updated in a chat.
*   `chat_join_request` (ChatJoinRequest): A request to join the chat has been sent.
*   `chat_boost` (ChatBoostUpdated): A chat boost was added or changed.
*   `removed_chat_boost` (ChatBoostRemoved): A chat boost was removed.

---

## 3. Long Polling Architecture (`getUpdates`)

To implement a robust long polling loop:

1.  Use a tracking variable `offset` initialized to `0`.
2.  Call `getUpdates` with parameters:
    *   `offset`: `last_processed_update_id + 1` to clear old updates from Telegram's queue.
    *   `limit`: Number of updates to fetch (1-100, default 100).
    *   `timeout`: Timeout in seconds for long polling (e.g., `30` seconds) to keep the connection open.
    *   `allowed_updates`: A JSON-serialized list of the update types you want your bot to receive.
3.  Process updates, save the highest `update_id`, and loop.

### Sample HTTP Request
```http
POST /bot<token>/getUpdates HTTP/1.1
Host: api.telegram.org
Content-Type: application/json

{
  "offset": 10000001,
  "limit": 50,
  "timeout": 30,
  "allowed_updates": ["message", "callback_query"]
}
```

---

## 4. Webhook Architecture (`setWebhook` & `WebhookInfo`)

Webhooks allow Telegram to push updates to your server over HTTPS.

### `setWebhook` Parameters
*   `url` (String): HTTPS URL to send updates to. Use an empty string to remove webhook integration.
*   `certificate` (InputFile): Upload your public key certificate if using self-signed certs.
*   `ip_address` (String): The fixed IP address which will be used to send webhook requests instead of using DNS.
*   `max_connections` (Integer): The maximum allowed number of simultaneous HTTPS connections (1-100, default 40).
*   `allowed_updates` (Array of String): A JSON-serialized list of the update types you want your bot to receive.
*   `drop_pending_updates` (Boolean): Pass `true` to clear all pending updates before setting the webhook.
*   `secret_token` (String): A secret token of 1-256 characters (alphanumeric, `_`, `-`) to validate incoming payloads.

### `WebhookInfo` Structure
Can be retrieved via `getWebhookInfo`.
*   `url`: Webhook URL.
*   `has_custom_certificate`: `true` if a custom certificate was uploaded.
*   `pending_update_count`: Number of updates waiting to be delivered.
*   `ip_address`: Currently used IP address.
*   `last_error_date`: Unix time of the most recent error.
*   `last_error_message`: Human-readable description of the last error.
*   `max_connections`: Maximum allowed connections.
*   `allowed_updates`: List of update types subscribed.

---

## 5. Webhook Security Best Practices

### A. Secret Token Verification (Highly Recommended)
Pass `secret_token` in `setWebhook`. Telegram will send this token in the header `X-Telegram-Bot-Api-Secret-Token` with every request.
Your application must verify this header value exactly matches your set token before parsing the body.

```python
# FastAPI Example
from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI()
SECRET_TOKEN = "MyHighlySecureRandomToken12345"

@app.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(None)
):
    if x_telegram_bot_api_secret_token != SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    update = await request.json()
    # Process update...
    return {"ok": True}
```

### B. SSL/TLS Configurations
Telegram require HTTPS for all webhooks. 
*   **CA-Signed Certificates**: Use services like Let's Encrypt.
*   **Self-Signed Certificates**: You must upload your public key certificate (`.pem`) as the `certificate` parameter in `setWebhook`.

### C. IP Address Restrictions
You can restrict incoming traffic to your webhook endpoint to Telegram's source CIDR blocks:
*   `149.154.160.0/20`
*   `91.108.4.0/22`
