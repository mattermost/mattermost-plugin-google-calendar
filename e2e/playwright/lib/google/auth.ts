// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Google credentials for the test accounts. With E2E_GOOGLE=fake (the default), global setup fills
// the GOOGLE_* variables below with the fake's fixed client and accounts. With E2E_GOOGLE=real they
// are real Google credentials, in one of two modes (GOOGLE_AUTH_MODE):
// - refresh_token (local development): refresh tokens from `npm run google:auth`, issued to the same
//   OAuth client the plugin is configured with. Seeded with an expired access token, so the plugin
//   mints access tokens itself, exercising its real refresh path.
// - dwd (CI with a Workspace org): a service account with domain-wide delegation mints access
//   tokens per user. Not implemented until the Workspace org exists. DWD tokens carry no refresh
//   token, so they must be seeded with at least 55 minutes left (lib/kv.ts has the engine detail).

import {test} from '@playwright/test';

import {fakeGoogle} from '../fake_google';
import {seedConnectedUser, type OAuth2Token, type RemoteUser, type UserSettings} from '../kv';

import {assertTestAccounts} from '../safety';

import {googleEndpoints, googleMode} from './mode';

export type GoogleRole = 'owner' | 'collab';

const ROLE_ENV: Record<GoogleRole, {email: string; refreshToken: string}> = {
    owner: {email: 'GOOGLE_OWNER_EMAIL', refreshToken: 'GOOGLE_OWNER_REFRESH_TOKEN'},
    collab: {email: 'GOOGLE_COLLAB_EMAIL', refreshToken: 'GOOGLE_COLLAB_REFRESH_TOKEN'},
};

/** Scopes the plugin requests (gcal/remote.go NewOAuth2Config). */
export const GCAL_OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.settings.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
];

export type GoogleAccount = {role: GoogleRole; email: string; refreshToken: string};

function authMode(): 'refresh_token' | 'dwd' {
    const mode = process.env.GOOGLE_AUTH_MODE ?? 'refresh_token';
    if (mode !== 'refresh_token' && mode !== 'dwd') {
        throw new Error(`GOOGLE_AUTH_MODE must be 'refresh_token' or 'dwd', got '${mode}'.`);
    }
    return mode;
}

/**
 * Skips the test for missing Google setup, except on the real lane in CI, where it throws: otherwise
 * missing or misnamed secrets would skip every Google test and the run would pass having run nothing.
 */
export function skipOrFailForMissingSetup(missing: boolean, message: string) {
    if (missing && googleMode() === 'real' && process.env.CI) {
        throw new Error(`${message} (E2E_GOOGLE=real in CI fails instead of skipping)`);
    }
    test.skip(missing, message);
}

function account(role: GoogleRole): GoogleAccount | null {
    const email = process.env[ROLE_ENV[role].email];
    const refreshToken = process.env[ROLE_ENV[role].refreshToken];
    return email && refreshToken ? {role, email: email.toLowerCase(), refreshToken} : null;
}

/**
 * Returns the requested Google accounts, or skips the test with a message saying what to set up.
 * Call at the top of every test that talks to Google.
 */
export function requireGoogle<R extends GoogleRole>(...roles: R[]): Record<R, GoogleAccount> {
    // Also checked in global setup; repeated here like the localhost check on every database access.
    assertTestAccounts();
    if (authMode() === 'dwd') {
        throw new Error('GOOGLE_AUTH_MODE=dwd is not implemented yet (needs the Workspace test org).');
    }
    skipOrFailForMissingSetup(!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET, 'Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (see e2e/playwright/.env.example).');

    const accounts = {} as Record<R, GoogleAccount>;
    for (const role of roles) {
        const found = account(role);
        skipOrFailForMissingSetup(!found, `Needs ${ROLE_ENV[role].email} and ${ROLE_ENV[role].refreshToken}; run \`npm run google:auth -- ${role}\`.`);
        accounts[role] = found!;
    }
    return accounts;
}

export type GoogleProfile = {remote: RemoteUser; timeZone: string};

/** The account's People resource name, display name and calendar time zone, as the plugin stores them on connect. */
export async function googleProfile(googleAccount: GoogleAccount): Promise<GoogleProfile> {
    if (googleMode() === 'fake') {
        const user = (await fakeGoogle.accounts()).users.find((u) => u.email === googleAccount.email);
        if (!user) {
            throw new Error(`The fake has no account ${googleAccount.email}`);
        }
        return {remote: {id: user.resourceName, displayName: user.displayName, mail: user.email}, timeZone: user.timeZone};
    }
    const accessToken = await googleAccessToken(googleAccount);
    const get = async (url: string) => {
        const response = await fetch(url, {headers: {authorization: `Bearer ${accessToken}`}});
        if (!response.ok) {
            throw new Error(`GET ${url} failed: ${response.status} ${await response.text()}`);
        }
        return response.json();
    };
    const {calendar, people} = googleEndpoints();
    const person = await get(`${people}/people/me?personFields=names,emailAddresses`);
    const tz = await get(`${calendar}/users/me/settings/timezone`);
    return {
        remote: {id: person.resourceName, displayName: person.names?.[0]?.displayName ?? 'No name', mail: person.emailAddresses?.[0]?.value ?? googleAccount.email},
        timeZone: tz.value,
    };
}

type MattermostUser = {id: string; username: string; first_name?: string; last_name?: string};

/**
 * Marks the Mattermost user as connected to the Google account, as the OAuth callback would.
 * By default the token is the account's refresh token with no valid access token, so the plugin
 * refreshes on first use. Pass `token` to seed something else (tests of the refresh path).
 */
export async function seedConnectedGoogleUser(mattermostUser: MattermostUser, googleAccount: GoogleAccount, token?: OAuth2Token, settings?: Partial<UserSettings>): Promise<GoogleProfile> {
    const profile = await googleProfile(googleAccount);
    await seedConnectedUser({
        mattermostUser,
        remote: profile.remote,
        timeZone: profile.timeZone,
        token: token ?? {refresh_token: googleAccount.refreshToken, token_type: 'Bearer'},
        settings,
    });
    return profile;
}

// Keyed by email and refresh token together: a role whose email or token is a copy of another role's
// must still get its own ownership check, and never another role's cached access token.
const accessTokens = new Map<string, {token: string; expiresAt: number}>();
const verifiedTokens = new Set<string>();
const cacheKey = (googleAccount: GoogleAccount) => `${googleAccount.email}\n${googleAccount.refreshToken}`;

/**
 * Real Google: throws unless the refresh token belongs to the configured email. The allowlist
 * (lib/safety.ts) only checks the email, and the token alone decides which account the suite acts
 * as. google:auth checks this when it saves a token, but tokens put in by hand (e.g. CI secrets)
 * could belong to another account. Every test-side Google call, including the start-of-run sweep,
 * gets its first access token through here, so this runs before anything touches the account.
 */
async function assertTokenOwner(googleAccount: GoogleAccount, accessToken: string) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {headers: {authorization: `Bearer ${accessToken}`}});
    if (!response.ok) {
        throw new Error(`Could not check which account ${ROLE_ENV[googleAccount.role].refreshToken} belongs to: userinfo returned ${response.status}.`);
    }
    const email = String((await response.json()).email ?? '').toLowerCase();
    if (email !== googleAccount.email) {
        throw new Error(
            `${ROLE_ENV[googleAccount.role].refreshToken} belongs to ${email || 'an account with no email'}, not ${ROLE_ENV[googleAccount.role].email} ` +
                `(${googleAccount.email}). Run \`npm run google:auth -- ${googleAccount.role}\` to get a token for the right account.`,
        );
    }
}

/** An access token for test-side Google API calls (seeding, assertions, cleanup). */
export async function googleAccessToken(googleAccount: GoogleAccount): Promise<string> {
    const key = cacheKey(googleAccount);
    const cached = accessTokens.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
        return cached.token;
    }

    const response = await fetch(googleEndpoints().token, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
            refresh_token: googleAccount.refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    const body = await response.json();
    if (!response.ok) {
        // invalid_grant usually means the 7-day Testing-status token expired.
        throw new Error(
            `Could not refresh the Google token for ${googleAccount.email}: ${body.error} ${body.error_description ?? ''}. ` +
                `Run \`npm run google:auth -- ${googleAccount.role}\` again.`,
        );
    }
    if (googleMode() === 'real' && !verifiedTokens.has(key)) {
        await assertTokenOwner(googleAccount, body.access_token);
        verifiedTokens.add(key);
    }
    accessTokens.set(key, {token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000});
    return body.access_token;
}
