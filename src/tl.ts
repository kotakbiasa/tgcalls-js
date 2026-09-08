/**
 * Lazy TL namespace loader.
 *
 * tgcalls-js works with any GramJS-family client. Different packages expose
 * the generated raw API at different paths, so we probe them in order and
 * cache the first hit. Resolved once per process.
 */

import { createRequire } from 'module';

type AnyApi = Record<string, unknown>;

let cached: AnyApi | null = null;

function tryImport(name: string): AnyApi | null {
  try {
    // Resolve from this package's location so consumer-installed copies
    // found via node_modules walking-up are picked up too.
    const req = createRequire(import.meta.url);
    const mod = req(name) as Record<string, unknown> | undefined;
    if (mod && (mod.Api || (mod.telegram as Record<string, unknown> | undefined)?.Api)) {
      return (mod.Api || (mod.telegram as Record<string, unknown>).Api) as AnyApi;
    }
  } catch {
    /* not installed — probe next candidate */
  }
  return null;
}

/**
 * Resolve the raw TL API namespace. Probes: caller-provided Api, then the
 * `telegram` package (GramJS), then `teleproto`.
 */
export function loadTl(provided?: unknown): AnyApi {
  if (cached) {return cached;}
  if (provided && typeof provided === 'object') {
    cached = provided as AnyApi;
    return cached;
  }
  for (const name of ['telegram', 'teleproto']) {
    const api = tryImport(name);
    if (api) {
      cached = api;
      return cached;
    }
  }
  throw new Error(
    'tgcalls-js: no GramJS-family package found. Install `telegram` or `teleproto`, ' +
    'or pass { Api } in TgCallsOptions.',
  );
}

/** Test-only reset. */
export function resetTlCache(): void {
  cached = null;
}

export type { AnyApi };
