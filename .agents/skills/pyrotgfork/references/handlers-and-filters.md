# Handlers & Filters

## Registering handlers

```python
from pyrogram import Client, filters

app = Client("my_account")

@app.on_message(filters.private)
async def private_handler(client, message):
    await message.reply("Hello!")
```

## Common filters

- `filters.private`
- `filters.group`
- `filters.channel`
- `filters.user("username")`
- `filters.chat("chat_id")`
- `filters.text`
- `filters.media`
- `filters.incoming`
- `filters.outgoing`

## Bound methods

Use object-bound methods when available:
- `message.reply(...)`
- `message.edit(...)`
- `message.forward(...)`
- `message.delete(...)`
- `inline_query.answer(...)`
- `callback_query.answer(...)`

## Updates

Use the dispatcher/handler system unless you specifically need raw MTProto update behavior. Keep handlers small and focused.
