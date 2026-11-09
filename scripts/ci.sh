#!/usr/bin/env bash
# Self-hosted CI for tgcalls-js.
#
# Runs the exact same chain as .github/workflows/ci.yml on any Linux box with
# Node 20+ and ffmpeg — no GitHub Actions required. Useful when Actions is
# disabled at the account level or when you want CI on your own VPS/cloud box.
#
# Usage:
#   scripts/ci.sh                    # test the current checkout
#   scripts/ci.sh --fresh            # clone a pristine copy to a temp dir first
#   scripts/ci.sh --fresh v0.3.0     # same, but pin a git ref (tag/branch/sha)
#
# Environment (all optional):
#   REPO_URL                git URL to clone in --fresh mode
#                          (default: origin remote, else the public repo)
#   NODE_MAJOR              minimum required Node major version (default 20)
#   LOG_FILE                also append a full log here
#   TELEGRAM_BOT_TOKEN      if set together with TELEGRAM_CHAT_ID, send a
#   TELEGRAM_CHAT_ID        pass/fail summary to Telegram when done
#
# Exit codes: 0 = all steps passed, 1 = a step failed (named in the output).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR="${NODE_MAJOR:-20}"
REPO_URL="${REPO_URL:-}"
REF=""
FRESH=0

for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) REF="$arg" ;;
  esac
done

STEP="startup"
cleanup_dir=""
on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    echo ""
    echo "CI FAILED at step: ${STEP} (exit ${code})"
  fi
  [ -n "$cleanup_dir" ] && rm -rf "$cleanup_dir"
  if [ "$code" -eq 0 ]; then
    summary="✅ tgcalls-js CI passed"
  else
    summary="❌ tgcalls-js CI FAILED at: ${STEP}"
  fi
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s --max-time 15 -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d text="${summary} (ref: ${REF:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)})" \
      >/dev/null || true
  fi
  exit "$code"
}
trap on_exit EXIT

log() { echo "[ci] $*"; }

run_step() {
  STEP="$1"; shift
  local start=$SECONDS
  log "=== ${STEP} ==="
  "$@"
  log "--- ${STEP} OK ($((SECONDS - start))s)"
}

# ---------------------------------------------------------------- fresh mode
if [ "$FRESH" = "1" ]; then
  cleanup_dir="$(mktemp -d)"
  ROOT="${cleanup_dir}/tgcalls-js"
  if [ -z "$REPO_URL" ]; then
    origin="$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" remote get-url origin 2>/dev/null || true)"
    REPO_URL="${origin:-https://github.com/kotakbiasa/tgcalls-js.git}"
  fi
  log "cloning ${REPO_URL} ${REF:+(ref ${REF})} into ${ROOT}"
  if [ -n "$REF" ]; then
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$ROOT"
  else
    git clone --depth 1 "$REPO_URL" "$ROOT"
  fi
fi

cd "$ROOT"

# ------------------------------------------------------------ preflight
STEP="preflight"
NODE_MAJOR_NOW="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR_NOW" -lt "$MIN_NODE_MAJOR" ]; then
  echo "Node ${MIN_NODE_MAJOR}+ required, found $(node --version)" >&2
  exit 1
fi
log "node $(node --version), npm $(npm --version)"
if ! command -v ffmpeg >/dev/null 2>&1; then
  log "WARNING: ffmpeg not found — the video test will be skipped (audio tests still run)"
else
  log "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
fi

# ------------------------------------------------------------------- chain
run_step "install (npm ci)" npm ci --no-audit --no-fund
run_step "build" npm run build
run_step "typecheck:all" npm run typecheck:all
run_step "test" npm test
run_step "smoke" npm run smoke

log "ALL STEPS PASSED"
