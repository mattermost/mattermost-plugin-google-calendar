#!/usr/bin/env bash
# Runs the @visual specs (specs/visual.spec.ts) on their own throwaway compose project: a pinned
# Mattermost release on port 8077, the fake Google, and a dockerized Playwright browser
# (docker-compose.visual.yml), so the screenshots match on any machine and in CI. It never touches
# the normal stack (make e2e-env-up), which can keep running. Extra arguments go to
# `playwright test`, e.g. --update-snapshots. Copied from the Google Drive suite's script/visual.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

# Baselines are tied to this exact server build; bump it together with test:visual-update-snapshots.
export MM_IMAGE=mattermost/mattermost-enterprise-edition:12.0.1
export MM_PORT=8077
export E2E_FAKE_PORT=8091
export E2E_FAKE_HTTPS_PORT=8454
export E2E_DB_PORT=5437
export VISUAL_BROWSER_PORT=3338
export PLAYWRIGHT_VERSION
PLAYWRIGHT_VERSION=$(node -p "require('@playwright/test/package.json').version")
if [ -z "${VISUAL_BROWSER_PLATFORM:-}" ]; then
  case "$(uname -m)" in
    arm64 | aarch64) VISUAL_BROWSER_PLATFORM=linux/arm64 ;;
    *) VISUAL_BROWSER_PLATFORM=linux/amd64 ;;
  esac
fi
export VISUAL_BROWSER_PLATFORM

# What lib/env.ts, global_setup.ts and playwright.config.ts read. Pin them all: .env.local may point
# them at another stack.
export E2E_GOOGLE=fake
export PW_BASE_URL="http://localhost:$MM_PORT"
export PW_VISUAL_BROWSER_WS="ws://127.0.0.1:$VISUAL_BROWSER_PORT/"
export E2E_DATABASE_URL="postgres://mmuser:mostest@127.0.0.1:$E2E_DB_PORT/mattermost_test"
export FAKE_GOOGLE_URL="http://127.0.0.1:$E2E_FAKE_PORT"

compose() {
  docker compose -p gcal-plugin-e2e-visual -f docker-compose.yml -f docker-compose.visual.yml --profile fake "$@"
}

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    mkdir -p logs
    compose logs --no-color > logs/visual-containers.log 2>&1 || true
    echo "Container logs: e2e/playwright/logs/visual-containers.log"
  fi
  compose down -v >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

echo "Starting the visual stack ($MM_IMAGE at $PW_BASE_URL, browser $VISUAL_BROWSER_PLATFORM)"
compose up -d --wait

npx playwright test --grep @visual "$@"
