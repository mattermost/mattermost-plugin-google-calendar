// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {googleMode} from './google/mode';

/** Host port docker-compose.yml publishes the fake's HTTPS listener on. */
const FAKE_HTTPS_PORT = process.env.E2E_FAKE_HTTPS_PORT ?? '8453';

/**
 * Chromium flags that send the browser's Google sign-in to the fake (fake lane only).
 *
 * The plugin redirects the connect popup to https://accounts.google.com/o/oauth2/auth. Playwright's
 * route() does not see requests that follow a redirect, so instead the browser resolves
 * accounts.google.com to the fake's published HTTPS port and the real popup flow runs unchanged:
 * plugin 302 -> fake consent pages -> 302 back to the plugin's /oauth2/complete.
 *
 * The fake's certificate comes from a throwaway CA that the browser does not trust. Every other
 * origin in the suite is plain HTTP (Mattermost on localhost:8075), so ignoring certificate errors
 * only affects the mapped Google host. (BrowserContext ignoreHTTPSErrors would be narrower, but
 * @mattermost/playwright-lib's testBrowser.login() creates its own contexts without it.)
 */
export function fakeGoogleBrowserArgs(): string[] {
    if (googleMode() !== 'fake') {
        return [];
    }
    return [`--host-resolver-rules=MAP accounts.google.com 127.0.0.1:${FAKE_HTTPS_PORT}`, '--ignore-certificate-errors'];
}
