# Media & Files

## Sending media

Common high-level methods include:
- `send_photo`
- `send_video`
- `send_audio`
- `send_document`
- `send_animation`
- `send_voice`
- `send_video_note`
- `send_media_group`
- `send_paid_media`

## Downloading and streaming

- `download_media(...)`
- `stream_media(...)`

Prefer streaming for large files. Do not load entire files into memory when avoidable.

## Caveats

- MTProto limits differ from Bot API limits.
- Large files may require different handling than small media.
- Validate file inputs and handle upload/download failures explicitly.
