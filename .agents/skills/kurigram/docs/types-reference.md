# Kurigram — Referensi Tipe Data (Types)

> Dokumentasi ini di-generate dari source code Kurigram (branch `dev`).
> Repository: https://github.com/kurigram-org/kurigram

Semua tipe tersedia melalui `from pyrogram import types` atau `from pyrogram.types import ...`.

---

## Authorization (Otorisasi)

| Tipe | Deskripsi |
|------|-----------|
| `ActiveSession` | Informasi sesi aktif |
| `ActiveSessions` | Daftar sesi aktif |
| `PhoneNumberAuthenticationSettings` | Pengaturan autentikasi nomor telepon |
| `SentCode` | Kode verifikasi yang dikirim |
| `TermsOfService` | Ketentuan layanan Telegram |

---

## Bots & Keyboards (Bot & Keyboard)

| Tipe | Deskripsi |
|------|-----------|
| `BotAccessSettings` | ⚡ Pengaturan akses managed bot |
| `BotCommand` | Perintah bot |
| `BotCommandScope` | Lingkup perintah bot (base) |
| `BotCommandScopeAllChatAdministrators` | Lingkup: semua admin chat |
| `BotCommandScopeAllGroupChats` | Lingkup: semua grup |
| `BotCommandScopeAllPrivateChats` | Lingkup: semua chat privat |
| `BotCommandScopeChat` | Lingkup: chat tertentu |
| `BotCommandScopeChatAdministrators` | Lingkup: admin chat tertentu |
| `BotCommandScopeChatMember` | Lingkup: anggota chat tertentu |
| `BotCommandScopeDefault` | Lingkup: default |
| `CallbackGame` | Game callback |
| `CallbackQuery` | Callback query dari inline keyboard |
| `ChatBoostUpdated` | ⚡ Update boost chat |
| `ForceReply` | Paksa balasan dari user |
| `GameHighScore` | Skor tinggi game |
| `InlineKeyboardButton` | Tombol inline keyboard |
| `InlineKeyboardMarkup` | Markup inline keyboard |
| `KeyboardButton` | Tombol reply keyboard |
| `KeyboardButtonRequestChat` | Tombol request chat |
| `KeyboardButtonRequestManagedBot` | ⚡ Tombol request managed bot |
| `KeyboardButtonPollType` | Tombol tipe polling |
| `KeyboardButtonRequestUsers` | Tombol request users |
| `LabeledPrice` | Harga berlabel (untuk invoice) |
| `LoginUrl` | URL login |
| `ManagedBotUpdated` | ⚡ Update managed bot |
| `MenuButton` | Tombol menu bot (base) |
| `MenuButtonCommands` | Tombol menu: commands |
| `MenuButtonDefault` | Tombol menu: default |
| `MenuButtonWebApp` | Tombol menu: web app |
| `MessageReactionCountUpdated` | ⚡ Update jumlah reaksi pesan |
| `MessageReactionUpdated` | ⚡ Update reaksi pesan |
| `OrderInfo` | Informasi pemesanan |
| `PreCheckoutQuery` | Pre-checkout query |
| `PurchasedPaidMedia` | ⚡ Media berbayar yang dibeli |
| `ReplyKeyboardMarkup` | Markup reply keyboard |
| `ReplyKeyboardRemove` | Hapus reply keyboard |
| `SentGuestMessage` | ⚡ Pesan guest yang dikirim |
| `ChatShared` | Chat yang dibagikan |
| `UsersShared` | Users yang dibagikan |
| `SentWebAppMessage` | Pesan web app yang dikirim |
| `ShippingOption` | Opsi pengiriman |
| `ShippingQuery` | Shipping query |
| `ShippingAddress` | Alamat pengiriman |
| `WebAppInfo` | Informasi web app |

---

## Inline Mode

| Tipe | Deskripsi |
|------|-----------|
| `ChosenInlineResult` | Hasil inline yang dipilih |
| `InlineQuery` | Inline query masuk |
| `InlineQueryResult` | Hasil inline query (base) |
| `InlineQueryResultAnimation` | Hasil: animasi |
| `InlineQueryResultArticle` | Hasil: artikel |
| `InlineQueryResultAudio` | Hasil: audio |
| `InlineQueryResultCachedAnimation` | Hasil: animasi (cached) |
| `InlineQueryResultCachedAudio` | Hasil: audio (cached) |
| `InlineQueryResultCachedDocument` | Hasil: dokumen (cached) |
| `InlineQueryResultCachedPhoto` | Hasil: foto (cached) |
| `InlineQueryResultCachedSticker` | Hasil: stiker (cached) |
| `InlineQueryResultCachedVideo` | Hasil: video (cached) |
| `InlineQueryResultCachedVoice` | Hasil: voice (cached) |
| `InlineQueryResultContact` | Hasil: kontak |
| `InlineQueryResultDocument` | Hasil: dokumen |
| `InlineQueryResultLocation` | Hasil: lokasi |
| `InlineQueryResultPhoto` | Hasil: foto |
| `InlineQueryResultVenue` | Hasil: venue |
| `InlineQueryResultVideo` | Hasil: video |
| `InlineQueryResultVoice` | Hasil: voice |

---

## Input Content

| Tipe | Deskripsi |
|------|-----------|
| `InputChecklist` | ⚡ Input checklist |
| `InputContactMessageContent` | Konten pesan kontak |
| `InputCredentials` | Kredensial pembayaran (base) |
| `InputCredentialsApplePay` | Kredensial Apple Pay |
| `InputCredentialsGooglePay` | Kredensial Google Pay |
| `InputCredentialsNew` | Kredensial baru |
| `InputCredentialsSaved` | Kredensial tersimpan |
| `InputInvoice` | Invoice input (base) |
| `InputInvoiceMessage` | Invoice dari pesan |
| `InputInvoiceMessageContent` | Konten pesan invoice |
| `InputInvoiceName` | Invoice dari nama |
| `InputLocationMessageContent` | Konten pesan lokasi |
| `InputMedia` | Media input (base) |
| `InputMediaAnimation` | Input: animasi |
| `InputMediaAudio` | Input: audio |
| `InputMediaDocument` | Input: dokumen |
| `InputMediaLink` | ⚡ Input: link |
| `InputMediaLivePhoto` | ⚡ Input: live photo |
| `InputMediaLocation` | ⚡ Input: lokasi |
| `InputMediaPhoto` | Input: foto |
| `InputMediaSticker` | ⚡ Input: stiker |
| `InputMediaVenue` | ⚡ Input: venue |
| `InputMediaVideo` | Input: video |
| `InputMessageContent` | Konten pesan input (base) |
| `InputPhoneContact` | Kontak telepon input |
| `InputPollMedia` | ⚡ Media polling input |
| `InputPollOption` | ⚡ Opsi polling input |
| `InputPollOptionMedia` | ⚡ Media opsi polling |
| `InputPrivacyRule` | Aturan privasi (base) |
| `InputPrivacyRuleAllowAll` | ⚡ Izinkan semua |
| `InputPrivacyRuleAllowBots` | ⚡ Izinkan bot |
| `InputPrivacyRuleAllowChats` | ⚡ Izinkan chat tertentu |
| `InputPrivacyRuleAllowCloseFriends` | ⚡ Izinkan teman dekat |
| `InputPrivacyRuleAllowContacts` | ⚡ Izinkan kontak |
| `InputPrivacyRuleAllowPremium` | ⚡ Izinkan premium |
| `InputPrivacyRuleAllowUsers` | ⚡ Izinkan users tertentu |
| `InputPrivacyRuleDisallowAll` | ⚡ Larang semua |
| `InputPrivacyRuleDisallowBots` | ⚡ Larang bot |
| `InputPrivacyRuleDisallowChats` | ⚡ Larang chat tertentu |
| `InputPrivacyRuleDisallowContacts` | ⚡ Larang kontak |
| `InputPrivacyRuleDisallowUsers` | ⚡ Larang users tertentu |
| `InputRichMessage` | ⚡ Input rich message |
| `InputRichMessageContent` | ⚡ Konten rich message |
| `InputTextMessageContent` | Konten pesan teks |
| `InputVenueMessageContent` | Konten pesan venue |

---

## Messages & Media (Pesan & Media)

### Media Types

| Tipe | Deskripsi |
|------|-----------|
| `Animation` | Animasi/GIF |
| `Audio` | File audio |
| `Contact` | Kontak |
| `Dice` | Emoji dadu |
| `Document` | Dokumen umum |
| `Game` | Game Telegram |
| `LivePhoto` | ⚡ Live photo |
| `Location` | Lokasi |
| `MaskPosition` | Posisi mask stiker |
| `Photo` | Foto |
| `Poll` | Polling |
| `PollOption` | Opsi polling |
| `Sticker` | Stiker |
| `StrippedThumbnail` | Thumbnail stripped |
| `Thumbnail` | Thumbnail |
| `Venue` | Venue/tempat |
| `Video` | Video |
| `VideoNote` | Video note (bulat) |
| `Voice` | Pesan suara |
| `WebPage` | Halaman web |

### Message Types

| Tipe | Deskripsi |
|------|-----------|
| `Message` | Pesan Telegram (utama) |
| `MessageContent` | ⚡ Konten pesan |
| `MessageEntity` | Entitas dalam pesan (bold, link, dll) |
| `MessageOrigin` | ⚡ Asal pesan (base) |
| `MessageOriginChannel` | ⚡ Asal: channel |
| `MessageOriginChat` | ⚡ Asal: chat |
| `MessageOriginHiddenUser` | ⚡ Asal: user tersembunyi |
| `MessageOriginImport` | ⚡ Asal: impor |
| `MessageOriginUser` | ⚡ Asal: user |
| `MessageReactions` | ⚡ Reaksi pesan |
| `ExternalReplyInfo` | ⚡ Info balasan eksternal |
| `TextQuote` | ⚡ Kutipan teks |
| `ReplyParameters` | ⚡ Parameter balasan |
| `LinkPreviewOptions` | ⚡ Opsi preview link |
| `RestrictionReason` | ⚡ Alasan pembatasan |
| `BusinessMessage` | ⚡ Pesan bisnis |

### ⚡ Rich Messages & Checklists (Kurigram)

| Tipe | Deskripsi |
|------|-----------|
| `RichMessage` | ⚡ Rich message |
| `Checklist` | ⚡ Checklist |
| `ChecklistTask` | ⚡ Tugas checklist |
| `ChecklistTasksAdded` | ⚡ Tugas yang ditambahkan |
| `ChecklistTasksDone` | ⚡ Tugas yang selesai |
| `InputChecklistTask` | ⚡ Input tugas checklist |
| `FormattedText` | ⚡ Teks terformat |
| `FactCheck` | ⚡ Fact check |

### ⚡ Suggested Posts (Kurigram)

| Tipe | Deskripsi |
|------|-----------|
| `SuggestedPostApprovalFailed` | ⚡ Gagal approve post |
| `SuggestedPostApproved` | ⚡ Post disetujui |
| `SuggestedPostDeclined` | ⚡ Post ditolak |
| `SuggestedPostInfo` | ⚡ Info post yang disarankan |
| `SuggestedPostPaid` | ⚡ Post berbayar |
| `SuggestedPostParameters` | ⚡ Parameter post |
| `SuggestedPostPrice` | ⚡ Harga post (base) |
| `SuggestedPostPriceStar` | ⚡ Harga post (Stars) |
| `SuggestedPostPriceTon` | ⚡ Harga post (TON) |
| `SuggestedPostRefunded` | ⚡ Post dikembalikan |

### ⚡ Gifts (Hadiah)

| Tipe | Deskripsi |
|------|-----------|
| `Gift` | ⚡ Star gift |
| `GiftAttribute` | ⚡ Atribut gift |
| `GiftAuction` | ⚡ Lelang gift |
| `GiftAuctionState` | ⚡ Status lelang gift |
| `GiftCollection` | ⚡ Koleksi gift |
| `GiftPurchaseLimit` | ⚡ Batas pembelian gift |
| `GiftResaleParameters` | ⚡ Parameter jual kembali |
| `GiftResalePrice` | ⚡ Harga jual kembali (base) |
| `GiftResalePriceStar` | ⚡ Harga jual kembali (Stars) |
| `GiftResalePriceTon` | ⚡ Harga jual kembali (TON) |
| `GiftUpgradePreview` | ⚡ Preview upgrade gift |
| `GiftUpgradePrice` | ⚡ Harga upgrade gift |
| `GiftUpgradeVariants` | ⚡ Varian upgrade gift |
| `GiftedPremium` | ⚡ Premium yang dihadiahkan |
| `GiftedStars` | ⚡ Stars yang dihadiahkan |
| `GiftedTon` | ⚡ TON yang dihadiahkan |
| `CraftGiftResult` | ⚡ Hasil crafting gift (base) |
| `CraftGiftResultFail` | ⚡ Crafting gagal |
| `CraftGiftResultSuccess` | ⚡ Crafting berhasil |
| `UpgradedGiftAttributeId` | ⚡ ID atribut gift upgrade (base) |
| `UpgradedGiftAttributeIdBackdrop` | ⚡ Atribut: backdrop |
| `UpgradedGiftAttributeIdModel` | ⚡ Atribut: model |
| `UpgradedGiftAttributeIdSymbol` | ⚡ Atribut: simbol |
| `UpgradedGiftOriginalDetails` | ⚡ Detail asli gift upgrade |
| `UpgradedGiftValueInfo` | ⚡ Info nilai gift upgrade |
| `AuctionBid` | ⚡ Tawaran lelang |
| `AuctionRound` | ⚡ Putaran lelang |
| `AuctionState` | ⚡ Status lelang (base) |
| `AuctionStateActive` | ⚡ Lelang aktif |
| `AuctionStateFinished` | ⚡ Lelang selesai |

### ⚡ Giveaway

| Tipe | Deskripsi |
|------|-----------|
| `Giveaway` | ⚡ Giveaway |
| `GiveawayCompleted` | ⚡ Giveaway selesai |
| `GiveawayCreated` | ⚡ Giveaway dibuat |
| `GiveawayPrizeStars` | ⚡ Hadiah giveaway Stars |
| `GiveawayWinners` | ⚡ Pemenang giveaway |
| `PremiumGiftCode` | ⚡ Kode hadiah premium |
| `CheckedGiftCode` | ⚡ Kode hadiah yang diperiksa |

### ⚡ Payments & Stars

| Tipe | Deskripsi |
|------|-----------|
| `Invoice` | Invoice |
| `PaymentForm` | ⚡ Form pembayaran |
| `PaymentOption` | ⚡ Opsi pembayaran |
| `PaymentResult` | ⚡ Hasil pembayaran |
| `SuccessfulPayment` | Pembayaran berhasil |
| `RefundedPayment` | ⚡ Pembayaran dikembalikan |
| `SavedCredentials` | ⚡ Kredensial tersimpan |
| `StarAmount` | ⚡ Jumlah Stars |
| `PaidMediaInfo` | ⚡ Info media berbayar |
| `PaidMediaPreview` | ⚡ Preview media berbayar |
| `PaidReactor` | ⚡ Reaktor berbayar |
| `PaidMessagesPriceChanged` | ⚡ Perubahan harga pesan berbayar |
| `PaidMessagesRefunded` | ⚡ Pesan berbayar dikembalikan |

### Stories

| Tipe | Deskripsi |
|------|-----------|
| `Story` | ⚡ Story/Cerita |
| `StoryView` | ⚡ Viewer story |
| `MediaArea` | ⚡ Area media dalam story |

### Forum & Direct Messages

| Tipe | Deskripsi |
|------|-----------|
| `ForumTopic` | Topik forum |
| `ForumTopicCreated` | Topik dibuat |
| `ForumTopicEdited` | Topik diedit |
| `ForumTopicClosed` | Topik ditutup |
| `ForumTopicReopened` | Topik dibuka kembali |
| `GeneralForumTopicHidden` | Topik umum disembunyikan |
| `GeneralForumTopicUnhidden` | Topik umum ditampilkan |
| `DirectMessagesTopic` | ⚡ Topik direct messages |
| `DirectMessagePriceChanged` | ⚡ Perubahan harga DM |

### Service Messages

| Tipe | Deskripsi |
|------|-----------|
| `ChatBackground` | ⚡ Background chat |
| `ChatHasProtectedContentDisableRequested` | ⚡ Permintaan disable konten dilindungi |
| `ChatHasProtectedContentToggled` | ⚡ Toggle konten dilindungi |
| `ChatOwnerChanged` | ⚡ Pemilik chat berubah |
| `ChatOwnerLeft` | ⚡ Pemilik chat pergi |
| `ChatTheme` | ⚡ Tema chat |
| `ContactRegistered` | ⚡ Kontak terdaftar |
| `ManagedBotCreated` | ⚡ Managed bot dibuat |
| `ProximityAlertTriggered` | Alert kedekatan dipicu |
| `ScreenshotTaken` | ⚡ Screenshot diambil |
| `WebAppData` | Data web app |
| `WriteAccessAllowed` | ⚡ Akses tulis diizinkan |
| `PollOptionAdded` | ⚡ Opsi polling ditambahkan |
| `PollOptionDeleted` | ⚡ Opsi polling dihapus |

### Boost

| Tipe | Deskripsi |
|------|-----------|
| `BoostsStatus` | ⚡ Status boost |
| `ChatBoost` | ⚡ Boost chat |
| `MyBoost` | ⚡ Boost saya |

### Reactions

| Tipe | Deskripsi |
|------|-----------|
| `Reaction` | ⚡ Reaksi |
| `AvailableEffect` | ⚡ Efek yang tersedia |

---

## User & Chats (Pengguna & Chat)

### Core Types

| Tipe | Deskripsi |
|------|-----------|
| `User` | Pengguna Telegram |
| `Chat` | Chat Telegram (private/group/supergroup/channel) |
| `ChatMember` | Anggota chat |
| `ChatMemberUpdated` | ⚡ Update anggota chat |
| `ChatPhoto` | Foto chat |
| `ChatColor` | ⚡ Warna chat |
| `ChatPermissions` | Izin chat |
| `ChatAdministratorRights` / `ChatPrivileges` | Hak administrator |
| `ChatReactions` | ⚡ Reaksi yang tersedia di chat |
| `ChatSettings` | ⚡ Pengaturan chat |
| `Dialog` | Dialog/percakapan |
| `Username` | ⚡ Username (mendukung banyak) |

### Invite & Join

| Tipe | Deskripsi |
|------|-----------|
| `ChatInviteLink` | Link undangan chat |
| `ChatJoinRequest` | ⚡ Permintaan bergabung |
| `ChatJoinResult` | ⚡ Hasil bergabung (base) |
| `ChatJoinResultSuccess` | ⚡ Berhasil bergabung |
| `ChatJoinResultRequestSent` | ⚡ Permintaan terkirim |
| `ChatJoinResultGuardBotApprovalRequired` | ⚡ Perlu persetujuan guard bot |
| `ChatJoinResultDeclined` | ⚡ Ditolak bergabung |
| `ChatJoiner` | Pengguna yang bergabung via link |
| `ChatAdminWithInviteLinks` | Admin dengan link undangan |
| `InviteLinkImporter` | Pengimpor link undangan |
| `FailedToAddMember` | ⚡ Gagal menambah anggota |

### Chat Event Log

| Tipe | Deskripsi |
|------|-----------|
| `ChatEvent` | Event/perubahan di chat |
| `ChatEventFilter` | Filter event chat |

### Folder

| Tipe | Deskripsi |
|------|-----------|
| `Folder` | ⚡ Folder chat |
| `FolderInviteLink` | ⚡ Link undangan folder |
| `ChatFolderInviteLinkInfo` | ⚡ Info link undangan folder |

### Business

| Tipe | Deskripsi |
|------|-----------|
| `BusinessConnection` | ⚡ Koneksi bisnis |
| `BusinessBotRights` | ⚡ Hak bot bisnis |
| `BusinessIntro` | ⚡ Intro bisnis |
| `BusinessRecipients` | ⚡ Penerima bisnis |
| `BusinessWeeklyOpen` | ⚡ Jam buka mingguan |
| `BusinessWorkingHours` | ⚡ Jam kerja bisnis |

### Privacy & Settings

| Tipe | Deskripsi |
|------|-----------|
| `AcceptedGiftTypes` | ⚡ Tipe hadiah yang diterima |
| `GlobalPrivacySettings` | ⚡ Pengaturan privasi global |
| `PrivacyRule` | ⚡ Aturan privasi |
| `EmojiStatus` | ⚡ Status emoji |
| `Restriction` | ⚡ Pembatasan |
| `BotVerification` | ⚡ Verifikasi bot |
| `VerificationStatus` | ⚡ Status verifikasi |

### Profile & Info

| Tipe | Deskripsi |
|------|-----------|
| `Birthday` | ⚡ Tanggal lahir |
| `StoriesStealthMode` | ⚡ Mode stealth stories |
| `UserRating` | ⚡ Rating pengguna |
| `HistoryCleared` | ⚡ Riwayat dibersihkan |
| `FoundContacts` | ⚡ Kontak yang ditemukan |

### Calls

| Tipe | Deskripsi |
|------|-----------|
| `GroupCallMember` | ⚡ Peserta panggilan grup |
| `PhoneCallEnded` | ⚡ Panggilan berakhir |
| `PhoneCallStarted` | ⚡ Panggilan dimulai |
| `VideoChatStarted` | Video chat dimulai |
| `VideoChatEnded` | Video chat berakhir |
| `VideoChatScheduled` | Video chat dijadwalkan |
| `VideoChatMembersInvited` | Anggota diundang ke video chat |

---

## Update Types

| Tipe | Deskripsi |
|------|-----------|
| `Update` | Base update type |

---

## Rich Messages & Bot API 10.2 / 10.3 Types (v2.2.26)

| Tipe | Deskripsi |
|------|-----------|
| `InputRichMessage` | ⚡ Container utama pesan kaya (html, markdown, blocks, media) |
| `InputRichMessageMedia` | ⚡ Binding media untuk pesan kaya |
| `InputRichMessageContent` | ⚡ Konten pesan kaya untuk hasil inline |
| `RichMessage` | ⚡ Objek representasi pesan kaya yang diterima |
| `RichMessageButton` | ⚡ Tombol interaktif di badan pesan kaya (10.3) |
| `RichTextButton` | ⚡ Teks tombol kaya (10.3) |
| `EphemeralMessageParameters` | ⚡ Parameter pesan ephemeral grup (10.3) |
| `InputRichBlock*` | ⚡ Blok input kaya: `Paragraph`, `SectionHeading`, `Table` (dengan `is_compact`), `Buttons`, `Document`, `ExpandableBlockQuotation`, `Collage`, `Slideshow`, `Details`, `Thinking`, `Preformatted`, dll. |
| `RichBlock*` | ⚡ Blok pesan kaya yang diterima: `Paragraph`, `Table`, `Buttons`, `Document`, `ExpandableBlockQuotation`, `Collage`, `Slideshow`, dll. |
| `RichText*` | ⚡ Objek pemformatan teks: `Bold`, `Italic`, `Underline`, `Spoiler`, `CustomEmoji`, `DateTime`, `Url`, `Mention`, `Button`, dll. |

---

> **Catatan:** Tipe yang ditandai dengan ⚡ adalah fitur unik Kurigram yang tidak tersedia di Pyrogram standar.

