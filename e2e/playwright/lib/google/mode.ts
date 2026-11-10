// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

/**
 * Which Google the run talks to (E2E_GOOGLE):
 * - `fake` (default, the PR lane): fake-google/ in the compose stack. No accounts or secrets. The
 *   plugin reaches it on Google's real hostnames (docker-compose.yml).
 * - `real` (nightly, not wired up yet): real Google with the accounts in .env.local / CI secrets.
 *   Start the stack with `make e2e-env-up E2E_GOOGLE=real`.
 * The specs are the same in both lanes; only credentials and endpoints change.
 */
export type GoogleMode = 'fake' | 'real';

export function googleMode(): GoogleMode {
    const mode = process.env.E2E_GOOGLE ?? 'fake';
    if (mode !== 'fake' && mode !== 'real') {
        throw new Error(`E2E_GOOGLE must be 'fake' or 'real', got '${mode}'.`);
    }
    return mode;
}

/**
 * Skips tests that need the fake: they drive Google's consent pages (real Google blocks automated
 * sign-in), or set up and assert Google-side state through the fake's control API.
 */
export function requireFakeGoogle(reason: string) {
    test.skip(googleMode() === 'real', `Fake Google only: ${reason}`);
}

/** Base URLs for test-side Google calls (seeding and assertions). */
export function googleEndpoints(): {token: string; calendar: string; people: string} {
    if (googleMode() === 'real') {
        return {token: 'https://oauth2.googleapis.com/token', calendar: 'https://www.googleapis.com/calendar/v3', people: 'https://people.googleapis.com/v1'};
    }
    const fake = process.env.FAKE_GOOGLE_URL;
    return {token: `${fake}/token`, calendar: `${fake}/calendar/v3`, people: `${fake}/v1`};
}
