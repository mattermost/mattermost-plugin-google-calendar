# Google Calendar plugin e2e tests

Playwright tests for the Google Calendar plugin. The same specs run against two Googles:

- **Fake Google** (default, every PR): `fake-google/` runs in the compose stack and answers on
  Google's real hostnames (`www.googleapis.com`, `people.googleapis.com`, `oauth2.googleapis.com`)
  through Docker network aliases, over TLS with a throwaway CA that Mattermost trusts through
  `SSL_CERT_FILE`. The browser reaches its consent pages as `https://accounts.google.com` through
  Chromium's `--host-resolver-rules`. So the plugin bundle under test is the normal production
  build. No accounts or secrets. Every request and response is checked against Google's published
  API specs (`fake-google/contract/`); a violation fails the run.
- **Real Google** (`make e2e E2E_GOOGLE=real`): the test accounts in `.env.local`. Not in CI yet;
  it waits for the Google Workspace test org. Specs that need the fake's control API skip.

## Requirements

- Node 24 (`nvm use` picks it up from the repo's `.nvmrc`).
- Docker. The Mattermost image is amd64 only; on Apple silicon turn on Docker Desktop's Rosetta
  emulation (QEMU crashes the server at random).

## Running

From the repo root:

```sh
make e2e-env-up      # Mattermost, Postgres and the fake Google
make e2e             # builds the plugin, then npm run check and npm test in e2e/
make e2e-env-down    # stops the stack and wipes its data
```

The stack publishes Mattermost on `localhost:8075`, Postgres on `5434` and the fake on
`8090`/`8453`, so it runs next to other plugin suites on the default ports.

| Command (in `e2e/`) | What it does |
|---|---|
| `npm test` | All specs against the fake Google, except `@visual` |
| `npm run test:visual` | Screenshot baselines (`specs/visual.spec.ts`) on their own pinned stack (port 8077) with a dockerized browser |
| `npm run test:visual-update-snapshots` | Regenerates the baselines; look at every PNG before committing |
| `npm run check` | Type check, test-doc lint, the token encryption check and the fake's smoke tests |
| `npm run contract:check` | Reports changes in Google's published specs since `fake-google/contract/specs/` was updated (also runs daily in CI) |
| `npm run contract:update` | Regenerates `fake-google/contract/specs/` from Google |
| `npm run google:auth -- owner` | Real lane only: gets a refresh token for a test account into `.env.local` |

Settings for real Google and the ports are in `.env.example`. `make e2e-env-logs` prints the
containers' status and logs.

## CI

`.github/workflows/e2e.yml` runs the fake lane on every PR against the oldest supported server
(blocking) and Mattermost master (non-blocking), plus the visual job (non-blocking: the committed
baselines were rendered on arm64). `.github/workflows/e2e-contract-drift.yml` runs
`contract:check` daily and fails only on breaking changes in Google's specs.

## Writing tests

Follow the Mattermost Playwright conventions (mattermost-server `e2e-tests/playwright`):

- No locators in specs: they go in page objects in `pages/`. Prefer role-based locators.
- A JSDoc block with `@objective` (and `@precondition` when setup isn't the default) before each
  test, `// #` comments for actions and `// *` for checks, and one tag, `{tag: '@google_calendar'}`.
  `npm run lint:test-docs` enforces this.
- Seed connected users with `seedConnectedGoogleUser` (`lib/google/auth.ts`) instead of going
  through the consent pages; only `connect.spec.ts` drives them.
- Put fixture events on the calendar with `createFixtureEvent` (`lib/google/events.ts`) and name
  them with `eventSummary(runId, ...)`, so the real lane can clean them up.
