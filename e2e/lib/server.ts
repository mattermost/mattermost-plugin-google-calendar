// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Fails fast when the server is down (the stack was not started, or crashed earlier in the run),
 * instead of every test hanging until its timeout.
 */
export async function assertServerAlive(siteURL: string) {
    try {
        const response = await fetch(`${siteURL}/api/v4/system/ping`, {signal: AbortSignal.timeout(10_000)});
        if (response.ok) {
            return;
        }
        throw new Error(`HTTP ${response.status}`);
    } catch (err) {
        throw new Error(
            `Mattermost at ${siteURL} is not responding (${String(err)}). Start the stack with \`make e2e-env-up\` ` +
                'from the repository root, or check `docker compose logs mattermost` in e2e/.',
        );
    }
}
