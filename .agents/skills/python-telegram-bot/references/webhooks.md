---
name: webhooks
description: Complete reference documentation and practical guide.
---

# Webhook Listener and Server Configuration for python-telegram-bot v21+

Webhooks allow your bot to receive updates immediately in production without maintaining an open long-polling connection. When an update occurs, Telegram sends an HTTPS POST request to your specified listener URL.

---

## 1. Webhook Listener Setup (PTB v21)

In python-telegram-bot, Webhook mode is initialized using `application.run_webhook`. Under the hood, PTB sets up a Starlette/asyncio web server to listen for inbound HTTP POST requests.

### Complete Webhook Python Script

```python
import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

logging.basicConfig(level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Hello via Webhook!")

def main():
    application = ApplicationBuilder().token("YOUR_BOT_TOKEN").build()
    application.add_handler(CommandHandler("start", start))

    # Configure Webhook parameters
    # listen: Address to bind the local server (usually 127.0.0.1 or 0.0.0.0)
    # port: Local port the server runs on
    # url_path: Secret path appended to the URL (avoids unauthorized spam)
    # webhook_url: The actual public endpoint Telegram will send requests to
    application.run_webhook(
        listen="127.0.0.1",
        port=8080,
        url_path="secret-token-12345",
        webhook_url="https://bot.yourdomain.com/secret-token-12345",
        secret_token="X-Telegram-Bot-Api-Secret-Token-Value"  # Added security verification
    )

if __name__ == "__main__":
    main()
```

---

## 2. Nginx Reverse Proxy Configuration

Usually, you run the Python listener on an internal port (like `8080`) and use Nginx as a reverse proxy on ports `80` and `443` to handle SSL termination.

Place the following configuration inside your Nginx server block (usually at `/etc/nginx/sites-available/telegram-bot`):

```nginx
server {
    listen 80;
    server_name bot.yourdomain.com;

    # Redirect all HTTP traffic to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bot.yourdomain.com;

    # SSL Certificates (managed by Certbot or Self-Signed)
    ssl_certificate /etc/letsencrypt/live/bot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.yourdomain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/telegram_bot_access.log;
    error_log /var/log/nginx/telegram_bot_error.log;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Disable buffering to process payloads instantly
        proxy_buffering off;
    }
}
```

Enable the site configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/telegram-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 3. SSL Certificate Setup

Telegram requires a valid SSL connection to deliver webhook payloads. You can use Let's Encrypt for free, production-ready certificates, or a self-signed certificate for local testing.

### Option A: Let's Encrypt (Recommended)
Install and run Certbot to automatically generate certificates and update your Nginx configuration.

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate and automatically modify Nginx
sudo certbot --nginx -d bot.yourdomain.com
```

### Option B: Self-Signed Certificate
If you do not own a domain name, you can generate a self-signed certificate and upload it directly to Telegram so they can verify the signature.

1. Generate private key and certificate:
```bash
openssl req -newkey rsa:2048 -sha256 -nodes -keyout private.key -x509 -days 365 -out public.pem -subj "/CN=YOUR_SERVER_IP"
```

2. Register the webhook with Telegram, passing the `public.pem` certificate file:
```python
import asyncio
from telegram import Bot

async def set_webhook():
    bot = Bot(token="YOUR_BOT_TOKEN")
    with open("public.pem", "rb") as cert:
        await bot.set_webhook(
            url="https://YOUR_SERVER_IP/secret-token-12345",
            certificate=cert
        )

asyncio.run(set_webhook())
```

---

## 4. Webhook Payload Verification

To secure your endpoint from spoofing attacks, verify that inbound requests originate from Telegram.

- **Telegram Secret Token**: Pass a unique `secret_token` parameter when registering your webhook. Telegram will include this string in the `X-Telegram-Bot-Api-Secret-Token` header of every request.
- PTB handles this automatically if you pass `secret_token` to `run_webhook`.

### Manual Payload Parsing & Verification Example
If you are running your own custom Webhook listener using FastAPI or Flask instead of the built-in PTB listener:

```python
from fastapi import FastAPI, Request, HTTPException, Header
from telegram import Update, Bot

app = FastAPI()
bot = Bot(token="YOUR_BOT_TOKEN")
SECRET_TOKEN = "my-highly-secure-custom-secret-token"

@app.post("/webhook-path")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(None)
):
    # 1. Validate the secret token header
    if x_telegram_bot_api_secret_token != SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 2. Extract and parse json payload
    payload = await request.json()
    
    # 3. Cast dict to python-telegram-bot Update instance
    update = Update.de_json(payload, bot)
    
    # 4. Enqueue/Process update (example: pass to application instance)
    # await application.update_queue.put(update)
    
    return {"status": "ok"}
```
