/**
 * tgcalls-js — typed errors.
 *
 * All library errors extend TgCallsError, so consumers can branch with a
 * single instanceof check instead of matching message strings.
 */

/** Base class for all errors thrown by tgcalls-js. */
export class TgCallsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore the prototype chain broken by downlevel ES5 targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** join()/joinIdle() called while already in a call (or mid-join) in that chat. */
export class AlreadyInCallError extends TgCallsError {
  readonly chatId: bigint;
  constructor(chatId: bigint) {
    super(`Already in a call in chat ${chatId} — leave() first`);
    this.chatId = chatId;
  }
}

/** No active voice chat in the chat and allowCreate was not set. */
export class NoVoiceChatError extends TgCallsError {
  constructor() {
    super('No active voice chat in this chat. Start one first, or pass allowCreate: true.');
  }
}

/** The client passed to TgCallsOptions is neither GramJS-family, mtcute, nor an adapter. */
export class UnrecognizedClientError extends TgCallsError {
  constructor() {
    super(
      'tgcalls-js: unrecognized client. Expected a GramJS/teleproto client (with .invoke), ' +
      'an mtcute client (with .call and .onRawUpdate), or an MTProtoAdapter instance.',
    );
  }
}
