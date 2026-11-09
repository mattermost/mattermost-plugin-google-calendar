// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './lib/env';

import {Client4} from '@mattermost/client';
import {baseGlobalSetup, testConfig} from '@mattermost/playwright-lib';

import {fakeGoogle} from './lib/fake_google';
import {googleMode} from './lib/google/mode';
import {findPluginBundle, uploadPlugin} from './lib/plugin';
import {assertServerAlive} from './lib/server';

/**
 * The stack is started outside the run (`make e2e-env-up`). Global setup checks it is up, points
 * the GOOGLE_* variables at the fake's client and accounts, and uploads the plugin bundle. Specs
 * configure and enable the plugin themselves after pw.initSetup().
 */
export default async function globalSetup() {
    // Fail before touching the server if the bundle is missing or would be rejected.
    const bundle = findPluginBundle();
    await assertServerAlive(testConfig.baseURL);

    if (googleMode() === 'fake') {
        await useFakeGoogleAccounts();
    }

    // Creates the sysadmin (on a fresh server) and default team, and sets default preferences.
    await baseGlobalSetup();

    const adminClient = new Client4();
    adminClient.setUrl(testConfig.baseURL);
    await adminClient.login(testConfig.adminUsername, testConfig.adminPassword);
    await uploadPlugin(adminClient, bundle);
    console.log(`Uploaded plugin bundle ${bundle}`);
}

/**
 * Points the GOOGLE_* variables the specs read at the fake's fixed OAuth client and accounts
 * (replacing any real ones loaded from .env.local), so the same specs run in both lanes. Workers
 * start after global setup and inherit this environment.
 */
async function useFakeGoogleAccounts() {
    try {
        await fakeGoogle.health();
    } catch (err) {
        throw new Error(`The fake Google is not reachable at ${process.env.FAKE_GOOGLE_URL} (${String(err)}). Start the stack with \`make e2e-env-up\`.`);
    }
    await fakeGoogle.reset();
    const {clientId, clientSecret, users} = await fakeGoogle.accounts();
    process.env.GOOGLE_AUTH_MODE = 'refresh_token';
    process.env.GOOGLE_OAUTH_CLIENT_ID = clientId;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = clientSecret;
    for (const user of users) {
        const prefix = user.key === 'owner' ? 'GOOGLE_OWNER' : 'GOOGLE_COLLAB';
        process.env[`${prefix}_EMAIL`] = user.email;
        process.env[`${prefix}_REFRESH_TOKEN`] = user.refreshToken;
    }
    console.log(`Using fake Google at ${process.env.FAKE_GOOGLE_URL} (E2E_GOOGLE=fake)`);
}
