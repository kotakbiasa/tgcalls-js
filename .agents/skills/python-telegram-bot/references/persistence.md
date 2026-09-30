---
name: persistence
description: Complete reference documentation and practical guide.
---

# Persistence and State Retention in python-telegram-bot v21+

Persistence ensures that conversation states, user preferences, and bot configuration survive application restarts. python-telegram-bot (PTB) provides a clean mechanism to persist:
- `user_data` (per user)
- `chat_data` (per chat)
- `bot_data` (global bot scope)
- `conversations` (states for `ConversationHandler` instances)
- `callback_data` (stored data associated with inline buttons)

---

## Built-in Pickle Persistence

For development or simple deployments, `PicklePersistence` serializes data into a local binary file.

### Basic Setup

```python
from telegram.ext import ApplicationBuilder, PicklePersistence

def main():
    # 1. Initialize Pickle Persistence
    my_persistence = PicklePersistence(
        filepath="bot_persistence.pickle",
        store_data=True,                  # Persists user_data, chat_data, bot_data
        store_callback_data=True,         # Persists callback data
        update_interval=60                # Writes to file every 60 seconds (or on shutdown)
    )

    # 2. Pass persistence to Application
    application = ApplicationBuilder() \
        .token("YOUR_BOT_TOKEN") \
        .persistence(my_persistence) \
        .build()

    # 3. Add handlers as usual
    # Ensure ConversationHandlers have 'persistent=True' and a unique 'name'
    # application.add_handler(...)

    application.run_polling()

if __name__ == "__main__":
    main()
```

> [!WARNING]
> `PicklePersistence` is not thread-safe across multiple processes and can corrupt data if the bot crashes catastrophically. For production setups, implement custom database persistence.

---

## Custom Database Persistence (BasePersistence)

To store data in a relational database (e.g., PostgreSQL, MySQL, SQLite) or Redis, subclass `telegram.ext.BasePersistence`.

### Core Methods to Implement

You must override the following methods from `BasePersistence`:
- `get_user_data()` / `update_user_data(user_id, data)`
- `get_chat_data()` / `update_chat_data(chat_id, data)`
- `get_bot_data()` / `update_bot_data(data)`
- `get_conversations(name)` / `update_conversation(name, key, new_state)`
- `get_callback_data()` / `update_callback_data(data)`
- `flush()` (called on shutdown to finalize writes)

### PostgreSQL Implementation using SQLAlchemy

Here is a complete custom persistence class utilizing SQLAlchemy:

```python
import json
from typing import Dict, Any, Tuple, Optional
from telegram.ext import BasePersistence, PersistenceInput
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

# 1. SQLAlchemy Schema Models
class BotDataModel(Base):
    __tablename__ = 'bot_data'
    id = Column(Integer, primary_key=True)
    data_json = Column(Text, default='{}')

class UserDataModel(Base):
    __tablename__ = 'user_data'
    user_id = Column(Integer, primary_key=True)
    data_json = Column(Text, default='{}')

class ChatDataModel(Base):
    __tablename__ = 'chat_data'
    chat_id = Column(Integer, primary_key=True)
    data_json = Column(Text, default='{}')

class ConversationModel(Base):
    __tablename__ = 'conversations'
    id = Column(Integer, primary_key=True, autoincrement=True)
    handler_name = Column(String(100), nullable=False)
    # The key is a tuple representing (chat_id, user_id)
    key_str = Column(String(100), nullable=False)
    state = Column(Integer, nullable=True) # or String depending on your states

# 2. BasePersistence Implementation
class SQLPersistence(BasePersistence):
    def __init__(self, db_url: str):
        # Allow persisting all typical objects
        super().__init__(
            store_data=PersistenceInput(user_data=True, chat_data=True, bot_data=True)
        )
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    # --- USER DATA ---
    async def get_user_data(self) -> Dict[int, Dict[Any, Any]]:
        session = self.Session()
        results = session.query(UserDataModel).all()
        user_data = {}
        for r in results:
            user_data[r.user_id] = json.loads(r.data_json)
        session.close()
        return user_data

    async def update_user_data(self, user_id: int, data: Dict[Any, Any]) -> None:
        session = self.Session()
        user = session.query(UserDataModel).filter_by(user_id=user_id).first()
        if not user:
            user = UserDataModel(user_id=user_id)
            session.add(user)
        user.data_json = json.dumps(data)
        session.commit()
        session.close()

    # --- CHAT DATA ---
    async def get_chat_data(self) -> Dict[int, Dict[Any, Any]]:
        session = self.Session()
        results = session.query(ChatDataModel).all()
        chat_data = {}
        for r in results:
            chat_data[r.chat_id] = json.loads(r.data_json)
        session.close()
        return chat_data

    async def update_chat_data(self, chat_id: int, data: Dict[Any, Any]) -> None:
        session = self.Session()
        chat = session.query(ChatDataModel).filter_by(chat_id=chat_id).first()
        if not chat:
            chat = ChatDataModel(chat_id=chat_id)
            session.add(chat)
        chat.data_json = json.dumps(data)
        session.commit()
        session.close()

    # --- BOT DATA ---
    async def get_bot_data(self) -> Dict[Any, Any]:
        session = self.Session()
        record = session.query(BotDataModel).first()
        data = json.loads(record.data_json) if record else {}
        session.close()
        return data

    async def update_bot_data(self, data: Dict[Any, Any]) -> None:
        session = self.Session()
        record = session.query(BotDataModel).first()
        if not record:
            record = BotDataModel()
            session.add(record)
        record.data_json = json.dumps(data)
        session.commit()
        session.close()

    # --- CONVERSATIONS ---
    async def get_conversations(self, name: str) -> Dict[Tuple[int, ...], Any]:
        session = self.Session()
        results = session.query(ConversationModel).filter_by(handler_name=name).all()
        conversations = {}
        for r in results:
            # Parse tuple from string representation e.g. "(12345, 67890)"
            import ast
            key_tuple = ast.literal_eval(r.key_str)
            conversations[key_tuple] = r.state
        session.close()
        return conversations

    async def update_conversation(self, name: str, key: Tuple[int, ...], new_state: Optional[Any]) -> None:
        session = self.Session()
        key_str = str(key)
        record = session.query(ConversationModel).filter_by(handler_name=name, key_str=key_str).first()
        if new_state is None:
            if record:
                session.delete(record)
        else:
            if not record:
                record = ConversationModel(handler_name=name, key_str=key_str)
                session.add(record)
            record.state = new_state
        session.commit()
        session.close()

    # --- CALLBACK DATA ---
    async def get_callback_data(self) -> Optional[Dict[str, Tuple[Any, float, int]]]:
        # Optional optimization. Return None if not using persistent callback mappings.
        return None

    async def update_callback_data(self, data: Dict[str, Tuple[Any, float, int]]) -> None:
        pass

    async def flush(self) -> None:
        pass
```

---

## Session Storage and Direct State Access

Sometimes, you need to read or alter persistent states from outside the conversation context (e.g., an admin command or a dashboard endpoint).

### Reading/Writing user_data Manually

You can access and update data structures directly via the application context:

```python
# To modify user data dynamically outside of a specific handler:
async def force_reset_user_preferences(user_id: int, application) -> None:
    # 1. Fetch user data dictionary (or create if not present)
    user_data = await application.persistence.get_user_data()
    user_settings = user_data.get(user_id, {})
    
    # 2. Modify properties
    user_settings["restricted"] = False
    
    # 3. Commit changes through persistence layer
    await application.persistence.update_user_data(user_id, user_settings)
```

### Accessing Conversation States Globally

To forcefully change or terminate a user's conversation state:

```python
async def force_end_conversation(user_id: int, chat_id: int, handler_name: str, application) -> None:
    # Conversation keys are stored as: (chat_id, user_id)
    key = (chat_id, user_id)
    
    # Update conversation state to None (which deletes/resets the state)
    await application.persistence.update_conversation(
        name=handler_name,
        key=key,
        new_state=None
    )
    
    # Force application update so the active handler in memory reflects the change
    application.handlers[0] # Verify index mapping of handlers if updating on-the-fly
```
