// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './lib/env';

import {fakeGoogle} from './lib/fake_google';
import {googleMode} from './lib/google/mode';

/**
 * Fails the run on any contract violation the fake recorded, even when every test passed: it means
 * the plugin sent something Google's published contract does not allow, called an operation the
 * fake does not cover, or the fake answered with something real Google would not send.
 */
export default async function globalTeardown() {
    if (googleMode() !== 'fake') {
        return;
    }
    const violations = [...new Set(await fakeGoogle.violations())];
    if (violations.length > 0) {
        throw new Error(`Fake Google saw traffic that breaks the Google API contract:\n${violations.join('\n')}`);
    }
}
