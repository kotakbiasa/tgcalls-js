# Raw MTProto

## When to use raw MTProto

Use raw methods/types only when high-level methods are insufficient.

## Important notes

- Do not invent raw TL constructors.
- Validate method and type names against official docs or `references/llms.txt`.
- Keep raw usage isolated so it can be reviewed and updated safely.

## Examples

Common raw-style operations are available through lower-level APIs. Prefer documented high-level wrappers unless you have a specific reason to drop to raw MTProto.
