// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Must come first: @mattermost/playwright-lib reads PW_BASE_URL when it is first imported.
import './lib/env';

import {defineConfig, devices} from '@playwright/test';

import {fakeGoogleBrowserArgs} from './lib/browser';
import {VISUAL_STYLE_PATH} from './lib/visual';

// Visual runs (npm run test:visual) set PW_BASE_URL to their own stack and PW_VISUAL_BROWSER_WS to
// its dockerized browser (script/visual.sh). Without PW_VISUAL_BROWSER_WS the visual specs skip,
// because their baselines only match that browser.

export default defineConfig({
    testDir: './specs',
    outputDir: './results/output',

    // No platform suffix: baselines always come from the dockerized browser.
    snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',

    // One worker per server (mattermost-server e2e-tests/playwright/AGENTS.md).
    workers: 1,
    fullyParallel: false,

    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 120_000,
    expect: {timeout: 15_000, toHaveScreenshot: {stylePath: VISUAL_STYLE_PATH}},

    globalSetup: require.resolve('./global_setup'),
    globalTeardown: require.resolve('./global_teardown'),

    reporter: [['list'], ['html', {outputFolder: './results/reporter', open: 'never'}]],

    use: {
        baseURL: process.env.PW_BASE_URL,
        // Traces and screenshots can capture tokens shown in the UI or sent in requests, so they
        // stay off in CI.
        trace: process.env.CI ? 'off' : 'retain-on-failure',
        screenshot: process.env.CI ? 'off' : 'only-on-failure',
        launchOptions: {
            // PW_SLOWMO=500 pauses that many ms between browser actions, for watching a headed run.
            slowMo: Number(process.env.PW_SLOWMO ?? 0),
            args: fakeGoogleBrowserArgs(),
        },
        connectOptions: process.env.PW_VISUAL_BROWSER_WS ? {wsEndpoint: process.env.PW_VISUAL_BROWSER_WS} : undefined,
    },

    projects: [
        {
            name: 'chrome',
            use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 1024}},
        },
    ],
});
