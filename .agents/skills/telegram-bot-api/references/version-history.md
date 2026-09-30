# Telegram Bot API — Version History (Complete)

Sumber resmi: <https://core.telegram.org/bots/api-changelog> — diparse 2026-08-25.
47 versi, dari **Bot API 2.3 (Nov 2016)** sampai **Bot API 10.3 (Agu 2026)**.

> Item dipertahankan verbatim dari changelog resmi (dikelompokkan per kategori).

## Bot API 10.3 — August 24, 2026

### Rich Messages

- Added the class RichMessageButton representing a button in a RichMessage.
- Added the class RichTextButton.
- Added the classes RichBlockButtons and InputRichBlockButtons.
- Added the field is_compact to the classes RichBlockTable and InputRichBlockTable.
- Added the classes RichBlockExpandableBlockQuotation and InputRichBlockExpandableBlockQuotation representing a block quotation, which can be expanded or collapsed back.
- Added the classes RichBlockDocument and InputRichBlockDocument, containing a file.
- Added support for links of the form tg://document?id= for general file uploads in rich messages.
### Ephemeral messages

- Added the class EphemeralMessageParameters and replaced the parameters receiver_user_id and callback_query_id in the methods sendMessage, sendAnimation, sendAudio, sendDocument, sendLivePhoto, sendPhoto, sendSticker, sendVideo, sendVideoNote, sendVoice, sendContact, sendLocation and sendVenue with the parameter ephemeral_message_parameters.
- Added the parameter ephemeral_message_parameters to the method sendRichMessage.
- Added the field replace_callback_query_message to the class EphemeralMessageParameters, which allows bots to show an ephemeral message in place of the original message.
- Supported upload of new files in editEphemeralMessageMedia.
- Added the parameter show_caption_above_media to the method editEphemeralMessageCaption.
- Added the parameter rich_message to the method editEphemeralMessageText.
- Added the field can_send_welcome_messages to the classes ChatAdministratorRights and ChatMemberAdministrator.
- Added the parameter can_send_welcome_messages to the method promoteChatMember.
### Reply markup

- Added the class DisabledButton and the field disabled to the class InlineKeyboardButton.
- Added the field force_reply to the classes InlineKeyboardMarkup and ReplyKeyboardMarkup.
- Added the parameters can_stop and keep_on_stop to the methods sendMessageDraft and sendRichMessageDraft.
- Added updates about user stopping message generation, represented by the class MessageGenerationStopped and the field stopped_message_generation in the class Update.
- Added the class CommunityChatJoined and the field community_chat_joined to the class Message for service messages about join of a chat from a community.
- Added the fields text, entities and is_private to the class UniqueGiftInfo.

## Bot API 10.2 — July 14, 2026

### Rich Messages

- Added the class InputRichMessageMedia and the field media to the class InputRichMessage, allowing bots to explicitly specify media used in markdown or html formatting when sending a rich message.
- Added the class InputMediaVoiceNote, representing a voice message to be sent.
- Added the class InputRichBlockListItem, which represents an item in a list to be sent.
- Added the classes InputRichBlockParagraph, InputRichBlockSectionHeading, InputRichBlockPreformatted, InputRichBlockFooter, InputRichBlockDivider, InputRichBlockMathematicalExpression, InputRichBlockAnchor, InputRichBlockList, InputRichBlockBlockQuotation, InputRichBlockPullQuotation, InputRichBlockCollage, InputRichBlockSlideshow, InputRichBlockTable, InputRichBlockDetails, InputRichBlockMap, InputRichBlockAnimation, InputRichBlockAudio, InputRichBlockPhoto, InputRichBlockVideo, InputRichBlockVoiceNote and InputRichBlockThinking, which represent different types of blocks available to format an outgoing rich message.
- Added the field blocks to the class InputRichMessage, allowing bots to specify rich message formatting via block entities.
### Ephemeral Messages

- Introduced support for Ephemeral Messages, allowing bots to send group messages and receive commands that are visible only to a specific user and the bot.
- Added the field is_ephemeral to the class BotCommand.
- Added the field receiver_user to the class Message.
- Added the field ephemeral_message_id to the class Message.
- Added the parameters receiver_user_id and callback_query_id to the methods sendMessage, sendAnimation, sendAudio, sendDocument, sendLivePhoto, sendPhoto, sendSticker, sendVideo, sendVideoNote, sendVoice, sendContact, sendLocation, sendVenue.
- Added the field ephemeral_message_id to the class ReplyParameters, allowing bots to reply to ephemeral messages.
- Marked the field message_id in the class ReplyParameters as optional if the field ephemeral_message_id is present.
- Added the methods editEphemeralMessageText, editEphemeralMessageMedia, editEphemeralMessageCaption, and editEphemeralMessageReplyMarkup allowing bots to edit ephemeral messages.
- Added the method deleteEphemeralMessage allowing bots to delete ephemeral messages.
### Communities

- Introduced initial support for Communities - several supergroups, channels, and bots linked together around a shared topic or audience.
- Added the class Community which represents a community.
- Added the class CommunityChatAdded and the field community_chat_added to the class Message.
- Added the class CommunityChatRemoved and the field community_chat_removed to the class Message.
- Added the field community to the class ChatFullInfo.
- Added updates about changes to a user payment subscription, represented by the class BotSubscriptionUpdated and the field subscription in the class Update.
- Hardened the security of Mini Apps by disallowing the usage of Mini App methods from origins different from the original Mini App domain. The protection will be automatically enabled for all Mini Apps on July 20, 2026. You can opt-out from the protection through the @BotFather Mini App. If you do so, you acknowledge that it is the responsibility of the bot to ensure that the Mini App has no links to untrusted sites.

## Bot API 10.1 — June 11, 2026

### Rich Messages

- Added support for Rich Messages, allowing bots to send highly structured text and stream AI-generated replies with seamless rich formatting.
- Added the classes RichTextBold, RichTextItalic, RichTextUnderline, RichTextStrikethrough, RichTextSpoiler, RichTextDateTime, RichTextTextMention, RichTextSubscript, RichTextSuperscript, RichTextMarked, RichTextCode, RichTextCustomEmoji, RichTextMathematicalExpression, RichTextUrl, RichTextEmailAddress, RichTextPhoneNumber, RichTextBankCardNumber, RichTextMention, RichTextHashtag, RichTextCashtag, RichTextBotCommand, RichTextAnchor, RichTextAnchorLink, RichTextReference and RichTextReferenceLink, which represent different types of rich formatted text.
- Added the class RichText, which represents rich formatted text.
- Added the class RichBlockCaption, which represents the caption of a rich formatted text.
- Added the class RichBlockTableCell, which represents a cell in a table.
- Added the class RichBlockListItem, which represents an item in a list.
- Added the classes RichBlockParagraph, RichBlockSectionHeading, RichBlockPreformatted, RichBlockFooter, RichBlockDivider, RichBlockMathematicalExpression, RichBlockAnchor, RichBlockList, RichBlockBlockQuotation, RichBlockPullQuotation, RichBlockCollage, RichBlockSlideshow, RichBlockTable, RichBlockDetails, RichBlockMap, RichBlockAnimation, RichBlockAudio, RichBlockPhoto, RichBlockVideo, RichBlockVoiceNote and RichBlockThinking, which represent different types of blocks in a rich formatted message.
- Added the class RichBlock, which represents a block in a rich formatted message.
- Added the class RichMessage, which represents a rich formatted message.
- Added the field rich_message to the class Message.
- Added the class InputRichMessage, describing a rich message to send.
- Added the class InputRichMessageContent and allowed it to be used as InputMessageContent in results of inline, guest, and Web App queries.
- Added the method sendRichMessage, allowing bots to send rich messages.
- Added the method sendRichMessageDraft, allowing bots to stream partial rich messages.
- Added the parameter rich_message to the method editMessageText, allowing bots to edit rich messages.
### Join Request Queries

- Added the field supports_join_request_queries to the class User.
- Added the field guard_bot to the class ChatFullInfo.
- Added the field query_id to the class ChatJoinRequest.
- Added the method answerChatJoinRequestQuery.
- Added the method sendChatJoinRequestWebApp.
### Polls

- Added the class Link and the field link to the class PollMedia.
- Added the class InputMediaLink and allowed it to be used as InputPollOptionMedia.

## Bot API 10.0 — May 8, 2026

### Guest Mode

- Introduced support for guest mode, allowing bots to receive certain messages and issue replies within chats they are not a member of.
- Added the field supports_guest_queries to the class User.
- Added the fields guest_bot_caller_user and guest_bot_caller_chat to the class Message.
- Added the field guest_query_id to the class Message.
- Added the field guest_message to the class Update.
- Added the class SentGuestMessage and the method answerGuestQuery.
### Chat Management

- Added the field can_react_to_messages to the classes ChatMemberRestricted and ChatPermissions.
- Added the parameter return_bots to the method getChatAdministrators.
- Added the method deleteAllMessageReactions.
- Added the method deleteMessageReaction.
- Added the ability to see certain messages sent by other bots in groups.
### Polls

- Added the classes InputMediaSticker, InputMediaLocation, and InputMediaVenue.
- Added the class PollMedia, representing a media in a poll.
- Added the field media to the class Poll, allowing bots to see media in polls.
- Added the field explanation_media to the class Poll, allowing bots to see media in quiz explanations.
- Added the field media to the class PollOption, allowing bots to see media in poll options.
- Added the class InputPollMedia and the parameters media and explanation_media to the method sendPoll, allowing bots to add media to polls.
- Added the class InputPollOptionMedia and the field media to the class InputPollOption, allowing bots to add media to poll options.
- Added the field members_only to the class Poll.
- Added the parameter members_only to the method sendPoll.
- Added the field country_codes to the class Poll.
- Added the parameter country_codes to the method sendPoll.
- Decreased the minimum number of poll options from 2 to 1.
### Live photos

- Added the class LivePhoto, which represents a photo with a short video.
- Added the class InputMediaLivePhoto.
- Added the field live_photo to the classes Message and ExternalReplyInfo.
- Added the method sendLivePhoto, allowing bots to send live photos.
- Added the class PaidMediaLivePhoto, which describes a paid media with a live photo.
- Added the class InputPaidMediaLivePhoto, allowing bots to send live photos as paid media.
- Allowed to use live photos in sendMediaGroup and editMessageMedia,
- Allowed Business Bots to manage user accounts without a Telegram Premium subscription.
- Added the ability to send messages to other bots via username if both bots enabled bot-to-bot communication.
- Added the ability to reply to other bots from a business bot if the business bot enabled bot-to-bot communication.
- Allowed bots to pass an empty text in the method sendMessageDraft.
- Added the class BotAccessSettings and the method getManagedBotAccessSettings.
- Added the method setManagedBotAccessSettings.
- Added the method getUserPersonalChatMessages.

## Bot API 9.6 — April 3, 2026

### Managed Bots

- Added the field can_manage_bots to the class User.
- Added the class KeyboardButtonRequestManagedBot and the field request_managed_bot to the class KeyboardButton.
- Added the class ManagedBotCreated and the field managed_bot_created to the class Message.
- Added updates about the creation of managed bots and the change of their token, represented by the class ManagedBotUpdated and the field managed_bot in the class Update.
- Added the methods getManagedBotToken and replaceManagedBotToken.
- Added the class PreparedKeyboardButton and the method savePreparedKeyboardButton, allowing bots to request users, chats and managed bots from Mini Apps.
- Added the method requestChat to the class WebApp.
- Added support for https://t.me/newbot/{manager_bot_username}/{suggested_bot_username}[?name={suggested_bot_name}] links, allowing bots to request the creation of a managed bot via a link.
### Polls

- Added support for quizzes with multiple correct answers.
- Replaced the field correct_option_id with the field correct_option_ids in the class Poll.
- Replaced the parameter correct_option_id with the parameter correct_option_ids in the method sendPoll.
- Allowed to pass allows_multiple_answers for quizzes in the method sendPoll.
- Increased the maximum time for automatic poll closure to 2628000 seconds.
- Added the field allows_revoting to the class Poll.
- Added the parameter allows_revoting to the method sendPoll.
- Added the parameter shuffle_options to the method sendPoll.
- Added the parameter allow_adding_options to the method sendPoll.
- Added the parameter hide_results_until_closes to the method sendPoll.
- Added the fields description and description_entities to the class Poll.
- Added the parameters description, description_parse_mode, and description_entities to the method sendPoll.
- Added the field persistent_id to the class PollOption, representing a persistent identifier for the option.
- Added the field option_persistent_ids to the class PollAnswer.
- Added the fields added_by_user and added_by_chat to the class PollOption, denoting the user and the chat which added the option.
- Added the field addition_date to the class PollOption, describing the date when the option was added.
- Added the class PollOptionAdded and the field poll_option_added to the class Message.
- Added the class PollOptionDeleted and the field poll_option_deleted to the class Message.
- Added the field poll_option_id to the class ReplyParameters, allowing bots to reply to a specific poll option.
- Added the field reply_to_poll_option_id to the class Message.
- Allowed “date_time” entities in checklist title, checklist task text, TextQuote, ReplyParameters quote, sendGift, and giftPremiumSubscription.

## Bot API 9.5 — March 1, 2026

### Polls

- Added the MessageEntity type “date_time”, allowing bots to show a formatted date and time to the user.
- Allowed all bots to use the method sendMessageDraft.
- Added the field tag to the classes ChatMemberMember and ChatMemberRestricted.
- Added the method setChatMemberTag.
- Added the field can_edit_tag to the classes ChatMemberRestricted and ChatPermissions.
- Added the field can_manage_tags to the classes ChatMemberAdministrator and ChatAdministratorRights.
- Added the parameter can_manage_tags to the method promoteChatMember.
- Added the field sender_tag to the class Message.
- Added the field iconCustomEmojiId to the class BottomButton.

## Bot API 9.4 — February 9, 2026

### Polls

- Allowed bots to use custom emoji in messages directly sent by the bot to private, group and supergroup chats if the owner of the bot has a Telegram Premium subscription.
- Allowed bots to create topics in private chats using the method createForumTopic.
- Allowed bots to prevent users from creating and deleting topics in private chats through a new setting in the @BotFather Mini App.
- Added the field allows_users_to_create_topics to the class User.
- Added the field icon_custom_emoji_id to the classes KeyboardButton and InlineKeyboardButton, allowing bots to show a custom emoji on buttons if they are able to use custom emoji in the message.
- Added the field style to the classes KeyboardButton and InlineKeyboardButton, allowing bots to change the color of buttons.
- Added the class ChatOwnerLeft and the field chat_owner_left to the class Message.
- Added the class ChatOwnerChanged and the field chat_owner_changed to the class Message.
- Added the methods setMyProfilePhoto and removeMyProfilePhoto, allowing bots to manage their profile picture.
- Added the class VideoQuality and the field qualities to the class Video allowing bots to get information about other available qualities of a video.
- Added the field first_profile_audio to the class ChatFullInfo.
- Added the class UserProfileAudios and the method getUserProfileAudios, allowing bots to fetch a list of audios added to the profile of a user.
- Added the field rarity to the class UniqueGiftModel.
- Added the field is_burned to the class UniqueGift.

## Bot API 9.3 — December 31, 2025

### Topics in private chats

- Added the field has_topics_enabled to the class User, which can be used to determine whether forum topic mode is enabled for the bot in private chats.
- Added the method sendMessageDraft, allowing partial messages to be streamed to a user while being generated.
- Supported the fields message_thread_id and is_topic_message in the class Message for messages in private chats with forum topic mode enabled.
- Supported the parameter message_thread_id in private chats with topics in the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendPaidMedia, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, sendMediaGroup, copyMessage, copyMessages, forwardMessage, and forwardMessages, allowing bots to send a message to a specific topic.
- Supported the parameter message_thread_id in private chats in the method sendChatAction, allowing bots to send chat actions to a specific topic in private chats.
- Supported the parameter message_thread_id in private chats with topics in the method editForumTopic, deleteForumTopic, and unpinAllForumTopicMessages, allowing bots to manage topics in private chats.
- Added the field is_name_implicit to the classes ForumTopic and ForumTopicCreated.
### Gifts

- Added the methods getUserGifts and getChatGifts.
- Replaced the field last_resale_star_count with the fields last_resale_currency and last_resale_amount in the class UniqueGiftInfo.
- Replaced the parameter exclude_limited with the parameters exclude_limited_upgradable and exclude_limited_non_upgradable in the method getBusinessAccountGifts.
- Added the value “gifted_upgrade” as a possible value of UniqueGiftInfo.origin for messages about the upgrade of a gift that was purchased after it was sent.
- Added the value “offer” as a possible value of UniqueGiftInfo.origin for messages about the purchase of a gift through a purchase offer.
- Added the field gift_upgrade_sent to the class Message.
- Added the field gift_id to the class UniqueGift.
- Added the field is_from_blockchain to the class UniqueGift.
- Added the parameter exclude_from_blockchain in the method getBusinessAccountGifts, to filter out gifts that were assigned from the TON blockchain.
- Added the fields personal_total_count and personal_remaining_count to the class Gift.
- Added the field is_premium to the classes Gift and UniqueGift.
- Added the field is_upgrade_separate to the classes GiftInfo and OwnedGiftRegular.
- Added the class UniqueGiftColors that describes the color scheme for a user's name, replies to messages and link previews based on a unique gift.
- Added the field has_colors to the class Gift.
- Added the field colors to the class UniqueGift.
- Added the class GiftBackground and the field background to the class Gift.
- Added the field unique_gift_variant_count to the class Gift.
- Added the field unique_gift_number to the classes GiftInfo and OwnedGiftRegular.
- Added the field gifts_from_channels to the class AcceptedGiftTypes.
### Miscellaneous

- Allowed bots to disable their main username if they have additional active usernames purchased on Fragment.
- Allowed bots to disable the right can_restrict_members in channel chats.
- Added the method repostStory, allowing bots to repost stories across different business accounts they manage.
- Added the class UserRating and the field rating to the class ChatFullInfo.
- Increased the maximum price for paid media to 25000 Telegram Stars.
- Added the field paid_message_star_count to the class ChatFullInfo.
- Added the parameter message_effect_id to the methods forwardMessage and copyMessage.
- Added the field unique_gift_colors to the class ChatFullInfo.
- Added the field completed_by_chat to the class ChecklistTask.

## Bot API 9.2 — August 15, 2025

### Checklists

- Added the field checklist_task_id to the class ReplyParameters, allowing bots to reply to a specific checklist task.
- Added the field reply_to_checklist_task_id to the class Message.
### Gifts

- Added the field publisher_chat to the classes Gift and UniqueGift which can be used to get information about the chat that published a gift.
### Direct Messages in Channels

- Added the field is_direct_messages to the classes Chat and ChatFullInfo which can be used to identify supergroups that are used as channel direct messages chats.
- Added the field parent_chat to the class ChatFullInfo which indicates the parent channel chat for a channel direct messages chat.
- Added the class DirectMessagesTopic and the field direct_messages_topic to the class Message, describing a topic of a direct messages chat.
- Added the parameter direct_messages_topic_id to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendPaidMedia, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendDice, sendInvoice, sendMediaGroup, copyMessage, copyMessages, forwardMessage and forwardMessages. This parameter can be used to send a message to a direct messages chat topic.
### Suggested Posts

- Added the class SuggestedPostParameters and the parameter suggested_post_parameters to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendPaidMedia, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendDice, sendInvoice, copyMessage, forwardMessage. This parameter can be used to send a suggested post to a direct messages chat topic.
- Added the method approveSuggestedPost, allowing bots to approve incoming suggested posts.
- Added the method declineSuggestedPost, allowing bots to decline incoming suggested posts.
- Added the field can_manage_direct_messages to the classes ChatMemberAdministrator and ChatAdministratorRights.
- Added the parameter can_manage_direct_messages to the method promoteChatMember.
- Added the field is_paid_post to the class Message, which can be used to identify paid posts. Such posts must not be deleted for 24 hours to receive the payment.
- Added the class SuggestedPostPrice, describing the price of a suggested post.
- Added the class SuggestedPostInfo and the field suggested_post_info to the class Message, describing a suggested post.
- Added the class SuggestedPostApproved and the field suggested_post_approved to the class Message, describing a service message about the approval of a suggested post.
- Added the class SuggestedPostApprovalFailed and the field suggested_post_approval_failed to the class Message, describing a service message about the failed approval of a suggested post.
- Added the class SuggestedPostDeclined and the field suggested_post_declined to the class Message, describing a service message about the rejection of a suggested post.
- Added the class SuggestedPostPaid and the field suggested_post_paid to the class Message, describing a service message about a successful payment for a suggested post.
- Added the class SuggestedPostRefunded and the field suggested_post_refunded to the class Message, describing a service message about a payment refund for a suggested post.

## Bot API 9.1 — July 3, 2025

### Checklists

- Added the class ChecklistTask representing a task in a checklist.
- Added the class Checklist representing a checklist.
- Added the class InputChecklistTask representing a task to add to a checklist.
- Added the class InputChecklist representing a checklist to create.
- Added the field checklist to the classes Message and ExternalReplyInfo, describing a checklist in a message.
- Added the class ChecklistTasksDone and the field checklist_tasks_done to the class Message, describing a service message about status changes for tasks in a checklist (i.e., marked as done/not done).
- Added the class ChecklistTasksAdded and the field checklist_tasks_added to the class Message, describing a service message about the addition of new tasks to a checklist.
- Added the method sendChecklist, allowing bots to send a checklist on behalf of a business account.
- Added the method editMessageChecklist, allowing bots to edit a checklist on behalf of a business account.
### Gifts

- Added the field next_transfer_date to the classes OwnedGiftUnique and UniqueGiftInfo.
- Added the field last_resale_star_count to the class UniqueGiftInfo.
- Added “resale” as the possible value of the field origin in the class UniqueGiftInfo.
- Increased the maximum number of options in a poll to 12.
- Added the method getMyStarBalance, allowing bots to get their current balance of Telegram Stars.
- Added the class DirectMessagePriceChanged and the field direct_message_price_changed to the class Message, describing a service message about a price change for direct messages sent to the channel chat.
- Added the method hideKeyboard to the class WebApp.

## Bot API 9.0 — April 11, 2025

### Business Accounts

- Added the class BusinessBotRights and replaced the field can_reply with the field rights of the type BusinessBotRights in the class BusinessConnection.
- Added the method readBusinessMessage, allowing bots to mark incoming messages as read on behalf of a business account.
- Added the method deleteBusinessMessages, allowing bots to delete messages on behalf of a business account.
- Added the method setBusinessAccountName, allowing bots to change the first and last name of a managed business account.
- Added the method setBusinessAccountUsername, allowing bots to change the username of a managed business account.
- Added the method setBusinessAccountBio, allowing bots to change the bio of a managed business account.
- Added the class InputProfilePhoto, describing a profile photo to be set.
- Added the methods setBusinessAccountProfilePhoto and removeBusinessAccountProfilePhoto, allowing bots to change the profile photo of a managed business account.
- Added the method setBusinessAccountGiftSettings, allowing bots to change the privacy settings pertaining to incoming gifts in a managed business account.
- Added the class StarAmount and the method getBusinessAccountStarBalance, allowing bots to check the current Telegram Star balance of a managed business account.
- Added the method transferBusinessAccountStars, allowing bots to transfer Telegram Stars from the balance of a managed business account to their own balance for withdrawal.
- Added the classes OwnedGiftRegular, OwnedGiftUnique, OwnedGifts and the method getBusinessAccountGifts, allowing bots to fetch the list of gifts owned by a managed business account.
- Added the method convertGiftToStars, allowing bots to convert gifts received by a managed business account to Telegram Stars.
- Added the method upgradeGift, allowing bots to upgrade regular gifts received by a managed business account to unique gifts.
- Added the method transferGift, allowing bots to transfer unique gifts owned by a managed business account.
- Added the classes InputStoryContentPhoto and InputStoryContentVideo representing the content of a story to post.
- Added the classes StoryArea, StoryAreaPosition, LocationAddress, StoryAreaTypeLocation, StoryAreaTypeSuggestedReaction, StoryAreaTypeLink, StoryAreaTypeWeather and StoryAreaTypeUniqueGift, describing clickable active areas on stories.
- Added the method postStory, allowing bots to post a story on behalf of a managed business account.
- Added the method editStory, allowing bots to edit stories they had previously posted on behalf of a managed business account.
- Added the method deleteStory, allowing bots to delete stories they had previously posted on behalf of a managed business account.
### Mini Apps

- Added the field DeviceStorage, allowing Mini Apps to use persistent local storage on the user's device.
- Added the field SecureStorage, allowing Mini Apps to use a secure local storage on the user's device for sensitive data.
### Gifts

- Added the classes UniqueGiftModel, UniqueGiftSymbol, UniqueGiftBackdropColors, and UniqueGiftBackdrop to describe the properties of a unique gift.
- Added the class UniqueGift describing a gift that was upgraded to a unique one.
- Added the class AcceptedGiftTypes describing the types of gifts that are accepted by a user or a chat.
- Replaced the field can_send_gift with the field accepted_gift_types of the type AcceptedGiftTypes in the class ChatFullInfo.
- Added the class GiftInfo and the field gift to the class Message, describing a service message about a regular gift that was sent or received.
- Added the class UniqueGiftInfo and the field unique_gift to the class Message, describing a service message about a unique gift that was sent or received.
### Telegram Premium

- Added the method giftPremiumSubscription, allowing bots to gift a user a Telegram Premium subscription paid in Telegram Stars.
- Added the field premium_subscription_duration to the class TransactionPartnerUser for transactions involving a Telegram Premium subscription purchased by the bot.
- Added the field transaction_type to the class TransactionPartnerUser, simplifying the differentiation and processing of all transaction types.
- Increased the maximum price for paid media to 10000 Telegram Stars.
- Increased the maximum price for a subscription period to 10000 Telegram Stars.
- Added the class PaidMessagePriceChanged and the field paid_message_price_changed to the class Message, describing a service message about a price change for paid messages sent to the chat.
- Added the field paid_star_count to the class Message, containing the number of Telegram Stars that were paid to send the message.

## Bot API 8.3 — February 12, 2025

- Added the parameter chat_id to the method sendGift, allowing bots to send gifts to channel chats.
- Added the field can_send_gift to the class ChatFullInfo.
- Added the class TransactionPartnerChat describing transactions with chats.
- Added the fields cover and start_timestamp to the class Video, containing a message-specific cover and a start timestamp for the video.
- Added the parameters cover and start_timestamp to the method sendVideo, allowing bots to specify a cover and a start timestamp for the videos they send.
- Added the fields cover and start_timestamp to the classes InputMediaVideo and InputPaidMediaVideo, allowing bots to edit video cover and start timestamp and specify them for videos in albums and paid media.
- Added the parameter video_start_timestamp to the methods forwardMessage and copyMessage, allowing bots to change the start timestamp for forwarded and copied videos.
- Allowed to add reactions to most types of service messages.

## Bot API 8.2 — January 1, 2025

- Added the methods verifyUser, verifyChat, removeUserVerification and removeChatVerification, allowing bots to manage verifications on behalf of an organization.
- Added the field upgrade_star_count to the class Gift.
- Added the parameter pay_for_upgrade to the method sendGift.
- Removed the field hide_url from the class InlineQueryResultArticle. Pass an empty string as url instead.

## Bot API 8.1 — December 4, 2024

- Added the field nanostar_amount to the class StarTransaction.
- Added the class TransactionPartnerAffiliateProgram for transactions pertaining to incoming affiliate commissions.
- Added the class AffiliateInfo and the field affiliate to the class TransactionPartnerUser, allowing bots to identify the relevant affiliate in transactions with an affiliate commission.

## Bot API 8.0 — November 17, 2024

### Star Subscriptions

- Bots now support paid subscriptions powered by Telegram Stars - monetizing their efforts with multiple tiers of content and features.
- Added the parameter subscription_period to the method createInvoiceLink to support the creation of links that are billed periodically.
- Added the parameter business_connection_id to the method createInvoiceLink to support the creation of invoice links on behalf of business accounts.
- Added the fields subscription_expiration_date, is_recurring and is_first_recurring to the class SuccessfulPayment.
- Added the method editUserStarSubscription.
- Added the field subscription_period to the class TransactionPartnerUser.
### Full-screen Mode

- Mini Apps are now able to become full-screen in both portrait and landscape mode - allowing them to host more games, play widescreen media and support immersive user experiences.
- Added the methods requestFullscreen and exitFullscreen to the class WebApp to toggle full-screen mode.
- Added the fields safeAreaInset and contentSafeAreaInset to the class WebApp, allowing Mini Apps to ensure that their content properly respects the device's safe area margins.
- Further added the fields isActive and isFullscreen to the class WebApp.
- Added the events activated, deactivated, safeAreaChanged, contentSafeAreaChanged, fullscreenChanged and fullscreenFailed for Mini Apps.
### Homescreen Shortcuts

- Mini Apps can now be accessed via direct shortcuts added to the home screen of mobile devices.
- Added the method addToHomeScreen to the class WebApp to create a shortcut for users to add to their home screens.
- Added the method checkHomeScreenStatus to the class WebApp to determine the status and support of the home screen shortcut for the Mini App on the current device.
- Added the events homeScreenAdded and homeScreenChecked for Mini Apps.
### Emoji Status

- Mini Apps can now prompt users to set their emoji status - or request access to later sync it automatically with in-game badges, third-party APIs and more.
- Added the method setUserEmojiStatus. The user must allow the bot to manage their emoji status.
- Added the method setEmojiStatus to the class WebApp to let users manually confirm a custom emoji as their new status via a native dialog.
- Added the method requestEmojiStatusAccess to the class WebApp for obtaining permission to later update a user's emoji status via the Bot API method setUserEmojiStatus.
- Added the events emojiStatusSet, emojiStatusFailed and emojiStatusAccessRequested for Mini Apps.
### Media Sharing and File Downloads

- Users can now share media directly from Mini Apps - sending referral codes, custom memes, artwork and more to any chat or posting them as a story.
- Added the class PreparedInlineMessage and the method savePreparedInlineMessage, allowing bots to suggest users to send a specific message from a Mini App via the method shareMessage.
- Added the method shareMessage to the class WebApp to share media from Mini Apps to Telegram chats.
- Added the method downloadFile to the class WebApp, introducing support for a native popup that prompts users to download files from the Mini App.
- Added the events shareMessageSent, shareMessageFailed and fileDownloadRequested for Mini Apps.
### Geolocation Access

- Mini Apps can now request geolocation access to users, allowing them to build virtually any location-based service, from games with dynamic points of interest to interactive maps for events.
- Added the field LocationManager to the class WebApp.
- Added the events locationManagerUpdated and locationRequested for Mini Apps.
### Device Motion Tracking

- Mini Apps can now track detailed device motion data, allowing them to implement better productivity tools, immersive VR experiences and more.
- Added the fields isOrientationLocked, Accelerometer, DeviceOrientation and Gyroscope to the class WebApp.
- Added the methods lockOrientation and unlockOrientation to the class WebApp to control the screen orientation.
- Added the events accelerometerStarted, accelerometerStopped, accelerometerChanged, accelerometerFailed, deviceOrientationStarted, deviceOrientationStopped, deviceOrientationChanged, deviceOrientationFailed, gyroscopeStarted, gyroscopeStopped, gyroscopeChanged, gyroscopeFailed for Mini Apps.
### Gifts

- Bots can now send Paid Gifts to users in exchange for Telegram Stars.
- Added the classes Gift and Gifts and the method getAvailableGifts, allowing bots to get all gifts available for sending.
- Added the method sendGift, allowing bots to send gifts to users.
- Added the field gift to the class TransactionPartnerUser.
### Loading Screen Customization

- Mini Apps can customize their loading screen, adding their own icon and specific colors for light and dark themes.
- You can access these customization settings in @BotFather via /mybots > Select Bot > Bot Settings > Configure Mini App > Enable Mini App
### Hardware-specific Optimizations

- Mini Apps running on Android can now receive basic information about a device's processing hardware, allowing them to optimize user experience based on the device's capabilities.
- This information includes the OS, App and SDK's respective versions as well as the device's model and performance class.
- Added the field photo_url to the class WebAppUser for all bots, allowing Mini Apps to access a user's profile photo if their privacy settings allow for it.
- Third parties (e.g., Mini App builders) that receive or process data on behalf of Mini Apps are now able to validate it without knowing the App's bot token.
- Debugging options have been expanded to include full support for iOS devices. You can use these tools to find app-specific issues in your Mini App.
### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="october-31-2024" href="#october-31-2024"><i class="anchor-icon"></i></a>October 31, 2024</h4>
<p><strong>Bot API 7.11

- Added the class CopyTextButton and the field copy_text in the class InlineKeyboardButton allowing bots to send and receive inline buttons that copy arbitrary text.
- Added the parameter allow_paid_broadcast to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendPaidMedia, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, sendMediaGroup and copyMessage.
- Added the class TransactionPartnerTelegramApi for transactions related to paid broadcasted messages.
- Introduced the ability to add media to existing text messages using the method editMessageMedia.
- Added support for hashtag and cashtag entities with a specified chat username that opens a search for the relevant tag within the specified chat.
### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added updates about purchased paid media, represented by the class PaidMediaPurchased and the field purchased_paid_media in the class Update.
- Added the ability to specify a payload in sendPaidMedia that is received back by the bot in TransactionPartnerUser and purchased_paid_media updates.
- Added the field prize_star_count to the classes GiveawayCreated, Giveaway, GiveawayWinners and ChatBoostSourceGiveaway.
- Added the field is_star_giveaway to the class GiveawayCompleted.
- Added the field SecondaryButton to the class WebApp.
- Added the event secondaryButtonClicked for Mini Apps.
- Added the field bottomBarColor and the method setBottomBarColor to the class WebApp.
- Added the field bottom_bar_bg_color to the class ThemeParams.

## Bot API 7.9 — August 14, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added support for Super Channels, allowing received channel messages to have users or other channels as their senders.
- Added the ability to send paid media to any chat.
- Added the parameter business_connection_id to the method sendPaidMedia, allowing bots to send paid media on behalf of a business account.
- Added the field paid_media to the class TransactionPartnerUser for transactions involving paid media.
- Added the fields subscription_period and subscription_price to the class ChatInviteLink.
- Added the method createChatSubscriptionInviteLink, allowing bots to create subscription invite links.
- Added the method editChatSubscriptionInviteLink, allowing bots to edit the name of subscription invite links.
- Added the field until_date to the class ChatMemberMember for members with an active subscription.
- Added support for paid reactions and the class ReactionTypePaid.

## Bot API 7.8 — July 31, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added the option for bots to set a Main Mini App, which can be previewed and launched directly from a button in the bot's profile or a link.
- Added the method shareToStory to the class WebApp.
- Added the field has_main_web_app to the class User, which is returned in the response to getMe.
- Added the parameter business_connection_id to the methods pinChatMessage and unpinChatMessage, allowing bots to manage pinned messages on behalf of a business account.

## Bot API 7.7 — July 7, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added the class RefundedPayment, containing information about a refunded payment.
- Added the field refunded_payment to the class Message, describing a service message about a refunded payment.
- Added the field isVerticalSwipesEnabled and the methods enableVerticalSwipes, disableVerticalSwipes to the class WebApp.
- Added the event scanQrPopupClosed for Mini Apps.

## Bot API 7.6 — July 1, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added the classes PaidMedia, PaidMediaInfo, PaidMediaPreview, PaidMediaPhoto and PaidMediaVideo, containing information about paid media.
- Added the method sendPaidMedia and the classes InputPaidMedia, InputPaidMediaPhoto and InputPaidMediaVideo, to support sending paid media.
- Documented that the methods copyMessage and copyMessages cannot be used to copy paid media.
- Added the field can_send_paid_media to the class ChatFullInfo.
- Added the field paid_media to the classes Message and ExternalReplyInfo.
- Added the class TransactionPartnerTelegramAds, containing information about Telegram Star transactions involving the Telegram Ads Platform.
- Added the field invoice_payload to the class TransactionPartnerUser, containing the bot-specified invoice payload.
- Changed the default opening mode for Direct Link Mini Apps.
- Added support for launching Web Apps via t.me link in the class MenuButtonWebApp.
- Added the field section_separator_color to the class ThemeParams.

## Bot API 7.5 — June 18, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added the classes StarTransactions, StarTransaction, TransactionPartner and RevenueWithdrawalState, containing information about Telegram Star transactions involving the bot.
- Added the method getStarTransactions that can be used to get the list of all Telegram Star transactions for the bot.
- Added support for callback buttons in InlineKeyboardMarkup for messages sent on behalf of a business account.
- Added support for callback queries originating from a message sent on behalf of a business account.
- Added the parameter business_connection_id to the methods editMessageText, editMessageMedia, editMessageCaption, editMessageLiveLocation, stopMessageLiveLocation and editMessageReplyMarkup, allowing the bot to edit business messages.
- Added the parameter business_connection_id to the method stopPoll, allowing the bot to stop polls it sent on behalf of a business account.

## Bot API 7.4 — May 28, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added support for payments in Telegram Stars by introducing the new currency “XTR”.
- The parameter provider_token of the methods sendInvoice and createInvoiceLink must be omitted for payments in Telegram Stars.
- The field provider_token in the class InputInvoiceMessageContent must be omitted for payments in Telegram Stars.
- Added the method refundStarPayment.
- Added the field effect_id to the class Message.
- Added the parameter message_effect_id to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, and sendMediaGroup.
- Added the field show_caption_above_media to the classes Message, InputMediaAnimation, InputMediaPhoto, InputMediaVideo, InlineQueryResultGif, InlineQueryResultMpeg4Gif, InlineQueryResultPhoto, InlineQueryResultVideo, InlineQueryResultCachedGif, InlineQueryResultCachedMpeg4Gif, InlineQueryResultCachedPhoto, and InlineQueryResultCachedVideo.
- Added the parameter show_caption_above_media to the methods sendAnimation, sendPhoto, sendVideo, copyMessage, and editMessageCaption.
- Added support for “expandable_blockquote” entities in received messages.
- Added support for “expandable_blockquote” entity parsing in “MarkdownV2” and “HTML” parse modes.
- Allowed to explicitly specify “expandable_blockquote” entities in formatted texts.

## Bot API 7.3 — May 6, 2024

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>Starting December 1, 2024 messages with video that are sent, copied or forwarded to groups and channels with a sufficiently large audience can be automatically scheduled by the server until the respective video is reencoded. Such messages will have 0 as their message identifier and can't be used before they are actually sent.</p>
</blockquote>
<h4><a class="anchor" name="september-6-2024" href="#september-6-2024"><i class="anchor-icon"></i></a>September 6, 2024</h4>
<p><strong>Bot API 7.10

- Added support for InlineKeyboardMarkup with url, login_url, and callback_game buttons for messages sent on behalf of a business account.
- Added the field via_join_request to the class ChatMemberUpdated.
- Added support for live locations that can be edited indefinitely, allowing 0x7FFFFFFF to be used as live_period.
- Added the parameter live_period to the method editMessageLiveLocation.
- Added the field question_entities to the class Poll.
- Added the field text_entities to the class PollOption.
- Added the parameters question_parse_mode and question_entities to the method sendPoll.
- Added the class InputPollOption and changed the type of the parameter options in the method sendPoll to Array of InputPollOption.
- Added the classes ChatBackground, BackgroundType, BackgroundFill and the field chat_background_set of type ChatBackground to the class Message, describing service messages about background changes.
- Split out the class ChatFullInfo from the class Chat and changed the return type of the method getChat to ChatFullInfo.
- Added the field max_reaction_count to the class ChatFullInfo.
- Documented that .MP3 and .M4A files can be used as voice messages.

## Bot API 7.2 — March 31, 2024

### Integration with Business Accounts

- Added the class BusinessConnection and updates about the connection or disconnection of the bot to a business account, represented by the field business_connection in the class Update.
- Added updates about new messages in a business account connected to the bot, represented by the field business_message in the class Update.
- Added updates about message edits in a business account connected to the bot, represented by the field edited_business_message in the class Update.
- Added updates about message deletion in a business account connected to the bot, represented by the class BusinessMessagesDeleted and the field deleted_business_messages in the class Update.
- Added the method getBusinessConnection.
### Working on Behalf of Business Accounts

- Added the parameter business_connection_id to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendGame, and sendMediaGroup.
- Added the parameter business_connection_id to the method sendChatAction.
- Added the field business_connection_id to the class Message.
- Added the field sender_business_bot to the class Message.
### Information about Business Accounts

- Added the class BusinessIntro and the field business_intro to the class Chat.
- Added the class BusinessLocation and the field business_location to the class Chat.
- Added the classes BusinessOpeningHours and BusinessOpeningHoursInterval and the field business_opening_hours to the class Chat.
### Mixed-Format Sticker Packs

- Removed the fields is_animated and is_video from the class StickerSet.
- Added the field format to the class InputSticker.
- Removed the parameter sticker_format from the method createNewStickerSet.
- Added the parameter format to the method setStickerSetThumbnail.
- Increased the maximum number of stickers in any regular and mask sticker set to 120.
- Allowed to upload .WEBM stickers using SendSticker.
### Request Chat Improvements

- Added the fields request_name, request_username, and request_photo to the class KeyboardButtonRequestUsers.
- Added the fields request_title, request_username, and request_photo to the class KeyboardButtonRequestChat.
- Added the class SharedUser and replaced the field user_ids in the class UsersShared with the field users.
- Added the fields title, username, and photo to the class ChatShared.
### Other Changes

- Added the field is_from_offline to the class Message.
- Added the field can_connect_to_business to the class User.
- Added the field personal_chat to the class Chat.
- Added the method replaceStickerInSet,
- Added the class Birthdate and the field birthdate to the class Chat.
- Added the field BiometricManager to the class WebApp.

## Bot API 7.1 — February 16, 2024

### Other Changes

- Added support for the administrator rights can_post_stories, can_edit_stories, can_delete_stories in supergroups.
- Added the class ChatBoostAdded and the field boost_added to the class Message for service messages about a user boosting a chat.
- Added the field sender_boost_count to the class Message.
- Added the field reply_to_story to the class Message.
- Added the fields chat and id to the class Story.
- Added the field unrestrict_boost_count to the class Chat.
- Added the field custom_emoji_sticker_set_name to the class Chat.

## Bot API 7.0 — December 29, 2023

### Reactions

- Added the classes ReactionTypeEmoji and ReactionTypeCustomEmoji representing different types of reaction.
- Added updates about a reaction change on a message with non-anonymous reactions, represented by the class MessageReactionUpdated and the field message_reaction in the class Update. The bot must explicitly allow the update to receive it.
- Added updates about reaction changes on a message with anonymous reactions, represented by the class MessageReactionCountUpdated and the field message_reaction_count in the class Update. The bot must explicitly allow the update to receive it.
- Added the method setMessageReaction that allows bots to react to messages.
- Added the field available_reactions to the class Chat.
### Replies 2.0

- Added the ability to reply to messages in other chats or forum topics.
- Added the class ExternalReplyInfo and the field external_reply of type ExternalReplyInfo to the class Message, containing information about a message that is replied to by the current message, but can be from another chat or forum topic.
- Added the ability to quote a part of the replied message.
- Added the class TextQuote and the field quote of type TextQuote to the class Message, which contains the part of the replied message text or caption that is quoted in the current message.
- Added the class ReplyParameters and replaced parameters reply_to_message_id and allow_sending_without_reply in the methods copyMessage, sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, and sendMediaGroup with the field reply_parameters of type ReplyParameters.
### Link Preview Customization

- Allowed to explicitly specify the URL that will be used for link preview generation in outgoing text messages.
- Allowed to position link previews above the message text.
- Allowed to choose media size in link previews.
- Added the class LinkPreviewOptions and replaced the parameter disable_web_page_preview with link_preview_options in the methods sendMessage and editMessageText.
- Replaced the field disable_web_page_preview with link_preview_options in the class InputTextMessageContent.
- Added the field link_preview_options to the class Message with information about the link preview options used to send the message.
### Block Quotation

- Added support for “blockquote” entities in received messages.
- Added support for “blockquote” entity parsing in “MarkdownV2” and “HTML” parse modes.
- Allowed to explicitly specify “blockquote” entities in formatted texts.
### Multiple Message Actions

- Added the method deleteMessages to allow the deletion of multiple messages in a single request.
- Added the method forwardMessages for forwarding of multiple messages in a single request.
- Added the method copyMessages for copying of multiple messages in a single request.
### Request for multiple users

- Renamed the class KeyboardButtonRequestUser to KeyboardButtonRequestUsers and added the field max_quantity to it.
- Renamed the field request_user in the class KeyboardButton to request_users. The old name will still work for backward compatibility.
- Added the class UsersShared.
- Replaced the field user_shared in the class Message with the field users_shared.
### Chat Boost

- Added updates about chat boost changes, represented by the classes ChatBoostUpdated and ChatBoostRemoved and the fields chat_boost and removed_chat_boost in the class Update. The bot must be an administrator in the chat to receive these updates.
- Added the classes ChatBoostSourcePremium, ChatBoostSourceGiftCode and ChatBoostSourceGiveaway, representing different sources of a chat boost.
- Added the method getUserChatBoosts for obtaining the list of all active boosts a user has contributed to a chat.
### Giveaway

- Added the class Giveaway and the field giveaway to the class Message for messages about scheduled giveaways.
- Added the class GiveawayCreated and the field giveaway_created to the class Message for service messages about the creation of a scheduled giveaway.
- Added the class GiveawayWinners and the field giveaway_winners to the class Message for messages about the completion of a giveaway with public winners.
- Added the class GiveawayCompleted and the field giveaway_completed to the class Message for service messages about the completion of a giveaway without public winners.
### Web App Changes

- Added the field SettingsButton to the class WebApp.
- Added the fields header_bg_color, accent_text_color, section_bg_color, section_header_text_color, subtitle_text_color, destructive_text_color to the class ThemeParams.
- Web Apps no longer close when the method WebApp.openTelegramLink is called.
### Other Changes

- Added support for the fields emoji_status_custom_emoji_id and emoji_status_expiration_date in the class Chat for non-private chats.
- Added the fields accent_color_id, background_custom_emoji_id, profile_accent_color_id, and profile_background_custom_emoji_id to the class Chat.
- Added the field has_visible_history to the class Chat.
- Added the class MessageOrigin and replaced the fields forward_from, forward_from_chat, forward_from_message_id, forward_signature, forward_sender_name, and forward_date with the field forward_origin of type MessageOrigin in the class Message.
- Improved documentation for the field message of the class callbackQuery and the field pinned_message of the class Message by adding the classes MaybeInaccessibleMessage and InaccessibleMessage.

## Bot API 6.9 — September 22, 2023

### Other Changes

- Added the new administrator privileges can_post_stories, can_edit_stories and can_delete_stories to the classes ChatMemberAdministrator and ChatAdministratorRights.
- Added the parameters can_post_stories, can_edit_stories and can_delete_stories to the method promoteChatMember. Currently, bots have no use for these privileges besides assigning them to other administrators.
- Added the ability to set any header color for Web App using the method setHeaderColor.
- Added the field CloudStorage to the class WebApp.
- Added the methods requestWriteAccess and requestContact to the class WebApp.
- Added Web App events writeAccessRequested and contactRequested.
- Added the fields from_request and from_attachment_menu to the class WriteAccessAllowed.
- Added the fields added_to_attachment_menu and allows_write_to_pm to the class WebAppUser.

## Bot API 6.8 — August 18, 2023

### Other Changes

- Added the field story to the class Message for messages with forwarded stories. Currently, it holds no information.
- Added the field voter_chat to the class PollAnswer, to contain channel chat voters in Polls. For backward compatibility, the field user in such objects will contain the user 136817688 (@Channel_Bot).
- Added the field emoji_status_expiration_date to the class Chat.
- Added the method unpinAllGeneralForumTopicMessages.
- Increased to 512 characters the maximum length of the startapp parameter in direct Web App links.

## Bot API 6.7 — April 21, 2023

### Other Changes

- Added support for launching Web Apps from inline query results by replacing the parameters switch_pm_text and switch_pm_parameter of the method answerInlineQuery with the parameter button of type InlineQueryResultsButton.
- Added the field web_app_name to the class WriteAccessAllowed.
- Added the field switch_inline_query_chosen_chat of the type SwitchInlineQueryChosenChat to the class InlineKeyboardButton, which allows bots to switch to inline mode in a chosen chat of the given type.
- Added the field via_chat_folder_invite_link to the class ChatMemberUpdated.
- Added the ability to set different bot names for different user languages using the method setMyName.
- Added the ability to get the current bot name in the given language as the class BotName using the method getMyName.
- Added the ability to change bot settings from the bot's profile in official Telegram apps, including the ability to set animated profile photos.
- Added the ability to specify custom emoji entities using HTML and MarkdownV2 formatting options for bots that purchased additional usernames on Fragment.

## Bot API 6.6 — March 9, 2023

### Other Changes

- Added the ability to set different bot descriptions for different user languages using the method setMyDescription.
- Added the ability to get the current bot description in the given language as the class BotDescription using the method getMyDescription.
- Added the ability to set different bot short descriptions for different user languages using the method setMyShortDescription.
- Added the ability to get the current bot short description in the given language as the class BotShortDescription using the method getMyShortDescription.
- Added the parameter emoji to the method sendSticker to specify an emoji for just uploaded stickers.
- Added support for the creation of custom emoji sticker sets in createNewStickerSet.
- Added the parameter needs_repainting to the method createNewStickerSet to automatically change the color of emoji based on context (e.g., use text color in messages, accent color in statuses, etc.).
- Added the field needs_repainting to the class Sticker.
- Replaced the parameters png_sticker, tgs_sticker, webm_sticker, emojis and mask_position in the method addStickerToSet with the parameter sticker of the type InputSticker.
- Added support for the creation of sticker sets with multiple initial stickers in createNewStickerSet by replacing the parameters png_sticker, tgs_sticker, webm_sticker, emojis and mask_position with the parameters stickers and sticker_format.
- Added support for .WEBP files in createNewStickerSet and addStickerToSet.
- Added support for .WEBP, .TGS, and .WEBM files in uploadStickerFile by replacing the parameter png_sticker in the method uploadStickerFile with the parameters sticker and sticker_format.
- Added the ability to specify search keywords for stickers added to sticker sets.
- Added the method setCustomEmojiStickerSetThumbnail for editing the thumbnail of custom emoji sticker sets created by the bot.
- Added the method setStickerSetTitle for editing the title of sticker sets created by the bot.
- Added the method deleteStickerSet for complete deletion of a given sticker set that was created by the bot.
- Added the method setStickerEmojiList for changing the list of emoji associated with a sticker.
- Added the method setStickerKeywords for changing the search keywords assigned to a sticker.
- Added the method setStickerMaskPosition for changing the mask position of a mask sticker.
- Renamed the field thumb in the classes Animation, Audio, Document, Sticker, Video, VideoNote, InputMediaAnimation, InputMediaAudio, InputMediaDocument, InputMediaVideo, StickerSet to thumbnail.
- Renamed the parameter thumb in the methods sendAnimation, sendAudio, sendDocument, sendVideo, sendVideoNote to thumbnail.
- Renamed the method setStickerSetThumb to setStickerSetThumbnail and its parameter thumb to thumbnail.
- Renamed the fields thumb_url, thumb_width, and thumb_height in the classes InlineQueryResultArticle, InlineQueryResultContact, InlineQueryResultDocument, InlineQueryResultLocation, and InlineQueryResultVenue to thumbnail_url, thumbnail_width, and thumbnail_height respectively.
- Renamed the field thumb_url in the classes InlineQueryResultPhoto and InlineQueryResultVideo to thumbnail_url.
- Renamed the fields thumb_url and thumb_mime_type in the classes InlineQueryResultGif, and InlineQueryResultMpeg4Gif to thumbnail_url and thumbnail_mime_type respectively.

## Bot API 6.5 — February 3, 2023

### Other Changes

- Added requests for users and chats and support for granular media permissions.
- Added the class KeyboardButtonRequestUser and the field request_user to the class KeyboardButton.
- Added the class KeyboardButtonRequestChat and the field request_chat to the class KeyboardButton.
- Added the classes UserShared, ChatShared and the fields user_shared, and chat_shared to the class Message.
- Replaced the fields can_send_media_messages in the classes ChatMemberRestricted and ChatPermissions with separate fields can_send_audios, can_send_documents, can_send_photos, can_send_videos, can_send_video_notes, and can_send_voice_notes for different media types.
- Added the parameter use_independent_chat_permissions to the methods restrictChatMember and setChatPermissions.
- Added the field user_chat_id to the class ChatJoinRequest.

## Bot API 6.4 — December 30, 2022

### Other Changes

- Added the field is_persistent to the class ReplyKeyboardMarkup, allowing to control when the keyboard is shown.
- Added the parameter has_spoiler to the methods sendPhoto, sendVideo, and sendAnimation.
- Added the field has_spoiler to the classes InputMediaPhoto, InputMediaVideo, and InputMediaAnimation.
- Added the field has_media_spoiler to the class Message.
- The parameters name and icon_custom_emoji_id of the method editForumTopic are now optional. If they are omitted, the existing values are kept.
- Added the classes ForumTopicEdited, GeneralForumTopicHidden, GeneralForumTopicUnhidden, and WriteAccessAllowed and the fields forum_topic_edited, general_forum_topic_hidden, general_forum_topic_unhidden, and write_access_allowed to the class Message.
- Added the methods editGeneralForumTopic, closeGeneralForumTopic, reopenGeneralForumTopic, hideGeneralForumTopic, unhideGeneralForumTopic for managing the General topic in forums.
- Added the parameter message_thread_id to the method sendChatAction for sending chat actions to a specific message thread or a forum topic.
- Added the field has_hidden_members to the class Chat. Note that the method getChatMember is only guaranteed to work if the bot is an administrator in the chat.
- Added the field has_aggressive_anti_spam_enabled to the class Chat.
- Added Web App events qrTextReceived and clipboardTextReceived.
- Added the field platform to the class WebApp.
- Added the methods showScanQrPopup, closeScanQrPopup, and readTextFromClipboard to the class WebApp.
- Added the parameter options to the method openLink of the class WebApp.

## Bot API 6.3 — November 5, 2022

### Other Changes

- Added support for Topics in Groups.
- Added the field is_forum to the class Chat.
- Added the fields is_topic_message and message_thread_id to the class Message to allow detection of messages belonging to a forum topic and their message thread identifier.
- Added the classes ForumTopicCreated, ForumTopicClosed, and ForumTopicReopened and the fields forum_topic_created, forum_topic_closed, and forum_topic_reopened to the class Message. Note that service messages about forum topic creation can't be deleted with the deleteMessage method.
- Added the field can_manage_topics to the classes ChatAdministratorRights, ChatPermissions, ChatMemberAdministrator, and ChatMemberRestricted.
- Added the parameter can_manage_topics to the method promoteChatMember.
- Added the methods createForumTopic, editForumTopic, closeForumTopic, reopenForumTopic, deleteForumTopic, unpinAllForumTopicMessages, and getForumTopicIconStickers for forum topic management.
- Added the parameter message_thread_id to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, sendMediaGroup, copyMessage, forwardMessage to support sending of messages to a forum topic.
- Added support for Multiple Usernames via the field active_usernames in the class Chat.
- Added the field emoji_status_custom_emoji_id to the class Chat.

## Bot API 6.2 — August 12, 2022

### Custom Emoji Support

- Added the MessageEntity type “custom_emoji”.
- Added the field custom_emoji_id to the class MessageEntity for “custom_emoji” entities.
- Added the method getCustomEmojiStickers.
- Added the fields type and custom_emoji_id to the class Sticker.
- Added the field sticker_type to the class StickerSet, describing the type of stickers in the set.
- The field contains_masks has been removed from the documentation of the class StickerSet. The field is still returned in the object for backward compatibility, but new bots should use the field sticker_type instead.
- Added the parameter sticker_type to the method createNewStickerSet.
- The parameter contains_masks has been removed from the documentation of the method createNewStickerSet. The parameter will still work for backward compatibility, but new bots should use the parameter sticker_type instead.
### Web App Improvements

- Added the field isClosingConfirmationEnabled and the methods enableClosingConfirmation, disableClosingConfirmation, showPopup, showAlert, showConfirm to the class WebApp.
- Added the field is_premium to the class WebAppUser.
- Added the event popupClosed.
### Other Changes

- Added the field has_restricted_voice_and_video_messages to the class Chat to support the new setting.

## Bot API 6.1 — June 20, 2022

### Media in Descriptions

- Added support for photos and videos in the 'What can this bot do?' section (shown on the bot's start screen). Use BotFather to set up media.
### Web App Improvements

- Added the fields version, headerColor, backgroundColor, BackButton, HapticFeedback and the methods isVersionAtLeast, setHeaderColor, setBackgroundColor, openLink, openTelegramLink, openInvoice to the class WebApp.
- Added the field secondary_bg_color to the class ThemeParams.
- Added the method offClick to the class MainButton.
- Added the fields chat, can_send_after to the class WebAppInitData.
- Added the events backButtonClicked, settingsButtonClicked, invoiceClosed.
### Join Requests & Payments

- Added the fields join_to_send_messages and join_by_request to the class Chat.
- Added the ability to process join requests which were created without an invite link. Bots will receive a “chat_join_request” update as usual.
- Added the method createInvoiceLink to generate an HTTP link for an invoice.
### Telegram Premium Support</strong> (<a href="https://telegram.org/blog/700-million-and-premium#telegram-premium">more info</a>)</p>
<ul>
<li>The maximum value of the field <em>file_size</em> in the classes <a href="/bots/api#animation">Animation</a>, <a href="/bots/api#audio">Audio</a>, <a href="/bots/api#document">Document</a>, <a href="/bots/api#video">Video</a>, <a href="/bots/api#voice">Voice</a>, and <a href="/bots/api#file">File</a> can no longer be stored in a signed 32-bit integer type. This change is necessary to support 4GB files uploaded by <a href="https://telegram.org/blog/700-million-and-premium#telegram-premium">premium accounts</a>.</li>
<li>Added the field <em>is_premium</em> to the class <a href="/bots/api#user">User</a>.</li>
<li>Added the field <em>premium_animation</em> to the class <a href="/bots/api#sticker">Sticker</a>.</li>
</ul>
<p><strong>Attachment Menu Integration

- Added the field added_to_attachment_menu to the class User.
- Bots integrated in the attachment menu can now be used in groups, supergroups and channels.
- Added support for t.me links that can be used to select the chat in which the attachment menu with the bot will be opened.
### Other Changes

- Added the parameter secret_token to the method setWebhook.
- As previously announced, only HTTPS links are now allowed in login_url inline keyboard buttons.

## Bot API 6.0 — April 16, 2022

### Other Changes

- Added support for Web Apps, see the detailed manual here. (blog announcement)
- Added the class WebAppInfo and the fields web_app to the classes KeyboardButton and InlineKeyboardButton.
- Added the class SentWebAppMessage and the method answerWebAppQuery for sending an answer to a Web App query, which originated from an inline button of the 'web_app' type.
- Added the class WebAppData and the field web_app_data to the class Message.
- Added the class MenuButton and the methods setChatMenuButton and getChatMenuButton for managing the behavior of the bot's menu button in private chats.
- Added the class ChatAdministratorRights and the methods setMyDefaultAdministratorRights and getMyDefaultAdministratorRights for managing the bot's default administrator rights.
- Added support for t.me links that can be used to add the bot to groups and channels as an administrator.
- Added the field last_synchronization_error_date to the class WebhookInfo.
- Renamed the field can_manage_voice_chats to can_manage_video_chats in the class ChatMemberAdministrator. The old field will remain temporarily available.
- Renamed the parameter can_manage_voice_chats to can_manage_video_chats in the method promoteChatMember. The old parameter will remain temporarily available.
- Renamed the fields voice_chat_scheduled, voice_chat_started, voice_chat_ended, and voice_chat_participants_invited to video_chat_scheduled, video_chat_started, video_chat_ended, and video_chat_participants_invited in the class Message. The old fields will remain temporarily available.
### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>After the next update, only HTTPS links will be allowed in <em>login_url</em> inline keyboard buttons.</p>
</blockquote>
<hr>
<h4><a class="anchor" name="january-31-2022" href="#january-31-2022"><i class="anchor-icon"></i></a>January 31, 2022</h4>
<p><strong>Bot API 5.7

- Added support for Video Stickers.
- Added the field is_video to the classes Sticker and StickerSet.
- Added the parameter webm_sticker to the methods createNewStickerSet and addStickerToSet.

## Bot API 5.6 — December 30, 2021

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>After the next update, only HTTPS links will be allowed in <em>login_url</em> inline keyboard buttons.</p>
</blockquote>
<hr>
<h4><a class="anchor" name="january-31-2022" href="#january-31-2022"><i class="anchor-icon"></i></a>January 31, 2022</h4>
<p><strong>Bot API 5.7

- Improved support for Protected Content.
- Added the parameter protect_content to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, sendMediaGroup, copyMessage, forwardMessage to allow sending messages with protected content to any chat.
- Added support for spoiler entities, which will work in Telegram versions released after December 30, 2021. Older clients will display unsupported message.
- Added new MessageEntity type “spoiler”.
- Added the ability to specify spoiler entities using HTML and MarkdownV2 formatting options.

## Bot API 5.5 — December 7, 2021

### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>After the next update, only HTTPS links will be allowed in <em>login_url</em> inline keyboard buttons.</p>
</blockquote>
<hr>
<h4><a class="anchor" name="january-31-2022" href="#january-31-2022"><i class="anchor-icon"></i></a>January 31, 2022</h4>
<p><strong>Bot API 5.7

- Bots are now allowed to contact users who sent a join request to a chat where the bot is an administrator with the can_invite_users administrator right - even if the user never interacted with the bot before.
- Added support for mentioning users by their ID in inline keyboards. This will only work in Telegram versions released after December 7, 2021. Older clients will display unsupported message.
- Added the methods banChatSenderChat and unbanChatSenderChat for banning and unbanning channel chats in supergroups and channels.
- Added the field has_private_forwards to the class Chat for private chats, which can be used to check the possibility of mentioning the user by their ID.
- Added the field has_protected_content to the classes Chat and Message.
- Added the field is_automatic_forward to the class Message.
### Note:</strong> After this update it will become impossible to forward messages from some chats. Use the fields <em>has_protected_content</em> in the classes <a href="/bots/api#message">Message</a> and <a href="/bots/api#chat">Chat</a> to check this.</p>
<p><strong>Note:</strong> After this update users are able to send messages on behalf of channels they own. Bots are expected to use the field <em>sender_chat</em> in the class <a href="/bots/api#message">Message</a> to correctly support such messages.</p>
<p><strong>Note:</strong> As previously announced, user identifiers can now have up to 52 significant bits and require a 64-bit integer or double-precision float type to be stored safely.</p>
<h4><a class="anchor" name="november-5-2021" href="#november-5-2021"><i class="anchor-icon"></i></a>November 5, 2021</h4>
<p><strong>Bot API 5.4

- Added the the parameter creates_join_request to the methods createChatInviteLink and editChatInviteLink for managing chat invite links that create join requests (read more about this on our blog).
- Added the fields creates_join_request and pending_join_request_count to the class ChatInviteLink.
- Added the field name to the class ChatInviteLink and the parameters name to the methods createChatInviteLink and editChatInviteLink for managing invite link names.
- Added updates about new requests to join the chat, represented by the class ChatJoinRequest and the field chat_join_request in the Update class. The bot must be an administrator in the chat with the can_invite_users administrator right to receive these updates.
- Added the methods approveChatJoinRequest and declineChatJoinRequest for managing requests to join the chat.
- Added support for the choose_sticker action in the method sendChatAction.
### Personalized Commands

- Bots can now show lists of commands tailored to specific situations - including localized commands for users with different languages, as well as different commands based on chat type or for specific chats, and special lists of commands for chat admins.
- Added the class BotCommandScope, describing the scope to which bot commands apply.
- Added the parameters scope and language_code to the method setMyCommands to allow bots specify different commands for different chats and users.
- Added the parameters scope and language_code to the method getMyCommands.
- Added the method deleteMyCommands to allow deletion of the bot's commands for the given scope and user language.
- Improved visibility of bot commands in Telegram apps with the new 'Menu' button in chats with bots, read more on the blog.
### Custom Placeholders

- Added the ability to specify a custom input field placeholder in the classes ReplyKeyboardMarkup and ForceReply.
### And More

- Improved documentation of the class ChatMember by splitting it into 6 subclasses.
- Renamed the method kickChatMember to banChatMember. The old method name can still be used.
- Renamed the method getChatMembersCount to getChatMemberCount. The old method name can still be used.
- Values of the field file_unique_id in objects of the type PhotoSize and of the fields small_file_unique_id and big_file_unique_id in objects of the type ChatPhoto were changed.
- Added the type MessageAutoDeleteTimerChanged and the field message_auto_delete_timer_changed to the class Message.
- Added the parameter revoke_messages to the method kickChatMember, allowing to delete all messages from a group for the user who is being removed.
- Added the new administrator privilege can_manage_chat to the class ChatMember and parameter can_manage_chat to the method promoteChatMember. This administrator right is implied by any other administrator privilege.
- Supported the new bowling animation for the random dice. Choose between different animations (dice, darts, basketball, football, bowling, slot machine) by specifying the emoji parameter in the method sendDice.
- Added the method copyMessage, which sends a copy of any message.
- Maximum poll question length increased to 300.
- Added the ability to manually specify text entities instead of specifying the parse_mode in the classes InputMediaPhoto, InputMediaVideo, InputMediaAnimation, InputMediaAudio, InputMediaDocument, InlineQueryResultPhoto, InlineQueryResultGif, InlineQueryResultMpeg4Gif, InlineQueryResultVideo, InlineQueryResultAudio, InlineQueryResultVoice, InlineQueryResultDocument, InlineQueryResultCachedPhoto, InlineQueryResultCachedGif, InlineQueryResultCachedMpeg4Gif, InlineQueryResultCachedVideo, InlineQueryResultCachedAudio, InlineQueryResultCachedVoice, InlineQueryResultCachedDocument, InputTextMessageContent and the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendVoice, sendPoll, editMessageText, editMessageCaption.
- Added the fields google_place_id and google_place_type to the classes Venue, InlineQueryResultVenue, InputVenueMessageContent and the optional parameters google_place_id and google_place_type to the method sendVenue to support Google Places as a venue API provider.
- Added the field allow_sending_without_reply to the methods sendMessage, sendPhoto, sendVideo, sendAnimation, sendAudio, sendDocument, sendSticker, sendVideoNote, sendVoice, sendLocation, sendVenue, sendContact, sendPoll, sendDice, sendInvoice, sendGame, sendMediaGroup to allow sending messages not a as reply if the replied-to message has already been deleted.
### <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /> WARNING! <img class="emoji" src="//telegram.org/img/emoji/40/E29AA0.png" width="20" height="20" alt="⚠️" /></strong><br>After one of the upcoming Bot API updates, user identifiers will become bigger than <code>2^31 - 1</code> and it will be no longer possible to store them in a signed 32-bit integer type. User identifiers will have up to 52 significant bits, so a 64-bit integer or double-precision float type would still be safe for storing them. Please make sure that your code can correctly handle such user identifiers.</p>
</blockquote>
<hr>
<h4><a class="anchor" name="april-26-2021" href="#april-26-2021"><i class="anchor-icon"></i></a>April 26, 2021</h4>
<p><strong>Bot API 5.2

- Support for Payments 2.0, see this manual for more details about the Bot Payments API.
- Added the type InputInvoiceMessageContent to support sending invoices as inline query results.
- Allowed sending invoices to group, supergroup and channel chats.
- Added the fields max_tip_amount and suggested_tip_amounts to the method sendInvoice to allow adding optional tips to the payment.
- The parameter start_parameter of the method sendInvoice became optional. If the parameter isn't specified, the invoice can be paid directly from forwarded messages.
- Added the field chat_type to the class InlineQuery, containing the type of the chat, from which the inline request was sent.
- Added the type VoiceChatScheduled and the field voice_chat_scheduled to the class Message.
- Fixed an error in sendChatAction documentation to correctly mention “record_voice” and “upload_voice” instead of “record_audio” and “upload_audio” for related to voice note actions. Old action names will still work for backward compatibility.
### Added two new update types

- Added updates about member status changes in chats, represented by the class ChatMemberUpdated and the fields my_chat_member and chat_member in the Update class. The bot must be an administrator in the chat to receive chat_member updates about other chat members. By default, only my_chat_member updates about the bot itself are received.
### Improved Invite Links

- Added the class ChatInviteLink, representing an invite link to a chat.
- Added the method createChatInviteLink, which can be used to create new invite links in addition to the primary invite link.
- Added the method editChatInviteLink, which can be used to edit non-primary invite links created by the bot.
- Added the method revokeChatInviteLink, which can be used to revoke invite links created by the bot.
### Voice Chat Info

- Added the type VoiceChatStarted and the field voice_chat_started to the class Message.
- Added the type VoiceChatEnded and the field voice_chat_ended to the class Message.
- Added the type VoiceChatParticipantsInvited and the field voice_chat_participants_invited to the class Message.
- Added the new administrator privilege can_manage_voice_chats to the class ChatMember and parameter can_manage_voice_chats to the method promoteChatMember. For now, bots can use this privilege only for passing to other administrators.
### Run Your Own Bot API Server

- Bot API source code is now available at telegram-bot-api. You can now run your own Bot API server locally, boosting your bots' performance.
- Added the method logOut, which can be used to log out from the cloud Bot API server before launching your bot locally. You must log out the bot before running it locally, otherwise there is no guarantee that the bot will receive all updates.
- Added the method close, which can be used to close the bot instance before moving it from one local server to another.
### Transfer Bot Ownership

- You can now use @BotFather to transfer your existing bots to another Telegram account.
### Webhooks

- Added the parameter ip_address to the method setWebhook, allowing to bypass DNS resolving and use the specified fixed IP address to send webhook requests.
- Added the field ip_address to the class WebhookInfo, containing the current IP address used for webhook connections creation.
- Added the ability to drop all pending updates when changing webhook URL using the parameter drop_pending_updates in the methods setWebhook and deleteWebhook.
### Working with Groups

- The getChat request now returns the user's bio for private chats if available.
- The getChat request now returns the identifier of the linked chat for supergroups and channels, i.e. the discussion group identifier for a channel and vice versa.
- The getChat request now returns the location to which the supergroup is connected (see Local Groups). Added the class ChatLocation to represent the location.
- Added the parameter only_if_banned to the method unbanChatMember to allow safe unban.
### Working with Files

- Added the field file_name to the classes Audio and Video, containing the name of the original file.
- Added the ability to disable server-side file content type detection using the parameter disable_content_type_detection in the method sendDocument and the class inputMediaDocument.
### Multiple Pinned Messages

- Added the ability to pin messages in private chats.
- Added the parameter message_id to the method unpinChatMessage to allow unpinning of the specific pinned message.
- Added the method unpinAllChatMessages, which can be used to unpin all pinned messages in a chat.
### File Albums

- Added support for sending and receiving audio and document albums in the method sendMediaGroup.
### Live Locations

- Added the field live_period to the class Location, representing a maximum period for which the live location can be updated.
- Added support for live location heading: added the field heading to the classes Location, InlineQueryResultLocation, InputLocationMessageContent and the parameter heading to the methods sendLocation and editMessageLiveLocation.
- Added support for proximity alerts in live locations: added the field proximity_alert_radius to the classes Location, InlineQueryResultLocation, InputLocationMessageContent and the parameter proximity_alert_radius to the methods sendLocation and editMessageLiveLocation.
- Added the type ProximityAlertTriggered and the field proximity_alert_triggered to the class Message.
- Added possibility to specify the horizontal accuracy of a location. Added the field horizontal_accuracy to the classes Location, InlineQueryResultLocation, InputLocationMessageContent and the parameter horizontal_accuracy to the methods sendLocation and editMessageLiveLocation.
### Anonymous Admins

- Added the field sender_chat to the class Message, containing the sender of a message which is a chat (group or channel). For backward compatibility in non-channel chats, the field from in such messages will contain the user 777000 for messages automatically forwarded to the discussion group and the user 1087968824 (@GroupAnonymousBot) for messages from anonymous group administrators.
- Added the field is_anonymous to the class chatMember, which can be used to distinguish anonymous chat administrators.
- Added the parameter is_anonymous to the method promoteChatMember, which allows to promote anonymous chat administrators. The bot itself should have the is_anonymous right to do this. Despite the fact that bots can have the is_anonymous right, they will never appear as anonymous in the chat. Bots can use the right only for passing to other administrators.
- Added the custom title of an anonymous message sender to the class Message as author_signature.
### And Last but not Least

- Supported the new football and slot machine animations for the random dice. Choose between different animations (dice, darts, basketball, football, slot machine) by specifying the emoji parameter in the method sendDice.

## Bot API 4.9 — June 4, 2020

### And Last but not Least

- Added the new field via_bot to the Message object. You can now know which bot was used to send a message.
- Supported video thumbnails for inline GIF and MPEG4 animations.
- Supported the new basketball animation for the random dice. Choose between different animations (dice, darts, basketball) by specifying the emoji parameter in the method sendDice.

## Bot API 4.8 — April 24, 2020

### And Last but not Least

- Supported explanations for Quizzes 2.0. Add explanations by specifying the parameters explanation and explanation_parse_mode in the method sendPoll.
- Added the fields explanation and explanation_entities to the Poll object.
- Supported timed polls that automatically close at a certain date and time. Set up by specifying the parameter open_period or close_date in the method sendPoll.
- Added the fields open_period and close_date to the Poll object.
- Supported the new darts animation for the dice mini-game. Choose between the default dice animation and darts animation by specifying the parameter emoji in the method sendDice.
- Added the field emoji to the Dice object.

## Bot API 4.7 — March 30, 2020

### And Last but not Least

- Added the method sendDice for sending a dice message, which will have a random value from 1 to 6. (Yes, we're aware of the “proper” singular of die. But it's awkward, and we decided to help it change. One dice at a time!)
- Added the field dice to the Message object.
- Added the method getMyCommands for getting the current list of the bot's commands.
- Added the method setMyCommands for changing the list of the bot's commands through the Bot API instead of @BotFather.
- Added the ability to create animated sticker sets by specifying the parameter tgs_sticker instead of png_sticker in the method createNewStickerSet.
- Added the ability to add animated stickers to sets created by the bot by specifying the parameter tgs_sticker instead of png_sticker in the method addStickerToSet.
- Added the field thumb to the StickerSet object.
- Added the ability to change thumbnails of sticker sets created by the bot using the method setStickerSetThumb.

## Bot API 4.6 — January 23, 2020

### And Last but not Least

- Supported Polls 2.0.
- Added the ability to send non-anonymous, multiple answer, and quiz-style polls: added the parameters is_anonymous, type, allows_multiple_answers, correct_option_id, is_closed options to the method sendPoll.
- Added the object KeyboardButtonPollType and the field request_poll to the object KeyboardButton.
- Added updates about changes of user answers in non-anonymous polls, represented by the object PollAnswer and the field poll_answer in the Update object.
- Added the fields total_voter_count, is_anonymous, type, allows_multiple_answers, correct_option_id to the Poll object.
- Bots can now send polls to private chats.
- Added more information about the bot in response to the getMe request: added the fields can_join_groups, can_read_all_group_messages and supports_inline_queries to the User object.
- Added the optional field language to the MessageEntity object.

## Bot API 4.5 — December 31, 2019

### And Last but not Least

- Added support for two new MessageEntity types, underline and strikethrough.
- Added support for nested MessageEntity objects. Entities can now contain other entities. If two entities have common characters then one of them is fully contained inside the other.
- Added support for nested entities and the new tags <u>/<ins> (for underlined text) and <s>/<strike>/<del> (for strikethrough text) in parse mode HTML.
- Added a new parse mode, MarkdownV2, which supports nested entities and two new entities __ (for underlined text) and ~ (for strikethrough text). Parse mode Markdown remains unchanged for backward compatibility.
- Added the field file_unique_id to the objects Animation, Audio, Document, PassportFile, PhotoSize, Sticker, Video, VideoNote, Voice, File and the fields small_file_unique_id and big_file_unique_id to the object ChatPhoto. The new fields contain a unique file identifier, which is supposed to be the same over time and for different bots, but can't be used to download or reuse the file.
- Added the field custom_title to the ChatMember object.
- Added the new method setChatAdministratorCustomTitle to manage the custom titles of administrators promoted by the bot.
- Added the field slow_mode_delay to the Chat object.

## Bot API 4.4 — July 29, 2019

### And Last but not Least

- Added support for animated stickers. New field is_animated in Sticker and StickerSet objects, animated stickers can now be used in sendSticker and InlineQueryResultCachedSticker.
- Added support for default permissions in groups. New object ChatPermissions, containing actions which a member can take in a chat. New field permissions in the Chat object; new method setChatPermissions.
- The field all_members_are_administrators has been removed from the documentation for the Chat object. The field is still returned in the object for backward compatibility, but new bots should use the permissions field instead.
- Added support for more permissions for group and supergroup members: added the new field can_send_polls to ChatMember object, added can_change_info, can_invite_users, can_pin_messages in ChatMember object for restricted users (previously available only for administrators).
- The method restrictChatMember now takes the new user permissions in a single argument of the type ChatPermissions. The old way of passing parameters will keep working for a while for backward compatibility.
- Added description support for basic groups (previously available in supergroups and channel chats). You can pass a group's chat_id to setChatDescription and receive the group's description in the Chat object in the response to getChat method.
- Added invite_link support for basic groups (previously available in supergroups and channel chats). You can pass a group's chat_id to exportChatInviteLink and receive the group's invite link in the Chat object in the response to getChat method.
- File identifiers from the ChatPhoto object are now invalidated and can no longer be used whenever the photo is changed.
- All webhook requests from the Bot API are now coming from the subnets 149.154.160.0/20 and 91.108.4.0/22. Most users won't need to do anything to continue receiving webhooks. If you control inbound access with a firewall, you may need to update your configuration. You can always find the list of actual IP addresses of servers used to send webhooks there: https://core.telegram.org/bots/webhooks.
- As of the next Bot API update (version 4.5), nested MessageEntity objects will be allowed in message texts and captions. Please make sure that your code can correctly handle such entities.

## Bot API 4.3 — May 31, 2019

### And Last but not Least

- Added support for Seamless Telegram Login on external websites.
- Added the new object LoginUrl and the new field login_url to the InlineKeyboardButton object which allows to automatically authorize users before they go to a URL specified by the bot. Users will be asked to confirm authorization in their Telegram app (needs version 5.7 or higher) when they press the button:
### Also in this update:

- Added the field reply_markup to the Message object, containing the inline keyboard attached to the message.
- If a message with an inline keyboard is forwarded, the forwarded message will now have an inline keyboard if the keyboard contained only url and login_url buttons or if the message was sent via a bot and the keyboard contained only url, login_url, switch_inline_query or switch_inline_query_current_chat buttons. In the latter case, switch_inline_query_current_chat buttons are replaced with switch_inline_query buttons.
- Bots now receive the edited_message Update even if only Message.reply_markup has changed.
- Bots that have the can_edit_messages right in a channel can now use the method editMessageReplyMarkup for messages written by other administrators forever without the 48 hours limit.
- Don't forget that starting in July 2019, webhook requests from Bot API will be coming from the subnets 149.154.160.0/20 and 91.108.4.0/22. Most users won't need to do anything to continue receiving webhooks. If you control inbound access with a firewall, you may need to update your configuration. You can always find the list of actual IP addresses of servers used to send webhooks there: https://core.telegram.org/bots/webhooks.

## Bot API 4.2 — April 14, 2019

### Also in this update:

- Added support for native polls: added the object Poll, the methods sendPoll and stopPoll and the field poll in the Message and Update objects.
- The method deleteMessage can now be used to delete messages sent by a user to the bot in private chats within 48 hours.
- Added support for pinned messages in basic groups in addition to supergroups and channel chats: you can pass group's chat_id to pinChatMessage and unpinChatMessage, and receive the pinned group message in Chat object.
- Added the field is_member to the ChatMember object, which can be used to find whether a restricted user is a member of the chat.
- Added the field forward_sender_name to the Message object, containing name of the sender who has opted to hide their account.
- Starting in July 2019, webhook requests from Bot API will be coming from the subnets 149.154.160.0/20 and 91.108.4.0/22. Most users won't need to do anything to continue receiving webhooks. If you control inbound access with a firewall, you may need to update your configuration. You can always find the list of actual IP addresses of servers used to send webhooks there: https://core.telegram.org/bots/webhooks.
- Document thumbnails now should be inscribed in a 320x320 square instead of 90x90.

## Bot API 4.1 — August 27, 2018

### Also in this update:

- Added support for translated versions of documents in Telegram Passport.
- New field translation in EncryptedPassportElement.
- New errors: PassportElementErrorTranslationFile and PassportElementErrorTranslationFiles and PassportElementErrorUnspecified.
### Bot API 4.0</strong>.</p>
<ul>
<li>Added support for <a href="https://telegram.org/blog/passport"><strong>Telegram Passport</strong></a>. See the official announcement on the <a href="https://telegram.org/blog">blog</a> and the <a href="https://core.telegram.org/passport">manual</a> for details.</li>
<li>Added support for <strong>editing the media content of messages</strong>: added the method <a href="/bots/api#editmessagemedia">editMessageMedia</a> and new types <a href="/bots/api#inputmediaanimation">InputMediaAnimation</a>, <a href="/bots/api#inputmediaaudio">InputMediaAudio</a>, and <a href="/bots/api#inputmediadocument">InputMediaDocument</a>.</li>
<li>Added the field <em>thumb</em> to the <a href="/bots/api#audio">Audio</a> object to contain the thumbnail of the album cover to which the music file belongs.</li>
<li>Added support for attaching custom thumbnails to uploaded files. For animations, audios, videos and video notes, which are less than 10 MB in size, thumbnails are generated automatically.</li>
<li><code>tg://</code> URLs now can be used in inline keyboard url buttons and <code>text_link</code> message entities. </li>
<li>Added the method <a href="/bots/api#sendanimation">sendAnimation</a>, which can be used instead of <a href="/bots/api#senddocument">sendDocument</a> to send animations, specifying their duration, width and height.</li>
<li>Added the field <a href="/bots/api#animation">animation</a> to the <a href="/bots/api#message">Message</a> object. For backward compatibility, when this field is set, the <em>document</em> field will be also set.</li>
<li>Added two new <a href="/bots/api#messageentity">MessageEntity</a> types: <em>cashtag</em> and <em>phone_number</em>.</li>
<li>Added support for Foursquare venues: added the new field <em>foursquare_type</em> to the objects <a href="/bots/api#venue">Venue</a>, <a href="/bots/api#inlinequeryresultvenue">InlineQueryResultVenue</a> and <a href="/bots/api#inputvenuemessagecontent">InputVenueMessageContent</a>, and the parameter <em>foursquare_type</em> to the <a href="/bots/api#sendvenue">sendVenue</a> method.</li>
<li>You can now create inline mentions of users, who have pressed your bot's callback buttons.</li>
<li>You can now use the <code>Retry-After</code> response header to configure the delay after which the Bot API will retry the request after an unsuccessful response from a webhook.</li>
<li>If a webhook returns the HTTP error <code>410 Gone</code> for all requests for more than 23 hours successively, it can be automatically removed.</li>
<li>Added <a href="https://en.wikipedia.org/wiki/VCard">vCard</a> support when sharing contacts: added the field <em>vcard</em> to the objects <a href="/bots/api#contact">Contact</a>, <a href="/bots/api#inlinequeryresultcontact">InlineQueryResultContact</a>, <a href="/bots/api#inputcontactmessagecontent">InputContactMessageContent</a> and the method <a href="/bots/api#sendcontact">sendContact</a>.</li>
</ul>
<h4><a class="anchor" name="february-13-2018" href="#february-13-2018"><i class="anchor-icon"></i></a>February 13, 2018</h4>
<p><strong>Bot API 3.6</strong>.</p>
<ul>
<li>Supported <a href="https://core.telegram.org/bots/api#formatting-options">text formatting</a> in media captions. Specify the desired <em>parse_mode</em> (<a href="https://core.telegram.org/bots/api#markdown-style">Markdown</a> or <a href="https://core.telegram.org/bots/api#html-style">HTML</a>) when you provide a caption.</li>
<li>In supergroups, if the bot receives a message that is a reply, it will also receive the message to which that message is replying - even if the original message is inaccessible due to the bot's privacy settings. (In other words, replying to any message in a supergroup with a message that mentions the bot or features a command for it acts as forwarding the original message to the bot). </li>
<li>Added the new field <em>connected_website</em> to <a href="/bots/api#message">Message</a>. The bot will receive a message with this field in a private chat when a user logs in on the bot's connected website using the <a href="https://core.telegram.org/widgets/login">Login Widget</a> and allows sending messages from your bot.</li>
<li>Added the new parameter <em>supports_streaming</em> to the <a href="/bots/api#sendvideo">sendVideo</a> method and a field with the same name to the <a href="/bots/api#inputmediavideo">InputMediaVideo</a> object.</li>
</ul>
<h3><a class="anchor" name="2017" href="#2017"><i class="anchor-icon"></i></a>2017</h3>
<h4><a class="anchor" name="november-17-2017" href="#november-17-2017"><i class="anchor-icon"></i></a>November 17, 2017</h4>
<p><strong>Bot API 3.5</strong>.</p>
<ul>
<li>Added the new method <a href="/bots/api#sendmediagroup">sendMediaGroup</a> and two kinds of <a href="/bots/api#inputmedia">InputMedia</a> objects to support the new <a href="https://telegram.org/blog/albums-saved-messages">albums feature</a>.</li>
<li>Added support for pinning messages in channels. <a href="/bots/api#pinchatmessage">pinChatMessage</a> and <a href="/bots/api#unpinchatmessage">unpinChatMessage</a> accept channels.</li>
<li>Added the new fields <em>provider_data</em>, <em>send_phone_number_to_provider</em>, <em>send_email_to_provider</em> to <a href="/bots/api#sendinvoice">sendInvoice</a> for sharing information about the invoice with the payment provider.</li>
</ul>
<h4><a class="anchor" name="october-11-2017" href="#october-11-2017"><i class="anchor-icon"></i></a>October 11, 2017</h4>
<p><strong>Bot API 3.4</strong>.</p>
<ul>
<li>Bots can now send and receive <a href="https://telegram.org/blog/live-locations">Live Locations</a>. Added new field <em>live_period</em> to the <a href="/bots/api#sendlocation">sendLocation</a> method and the <a href="/bots/api#editmessagelivelocation">editMessageLiveLocation</a> and <a href="/bots/api#stopmessagelivelocation">stopMessageLiveLocation</a> methods as well as the necessary objects for inline bots.</li>
<li>Bots can use the new <a href="/bots/api#setchatstickerset">setChatStickerSet</a> and <a href="/bots/api#deletechatstickerset">deleteChatStickerSet</a> methods to manage <a href="https://telegram.org/blog#stickers-of-the-group">group sticker sets</a>.</li>
<li>The <a href="/bots/api#getchat">getChat</a> request now returns the group's sticker set for supergroups if available.</li>
<li>Bots now receive entities from media captions in the new field <em>caption_entities</em> in <a href="/bots/api#message">Message</a>.</li>
</ul>
<h4><a class="anchor" name="august-23-2017" href="#august-23-2017"><i class="anchor-icon"></i></a>August 23, 2017</h4>
<p><strong>Bot API 3.3</strong>.</p>
<ul>
<li>Bots can now mention users via <a href="/bots/api#formatting-options">inline mentions</a>, without using usernames.</li>
<li><a href="/bots/api#getchat">getChat</a> now also returns pinned messages in supergroups, if present. Added the new field <em>pinned_message</em> to the <a href="/bots/api#chat">Chat</a> object.</li>
<li>Added the new fields <em>author_signature</em> and <em>forward_signature</em> to the <a href="/bots/api#message">Message</a> object.</li>
<li>Added the new field <em>is_bot</em> to the <a href="/bots/api#user">User</a> object.</li>
</ul>
<h4><a class="anchor" name="july-21-2017" href="#july-21-2017"><i class="anchor-icon"></i></a>July 21, 2017</h4>
<p><strong>Bot API 3.2</strong>. Teach your bot to handle <a href="/bots/api#stickers">stickers and sticker sets</a>.</p>
<ul>
<li>Added new methods for working with stickers: <a href="/bots/api#getstickerset">getStickerSet</a>, <a href="/bots/api#uploadstickerfile">uploadStickerFile</a>, <a href="/bots/api#createnewstickerset">createNewStickerSet</a>, <a href="/bots/api#addstickertoset">addStickerToSet</a>, <a href="/bots/api#setstickerpositioninset">setStickerPositionInSet</a>, and <a href="/bots/api#deletestickerfromset">deleteStickerFromSet</a>.</li>
<li>Added the fields <em>set_name</em> and <em>mask_position</em> to the <a href="/bots/api#sticker">Sticker</a> object, plus two new objects, <a href="/bots/api#stickerset">StickerSet</a>, and <a href="/bots/api#maskposition">MaskPosition</a>.</li>
</ul>
<h4><a class="anchor" name="june-30-2017" href="#june-30-2017"><i class="anchor-icon"></i></a>June 30, 2017</h4>
<p><strong>Bot API 3.1</strong>. Build your own robotic police force for supergoups with these new methods for admin bots:</p>
<ul>
<li>Added new methods <a href="/bots/api#restrictchatmember">restrictChatMember</a> and <a href="/bots/api#promotechatmember">promoteChatMember</a> to manage users and admins, added new parameter <em>until_date</em> to <a href="/bots/api#kickchatmember">kickChatMember</a> for temporary bans.</li>
<li>Added new methods <a href="/bots/api#exportchatinvitelink">exportChatInviteLink</a>, <a href="/bots/api#setchatphoto">setChatPhoto</a>, <a href="/bots/api#deletechatphoto">deleteChatPhoto</a>, <a href="/bots/api#setchattitle">setChatTitle</a>, <a href="/bots/api#setchatdescription">setChatDescription</a>, <a href="/bots/api#pinchatmessage">pinChatMessage</a> and <a href="/bots/api#unpinchatmessage">unpinChatMessage</a> to manage groups and channels.</li>
<li>Added the new fields <em>photo</em>, <em>description</em> and <em>invite_link</em> to the <a href="/bots/api#chat">Chat</a> object.</li>
<li>Added the new fields <em>until_date</em>, <em>can_be_edited</em>, <em>can_change_info</em>, <em>can_post_messages</em>, <em>can_edit_messages</em>, <em>can_delete_messages</em>, <em>can_invite_users</em>, <em>can_restrict_members</em>, <em>can_pin_messages</em>, <em>can_promote_members</em>, <em>can_send_messages</em>, <em>can_send_media_messages</em>, <em>can_send_other_messages</em> and <em>can_add_web_page_previews</em> to the <a href="/bots/api#chatmember">ChatMember</a> object.</li>
</ul>
<h4><a class="anchor" name="may-18-2017" href="#may-18-2017"><i class="anchor-icon"></i></a>May 18, 2017</h4>
<p>Introducing <strong>Bot API 3.0</strong>.</p>
<p><strong>NEW Payment Platform

- Your bot can now accept payments for goods and services via Telegram.
- Added new kinds of updates, shipping_query and pre_checkout_query, and new types of message content, invoice and successful_payment.
- Added new methods for payments: sendInvoice, answerShippingQuery, and answerPreCheckoutQuery.
- Added a new type of button, the pay button to InlineKeyboardButton.
### NEW Video Messages

- As of Telegram v.4.0, users can send short rounded video messages, using an interface similar to that of voice notes.
- Added the sendVideoNote method, the new field video_note to Message, the fields record_video_note or upload_video_note to sendChatAction.
### NEW Multilingual Bots

- The User object now may have a language_code field that contains the IETF language tag of the user's language.
- Thanks to this, your bot can now offer localized responses to users that speak different languages.
### More power to admin bots

- unbanChatMemeber now also works in channels!
- New method deleteMessage that allows the bot to delete its own messages, as well as messages posted by other in groups and channels where the bot is an administrator.
### Minor Changes

- Replaced the field new_chat_member in Message with new_chat_members (the old field will still be available for a while for compatibility purposes).
- Inline keyboards with switch_inline_query and switch_inline_query_current_chat can no longer be sent to channels because they are useless there.
- New fields gif_duration in InlineQueryResultGif and mpeg4_duration in InlineQueryResultMpeg4Gif.
- Use the new field max_connections in setWebhook to optimize your bot's server load
- Use allowed_updates in setWebhook and getUpdates to selectively subscribe to updates of a certain type. Among other things, this allows you to stop getting updates about new posts in channels where your bot is an admin.
- deleteWebhook moved out of setWebhook to get a whole separate method for itself.

## Bot API 2.3 — November 21, 2016

### Minor Changes

- Modified bot privacy mode for the sake of consistency.
- Your bot can now get updates about posts in channels. Added new fields channel_post and edited_channel_post to Update.
- You can now update high scores to a lower value by using the new force parameter in setGameScore. Handy for punishing cheaters or fixing errors in your game's High Score table.
- Starting today, messages with high scores will be updated with new high scores by default. Use disable_edit_message in setGameScore if you don't want this.
- The edit_message parameter from setGameScore is no longer in use. For backward compatibility, it will be taken into account for a while, unless disable_edit_message is passed explicitly.
- Added the new field forward_from_message_id to Message.
- Added the new parameter cache_time to answerCallbackQuery. Will eventually work in Telegram apps - somewhere after version 3.14, maybe 3.15.
- Renamed hide_keyboard to remove_keyboard in ReplyKeyboardRemove for clarity. hide_keyboard will still work for a while for backward compatibility.
### Bot API 2.2.</strong> <a href="/bots/games">Introducing a new Gaming Platform!</a> See <a href="/bots/games">this introduction</a> for a brief overview.<br>If you're not a developer, you may like <a href="https://telegram.org/blog/games"><strong>this user-friendly blog post</strong></a> better.</p>
<ul>
<li>New tools for building <a href="/bots/api#games"><strong>HTML5 games</strong></a>.</li>
<li>New method <a href="/bots/api#sendgame">sendGame</a>, new object <a href="/bots/api#inlinequeryresultgame">InlineQueryResultGame</a>, new field <em>game</em> in <a href="/bots/api#message">Message</a>.</li>
<li>New parameter <em>url</em> in <a href="/bots/api#answercallbackquery">answerCallbackQuery</a>. Create a game and accept the conditions using Botfather to send custom urls that open your games for the user.</li>
<li>New field <em>callback_game</em> in <a href="/bots/api#inlinekeyboardbutton">InlineKeyboardButton</a>, new fields <em>game_short_name</em> and <em>chat_instance</em> in <a href="/bots/api#callbackquery">CallbackQuery</a>, new object <a href="/bots/api#callbackgame">CallbackGame</a>. </li>
<li>New methods <a href="/bots/api#setgamescore">setGameScore</a> and <a href="/bots/api#getgamehighscores">getGameHighScores</a>.</li>
</ul>
<p><strong>Other changes

- Making life easier for webhook users. Added a detailed Guide to All Things Webhook that describes every pothole you can run into on the webhook road.
- New method getWebhookInfo to check current webhook status.
- Added the option to specify an HTTP URL for a file in all methods where InputFile or file_id can be used (except voice messages). Telegram will get the file from the specified URL and send it to the user. Files must be smaller than 5 MB for photos and smaller than 20 MB for all other types of content.
- Use the new url parameter in answerCallbackQuery to create buttons that open your bot with user-specific parameters.
- Added new field switch_inline_query_current_chat in InlineKeyboardButton.
- Added caption fields to sendAudio, sendVoice, InlineQueryResultAudio, InlineQueryResultVoice, InlineQueryResultCachedAudio, and InlineQueryResultCachedVoice.
- New field all_members_are_administrators in the Chat object.
- Certain server responses may now contain the new parameters field with expanded info on errors that occurred while processing your requests.
- Inline keyboards may now be used in group chats. Channels coming soon.
- Check out @vote and @like for examples.
- Bot API 2.1. Added more tools for group administrator bots. Your bot can now get a list of administrators and members count in a group, check a user's current status (administrator, creator, left the group, kicked from the group), and leave a group.
- Added new methods: getChat, leaveChat, getChatAdministrators, getChatMember, getChatMembersCount.
- Added support for edited messages and new mentions from Telegram v.3.9. New fields: edited_message in Update, edit_date in Message, user in MessageEntity. New value text_mention for the type field in MessageEntity.
- Added consistency to what messages bots get in groups and supergroups. See updated FAQ for details »
- Added the field emoji to the Sticker object. Your bot can now know the emoji a sticker corresponds to.
- Added the field forward_from_chat to the Message object for messages forwarded from channels.
- New inline keyboards with callback and URL buttons. Added new objects InlineKeyboardMarkup, InlineKeyboardButton and CallbackQuery, added reply_markup fields to all InlineQueryResult objects. Added field callback_query to the Update object, new method answerCallbackQuery.
- Bots can now edit their messages. Added methods editMessageText, editMessageCaption, editMessageReplyMarkup.
- Bots can request location and phone number from the user. The keyboard field in the object ReplyKeyboardMarkup now supports KeyboardButton, a new object that can have the fields request_location and request_contact.
### Inline bots

- Added support for all content types available on Telegram. 19 types of InlineQueryResult objects are now supported.
- Inline bots can now substitute all kinds of content with text. Added 4 types of InputMessageContent objects.
- Your inline bot can also ask users for permission to use their location. Added the new Botfather command /setinlinegeo, added field location to the InlineQuery object, added fields location and inline_message_id to the ChosenInlineResult object.
- Added an easy way to switch between inline mode and a private chat with the bot - useful for settings, establishing external connections and teaching users how to use your bot in inline mode. Added parameters switch_pm_text and switch_pm_parameter to the method answerInlineQuery.
### Miscellaneous

- Added group administration tools. New methods kickChatMember and unbanChatMember.
- Added fields venue, pinned_message and entities to the Message object. Added new objects MessageEntity and Venue, new methods sendVenue and sendContact.
- Renamed the fields new_chat_participant and left_chat_participant of the Message object to new_chat_member and left_chat_member.
- Added the disable_notification parameter to all methods that send messages or any kind.
- Removed backward compatibility from the method sendAudio. Voice messages now must be sent using the method sendVoice. There is no more need to specify a non-empty title or performer while sending the audio by file_id.
- By the way, you can use both HTML-style and markdown-style formatting in your bot's messages to send bold, italic or fixed-width text and inline links. All official Telegram clients support this. See Formatting options for details.
- You can now collect feedback on which results provided by your inline bot get chosen by the users. Added the setinlinefeedback command for Botfather, new type ChosenInlineResult, new field chosen_inline_result to the Update object.
- Added support for Inline Mode, a new way for people to contact your bot by typing its username and a query in the text input field in any chat. Enable by sending /setinline to @BotFather.
- New optional field inline_query added to the Update object.
- Added new method answerInlineQuery and new objects InlineQuery, InlineQueryResultArticle, InlineQueryResultPhoto, InlineQueryResultGif, InlineQueryResultMpeg4Gif and InlineQueryResultVideo.
- Added support for supergroups. The Type field in the Chat object can now contain 'supergroup'.
- New optional fields added to the Message object: supergroup_chat_created, migrate_to_chat_id, migrate_from_chat_id and channel_chat_created.
- Added initial channel support for bots (no Telegram clients support this at the moment, please wait for updates):
- The Chat field in the Message is now of the new type Chat.
- You can now pass a channel username (in the format @channelusername) in the place of chat_id in all methods (and instead of from_chat_id in forwardMessage). For this to work, the bot must be an administrator in the channel (and that's exactly what Telegram clients don't support yet - adding bots as administrators coming soon).
- Bots can now download files and media sent by users.
- Added getFile and File.
- You can now pass parameters using application/json (please note that this doesn't work for file uploads: use multipart/form-data to upload files).
- Added very basic markdown support. New field parse_mode added to sendMessage. For the moment messages with markdown will be displayed correctly only in Telegram for Android. Other official apps will catch up soon.
- Added support for self-signed certificates: upload your certificate using the certificate parameter in the setWebhook method.
- You can now make new requests when responding to webhook updates.
- Added new type Voice and new method sendVoice for sending voice messages.
- Earlier Audio and sendAudio should now be used for sending music files. Telegram clients will show such files in the in-app music player. If you were using sendAudio for your bot to send voice messages, please use sendVoice instead.
- Added optional fields performer, title to the Audio object and sendAudio method.
- Added optional field voice to the Message object.
- The thumb field is now optional for Video, Sticker and Document objects
- The API now supports both video and photo captions. The caption field has been removed from the Video object and added to the Message object instead.
- caption and duration optional fields have been added to the sendVideo method.
- Fixed typo: user_id in the Contact object is now correctly labeled as Integer, not String
### <a href="/bots/api">Back to the Bot API Manual »</a>

- FAQ
- Privacy
- Press
- iPhone/iPad
- Android
- Mobile Web
- PC/Mac/Linux
- macOS
- Web-browser
- API
- Translations
- Instant View
