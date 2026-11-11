// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Guards against pointing the suite at something that isn't a test target. The suite deletes every
// Google connection in the database it is given (lib/kv.ts resetConnections), rewrites the plugin's
// SiteURL, OAuth client and encryption key on the server it is given (lib/plugin.ts), and on real
// Google creates events and sends invites (sendUpdates=all) to the accounts it is given.
//
// - Servers: PW_BASE_URL, E2E_DATABASE_URL and FAKE_GOOGLE_URL must be on localhost, unless
//   E2E_ALLOW_REMOTE_SERVER=1 (for a disposable remote test server only).
// - Accounts (real Google only): GOOGLE_OWNER_EMAIL and GOOGLE_COLLAB_EMAIL must be listed in
//   E2E_GOOGLE_TEST_ACCOUNTS, a comma-separated list of addresses or `@domain` entries (e.g. the
//   Workspace test org's domain). Exact addresses are needed for consumer Gmail test accounts.

import {googleMode} from './google/mode';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// A path is a Unix socket directory, which is always local.
const isLocalHost = (host: string) => LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.startsWith('/');

function isLocal(url: string): boolean {
    try {
        const {hostname, searchParams} = new URL(url);
        // node-postgres lets a ?host= query parameter override the URL's host.
        const hostParam = searchParams.get('host');
        return isLocalHost(hostname) && (hostParam === null || isLocalHost(hostParam));
    } catch {
        return false;
    }
}

/** Throws unless every configured server and database is on localhost (or remote is explicitly allowed). */
export function assertLocalTargets() {
    if (process.env.E2E_ALLOW_REMOTE_SERVER === '1') {
        return;
    }
    const targets: Array<[string, string | undefined]> = [
        ['PW_BASE_URL', process.env.PW_BASE_URL],
        ['E2E_DATABASE_URL', process.env.E2E_DATABASE_URL],
        ['FAKE_GOOGLE_URL', googleMode() === 'fake' ? process.env.FAKE_GOOGLE_URL : undefined],
    ];
    for (const [name, value] of targets) {
        if (value && !isLocal(value)) {
            throw new Error(
                `${name} points at ${new URL(value).host}, which is not localhost. The suite deletes plugin data and ` +
                    'rewrites plugin settings on its target, so it only runs against a local stack. For a disposable ' +
                    'remote test server, set E2E_ALLOW_REMOTE_SERVER=1.',
            );
        }
    }
}

function allowedAccounts(): string[] {
    return (process.env.E2E_GOOGLE_TEST_ACCOUNTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Whether an address is covered by E2E_GOOGLE_TEST_ACCOUNTS (an exact address or an `@domain` entry). */
export function isTestAccount(email: string, allowed = allowedAccounts()): boolean {
    const address = email.trim().toLowerCase();
    return allowed.some((entry) => (entry.startsWith('@') ? address.endsWith(entry) : address === entry));
}

/** On real Google, throws unless both test accounts are listed in E2E_GOOGLE_TEST_ACCOUNTS. */
export function assertTestAccounts() {
    if (googleMode() !== 'real') {
        return;
    }
    for (const name of ['GOOGLE_OWNER_EMAIL', 'GOOGLE_COLLAB_EMAIL']) {
        const email = process.env[name];
        if (email && !isTestAccount(email)) {
            throw new Error(
                `${name} is not listed in E2E_GOOGLE_TEST_ACCOUNTS. On real Google the suite creates events on this ` +
                    "account's calendar and sends it invites, so list the test accounts (or the test org's @domain) there.",
            );
        }
    }
}
