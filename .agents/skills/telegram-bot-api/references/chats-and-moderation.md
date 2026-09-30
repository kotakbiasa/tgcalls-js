---
name: chats-and-moderation
description: Complete reference documentation and practical guide.
---

# Chats and Moderation Reference Guide

This reference covers the Telegram Bot API specifications for Chat Types, Member Moderation, Admin Permissions, Invite Links, Join Requests, and Forum Topics.

---

## 1. Chat Types and Properties

The Bot API models all conversations as a `Chat` object. Chats are categorised into four distinct types:

| Type | Description | Max Members | Message History |
| :--- | :--- | :--- | :--- |
| `private` | Direct message (one-on-one) conversation with a user. | 2 | Only accessible by the user and the bot. |
| `group` | Basic group chat. | 200 | All members share the same history pool. |
| `supergroup` | Upgraded group with advanced administration, threads, and moderation. | 200,000 | Persistent search history, thread support. |
| `channel` | Broadcast channel for one-to-many communication. | Unlimited | Only admins can post; subscribers can view/comment. |

### Key `Chat` Fields
* `id`: Unique identifier for this chat (integer up to 52 bits). For groups/supergroups/channels, it starts with `-100`.
* `type`: "private", "group", "supergroup", or "channel".
* `title`: Title, for supergroups, channels and group chats.
* `username`: Username, for private chats, supergroups and channels if available.
* `is_forum`: `true`, if the supergroup chat is a forum (has topics enabled).

---

## 2. Admin Permissions & Moderation

Bots can moderate chats if they are promoted to administrators with the appropriate permissions.

### Admin Permissions (`ChatAdministratorRights`)
When promoting a user or a bot using `promoteChatMember`, or checking rights, the following boolean parameters are evaluated:
* `is_anonymous`: Member's presence in the chat is hidden.
* `can_manage_chat`: Manage the chat and access the activity log.
* `can_post_messages`: Post messages in the channel (Channels only).
* `can_edit_messages`: Edit messages of other users (Channels only).
* `can_delete_messages`: Delete messages of other users.
* `can_manage_video_chats`: Manage video chats.
* `can_restrict_members`: Restrict, ban, or unban chat members.
* `can_promote_members`: Add new administrators or edit their privileges.
* `can_change_info`: Change the chat title, photo, and other settings.
* `can_invite_users`: Invite users to the chat.
* `can_post_stories`: Post stories in the channel (Channels only).
* `can_edit_stories`: Edit stories of other users (Channels only).
* `can_delete_stories`: Delete stories of other users (Channels only).
* `can_pin_messages`: Pin messages (Supergroups/Groups only).
* `can_manage_topics`: Manage forum topics (Forum supergroups only).

### Methods

#### `promoteChatMember`
Promotes or demotes a user in a supergroup or a channel.
* **Parameters**:
  * `chat_id` (Integer or String): Unique identifier for the target chat or username of the target channel.
  * `user_id` (Integer): Unique identifier of the target user.
  * `can_...` (Boolean, optional): Individual permissions listed above.

#### `restrictChatMember`
Restricts a user in a supergroup.
* **Parameters**:
  * `chat_id` (Integer or String): Unique identifier for the target chat.
  * `user_id` (Integer): Unique identifier of the target user.
  * `permissions` (`ChatPermissions`): New user permissions.
  * `use_independent_chat_permissions` (Boolean, optional): Set to `true` to change permissions independently of overall chat defaults.
  * `until_date` (Integer, optional): Date when restrictions will be lifted (Unix timestamp). If restricted for less than 30 seconds, they are restricted forever.
* **ChatPermissions Fields**:
  * `can_send_messages`, `can_send_audios`, `can_send_documents`, `can_send_photos`, `can_send_videos`, `can_send_video_notes`, `can_send_voice_notes`, `can_send_polls`, `can_send_other_messages` (stickers, gifs, etc.), `can_add_web_page_previews`, `can_change_info`, `can_invite_users`, `can_pin_messages`, `can_manage_topics`.

#### `banChatMember`
Bans a user from a group, a supergroup or a channel. In the case of supergroups and channels, the user will not be able to return to the chat on their own using invite links, etc., unless unbanned first.
* **Parameters**:
  * `chat_id` (Integer or String): Unique identifier for the target chat.
  * `user_id` (Integer): Unique identifier of the target user.
  * `until_date` (Integer, optional): Date when the user will be unbanned (Unix timestamp).
  * `revoke_messages` (Boolean, optional): Set to `true` to delete all messages from the target user.

#### `unbanChatMember`
Unbans a previously banned user in a supergroup or channel.
* **Parameters**:
  * `chat_id` (Integer or String)
  * `user_id` (Integer)
  * `only_if_banned` (Boolean, optional): Do nothing if the user isn't banned.

---

## 3. Invite Links and Join Requests

Invite links allow users to join private/public chats. Bots can manage links and approve pending member requests.

### Invite Link Schema (`ChatInviteLink`)
* `invite_link`: The invite link URL.
* `creator`: `User` object of the link creator.
* `creates_join_request`: `true` if users must be approved by an administrator before joining.
* `is_primary`: `true` if it's the primary invite link.
* `is_revoked`: `true` if the link is no longer valid.
* `name`: Link name.
* `expire_date`: Unix timestamp when the link expires.
* `member_limit`: Maximum number of users that can join simultaneously.
* `pending_join_request_count`: Number of pending join requests.

### Methods
* `createChatInviteLink`: Create an invite link.
* `editChatInviteLink`: Edit an existing link.
* `revokeChatInviteLink`: Invalidate a link.
* `approveChatJoinRequest` / `declineChatJoinRequest`: Action pending join requests.
  * **Parameters**: `chat_id`, `user_id`.

---

## 4. Forum Topics

Forum topics organize supergroups into threads.

### Topic Events
When a topic is created, edited, closed, reopened, or deleted, the bot receives updates containing:
* `forum_topic_created` (`ForumTopicCreated`): Contains `name`, `icon_color` (RGB decimal color), and optional `icon_custom_emoji_id`.
* `forum_topic_edited` (`ForumTopicEdited`): Contains updated `name` and/or `icon_custom_emoji_id`.
* `forum_topic_closed` (`ForumTopicClosed`)
* `forum_topic_reopened` (`ForumTopicReopened`)

### Methods
* `createForumTopic`: Create a topic.
  * Parameters: `chat_id`, `name`, `icon_color`, `icon_custom_emoji_id`.
* `editForumTopic`: Edit topic name and custom emoji icon.
* `closeForumTopic` / `reopenForumTopic`: Close or reopen a topic thread.
* `deleteForumTopic`: Delete a topic and all its messages.
* `getForumTopicIconStickers`: Get stickers available for topic icons.
