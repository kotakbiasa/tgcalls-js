# Troubleshooting

## Flood waits

Respect Telegram flood waits. Back off instead of blind-retrying.

## Disconnects

Long-lived clients should handle disconnects and reconnects explicitly.

## Storage issues

Session storage problems often show up as auth or reconnect failures. Check storage backend behavior and file/database access.

## General debugging steps

1. Confirm exact error message and where it occurs.
2. Check whether it is caused by API behavior, session state, or local code assumption.
3. Patch minimally and verify before assuming it is fixed.

## Verification discipline

If something feels uncertain, check `references/llms.txt` or official docs instead of guessing.
