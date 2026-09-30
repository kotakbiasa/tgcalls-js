#!/usr/bin/env python3
"""Send, edit, stream, or upload media with Telegram Bot API 10.2 Rich Messages.

Supports:
  - sendRichMessage (final message)
  - sendRichMessageDraft (streaming draft with thinking block)
  - editMessageText (with rich_message parameter)
  - Outgoing block JSON (rich_message.blocks)
  - Media bindings: URL, file_id, multipart upload
  - Markdown, HTML, or block JSON content modes

Usage:
    # Send markdown
    python3 send_rich_message.py send --token "$TOKEN" --chat-id "@chan" --markdown-file report.md

    # Send with block JSON
    python3 send_rich_message.py send --token "$TOKEN" --chat-id "@chan" --blocks-json blocks.json

    # Send with multipart upload
    python3 send_rich_message.py send --token "$TOKEN" --chat-id "@chan" --blocks-json blocks.json --upload photo=photo.jpg --upload doc=report.pdf

    # Stream draft
    python3 send_rich_message.py draft --token "$TOKEN" --chat-id 123456 --draft-id 42 --markdown-file draft.md

    # Edit existing message
    python3 send_rich_message.py edit --token "$TOKEN" --chat-id "@chan" --message-id 42 --markdown-file updated.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def read_text(path: str | None) -> str | None:
    if path is None:
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def post_json(token: str, method: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{token}/{method}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Telegram API error {exc.code}: {body}") from exc


def post_multipart(token: str, method: str, fields: dict[str, str], files: dict[str, str]) -> dict[str, Any]:
    """Post multipart/form-data for media uploads."""
    import uuid
    boundary = uuid.uuid4().hex
    body_parts = []

    # Text fields
    for key, value in fields.items():
        body_parts.append(f"--{boundary}\r\n".encode())
        body_parts.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body_parts.append(f"{value}\r\n".encode())

    # File fields
    for name, filepath in files.items():
        filename = os.path.basename(filepath)
        with open(filepath, "rb") as f:
            file_data = f.read()
        body_parts.append(f"--{boundary}\r\n".encode())
        body_parts.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body_parts.append(b"Content-Type: application/octet-stream\r\n\r\n")
        body_parts.append(file_data)
        body_parts.append(b"\r\n")

    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)

    url = f"https://api.telegram.org/bot{token}/{method}"
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Telegram API error {exc.code}: {body}") from exc


def build_rich_message(args) -> dict[str, Any]:
    """Build InputRichMessage from args."""
    rich_message: dict[str, Any] = {}

    markdown = read_text(args.markdown_file)
    html = read_text(args.html_file)
    blocks_json = read_text(args.blocks_json)

    if blocks_json is not None:
        rich_message["blocks"] = json.loads(blocks_json)
    elif markdown is not None:
        rich_message["markdown"] = markdown
    elif html is not None:
        rich_message["html"] = html

    if args.skip_entity_detection:
        rich_message["skip_entity_detection"] = True
    if args.rtl:
        rich_message["is_rtl"] = True

    return rich_message


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Send, edit, stream, or upload media with Telegram Bot API 10.2 Rich Messages."
    )
    parser.add_argument("command", choices=["send", "draft", "edit"],
                        help="send=sendRichMessage, draft=sendRichMessageDraft, edit=editMessageText")
    parser.add_argument("--token", help="Bot token. Prefer TELEGRAM_BOT_TOKEN env.")
    parser.add_argument("--token-env", default="TELEGRAM_BOT_TOKEN")
    parser.add_argument("--chat-id", required=True, help="Target chat (integer or @username)")

    content = parser.add_mutually_exclusive_group(required=True)
    content.add_argument("--markdown-file", help="Path to rich markdown file")
    content.add_argument("--html-file", help="Path to rich HTML file")
    content.add_argument("--blocks-json", help="Path to blocks JSON file (API 10.2)")

    parser.add_argument("--message-id", type=int, help="Edit an existing message (for 'edit')")
    parser.add_argument("--draft-id", type=int, help="Draft ID for streaming (for 'draft')")

    parser.add_argument("--upload", action="append", default=[], metavar="NAME=PATH",
                        help="Multipart upload: --upload photo1=/path/to/file.jpg (API 10.2)")
    parser.add_argument("--silent", action="store_true")
    parser.add_argument("--protect-content", action="store_true")
    parser.add_argument("--skip-entity-detection", action="store_true")
    parser.add_argument("--rtl", action="store_true")

    return parser


def main() -> int:
    args = build_parser().parse_args()
    token = args.token or os.getenv(args.token_env, "")
    if not token:
        raise SystemExit(f"Missing bot token. Set {args.token_env} or pass --token.")

    rich_message = build_rich_message(args)
    if not rich_message:
        raise SystemExit("No content provided. Use --markdown-file, --html-file, or --blocks-json.")

    # Parse uploads
    uploads = {}
    for upload_spec in args.upload:
        if "=" not in upload_spec:
            raise SystemExit(f"Invalid --upload format: {upload_spec}. Use NAME=PATH.")
        name, path = upload_spec.split("=", 1)
        if not os.path.exists(path):
            raise SystemExit(f"Upload file not found: {path}")
        uploads[name] = path

    payload: dict[str, Any] = {
        "chat_id": args.chat_id,
        "rich_message": rich_message,
    }

    method = "sendRichMessage"

    if args.command == "edit":
        if args.message_id is None:
            raise SystemExit("--message-id required for 'edit' command.")
        method = "editMessageText"
        payload["message_id"] = args.message_id
    elif args.command == "draft":
        if args.draft_id is None:
            raise SystemExit("--draft-id required for 'draft' command.")
        method = "sendRichMessageDraft"
        payload["draft_id"] = args.draft_id

    if args.silent and method == "sendRichMessage":
        payload["disable_notification"] = True
    if args.protect_content and method == "sendRichMessage":
        payload["protect_content"] = True

    # Use multipart if uploads are provided
    if uploads:
        fields = {"chat_id": args.chat_id, "rich_message": json.dumps(rich_message, ensure_ascii=False)}
        if args.message_id is not None:
            fields["message_id"] = str(args.message_id)
        if args.draft_id is not None:
            fields["draft_id"] = str(args.draft_id)
        result = post_multipart(token, method, fields, uploads)
    else:
        result = post_json(token, method, payload)

    safe = {"ok": result.get("ok"), "method": method}
    message = result.get("result")
    if isinstance(message, dict):
        safe["message_id"] = message.get("message_id")
        chat = message.get("chat")
        if isinstance(chat, dict):
            safe["chat_id"] = chat.get("id")
    print(json.dumps(safe, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
