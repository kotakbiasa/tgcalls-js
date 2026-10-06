import type { MTProtoLike } from '../types.js';
import type { MTProtoAdapter, MtcuteLike, SupportedClient } from './types.js';
import { GramjsAdapter } from './gramjs.js';
import { MtcuteAdapter } from './mtcute.js';

export * from './types.js';
export * from './utils.js';
export * from './gramjs.js';
export * from './mtcute.js';

export function isAdapter(client: unknown): client is MTProtoAdapter {
  return typeof client === 'object' && client !== null && (client as Record<string, unknown>).isAdapter === true;
}

export function isMtcuteClient(client: unknown): client is MtcuteLike {
  return (
    typeof client === 'object' &&
    client !== null &&
    typeof (client as Record<string, unknown>).call === 'function' &&
    typeof ((client as Record<string, unknown>).onRawUpdate as { add?: unknown } | undefined)?.add === 'function'
  );
}

export function isGramjsClient(client: unknown): client is MTProtoLike {
  return (
    typeof client === 'object' &&
    client !== null &&
    typeof (client as Record<string, unknown>).invoke === 'function'
  );
}

export function createAdapter(
  client: SupportedClient,
  opts: { Api?: unknown } = {},
): MTProtoAdapter {
  if (isAdapter(client)) {
    return client;
  }
  if (isMtcuteClient(client)) {
    return new MtcuteAdapter(client);
  }
  if (isGramjsClient(client)) {
    return new GramjsAdapter(client, opts);
  }
  throw new Error(
    'tgcalls-js: unrecognized client. Expected a GramJS/teleproto client (with .invoke), ' +
    'an mtcute client (with .call and .onRawUpdate), or an MTProtoAdapter instance.',
  );
}
