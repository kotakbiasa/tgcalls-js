# Client & Sessions

## Creating a client

```python
from pyrogram import Client

app = Client(
    name="my_account",
    api_id=123456,
    api_hash="abc123...",
)
```

## Starting and stopping

Common lifecycle methods:
- `app.run()` — starts, connects, runs until stopped.
- `app.start()` / `app.stop()` — manual control.
- `app.restart()` — restart the client.
- `app.idle()` — block until stopped.
- `app.compose()` — enter an async context manager.

## Sessions

- Session strings are sensitive. Export only when explicitly requested.
- Storage backends are configurable; default local session files are common for development.
- For long-running clients, handle disconnects and avoid blind reconnects.

## Authorization

Use only explicit user-driven flows:
- user login with phone/code/password
- bot login with `sign_in_bot()`

Never automate credential entry silently.
