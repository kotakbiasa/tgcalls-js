---
name: media-and-files
description: Complete reference documentation and practical guide.
---

# Media and Files

This reference guide details sending, receiving, and managing media (photos, documents, audio, video, live photos, and media groups) using the Telegram Bot API.

---

## 1. Transmission Mechanism: InputFile

When sending files in Telegram, you can specify files in three different ways:
1.  **file_id**: If the file is already stored on Telegram servers, pass the `file_id` as a String. (Recommended for performance).
2.  **HTTP URL**: Pass an HTTP URL as a String for Telegram to download the file from the internet.
3.  **Multipart Upload**: Upload the file locally from your system by sending a `multipart/form-data` request.

---

## 2. Media Dispatch APIs

### A. sendPhoto
Sends a photo.
*   `photo` (InputFile/String): Photo to send. Either `file_id`, URL, or multipart upload.
*   `caption` (String): Photo caption (0-1024 characters).

### B. sendDocument
Sends general files.
*   `document` (InputFile/String): File to send.
*   `thumbnail` (InputFile/String): Thumbnail of the file sent; can be ignored if automatic generation is supported.
*   `disable_content_type_detection` (Boolean): Disables automatic server-side content type detection.

### C. sendAudio
Sends `.mp3` or `.m4a` audio files.
*   `audio` (InputFile/String): Audio file.
*   `duration` (Integer): Duration of the audio in seconds.
*   `performer` (String): Performer name.
*   `title` (String): Track name.

### D. sendVideo
Sends `.mp4` video files.
*   `video` (InputFile/String): Video file.
*   `duration` (Integer): Duration of sent video in seconds.
*   `width` (Integer): Video width.
*   `height` (Integer): Video height.
*   `supports_streaming` (Boolean): Pass `true` if the uploaded video is suitable for streaming.

### E. sendLivePhoto
Sends Live Photos (motion photos containing a still frame and a corresponding video clip).
*   `live_photo` (InputFile/String): Live photo file path or `file_id`.
*   `video_clip` (InputFile/String): The companion video clip (`.mp4` format) that plays when user interacts with the photo.
*   `still_frame` (InputFile/String): The fallback still image file.

---

## 3. InputMediaGroup (Albums)

You can send a set of photos, videos, documents, or audio as an album using `sendMediaGroup`.

### `sendMediaGroup` Parameters
*   `chat_id` (Integer/String): Target chat.
*   `media` (Array of InputMedia): A JSON-serialized array describing messages to be sent, must include between 2 and 10 items.
    *   `InputMediaPhoto`
    *   `InputMediaVideo`
    *   `InputMediaAudio`
    *   `InputMediaDocument`

### Multipart Mapping Example
When uploading multiple local files in `sendMediaGroup`, refer to files using `attach://<name>` and attach them as separate parts in the multipart form-data.

```json
[
  {
    "type": "photo",
    "media": "attach://photo1",
    "caption": "First photo"
  },
  {
    "type": "photo",
    "media": "attach://photo2",
    "caption": "Second photo"
  }
]
```

---

## 4. File Reuse & Thumbnails

### File ID Reuse
When a file is uploaded, the API returns a response containing a `file_id` (and a unique `file_unique_id`). 
*   **Always store** the `file_id` in your database.
*   Re-sending a file using `file_id` is near-instantaneous and saves network bandwidth.
*   `file_id` is unique to your bot. Do not share `file_id` values between different bot tokens. `file_unique_id` is the same across bots but cannot be used to upload files directly.

### Thumbnail Generation
For documents, videos, and custom files, you can upload custom previews.
*   Thumbnail must be in JPEG or WebP format.
*   Maximum file size is 200 KB.
*   Dimensions should not exceed 320x320 pixels.

---

## 5. File Retrieval via getFile

To download files sent by users to your bot:

1.  Call `getFile` with the target `file_id`.
2.  The response will return a `File` object containing:
    *   `file_id`: Unique identifier.
    *   `file_unique_id`: Globally unique identifier.
    *   `file_size`: File size in bytes (if known).
    *   `file_path`: Path on Telegram's server (e.g. `photos/file_0.jpg`).
3.  Download the file using the following HTTP request template:
    `https://api.telegram.org/file/bot<token>/<file_path>`

> [!WARNING]
> Bots can download files of up to 20 MB in size using this API. To download larger files or host local attachments, you must run a custom instance of the Local Telegram Bot API server.
