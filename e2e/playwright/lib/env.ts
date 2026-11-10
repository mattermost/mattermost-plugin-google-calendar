// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Import first, before @mattermost/playwright-lib: the library reads process.env when its module
// is evaluated.

import fs from 'node:fs';
import path from 'node:path';

// Untracked local settings (real Google credentials, external server). Variables already set in
// the shell win. E2E_ENV_FILE (relative to e2e/playwright/) picks another file, e.g. for a second OAuth client.
const envFile = path.resolve(__dirname, '..', process.env.E2E_ENV_FILE ?? '.env.local');
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

// The compose stack publishes Mattermost on a fixed host port that matches its internal port, so
// SiteURL http://localhost:8075 works from the browser and inside the container, and is the
// redirect URI the fake (and a real OAuth client) allows.
process.env.PW_BASE_URL ??= 'http://localhost:8075';

/** Control API of the fake Google (docker-compose.yml publishes it on 127.0.0.1:8090). */
process.env.FAKE_GOOGLE_URL ??= 'http://127.0.0.1:8090';

/** Postgres of the compose stack, for KV seeding (lib/kv.ts). */
process.env.E2E_DATABASE_URL ??= 'postgres://mmuser:mostest@127.0.0.1:5434/mattermost_test';
