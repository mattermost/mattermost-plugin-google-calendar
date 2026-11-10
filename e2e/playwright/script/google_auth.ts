// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Local development only (GOOGLE_AUTH_MODE=refresh_token). Gets a Google refresh token for one
// test account with the same OAuth client and scopes the plugin uses, and saves it to .env.local.
//
//   npm run google:auth -- owner     # account in GOOGLE_OWNER_EMAIL
//   npm run google:auth -- collab    # account in GOOGLE_COLLAB_EMAIL
//
// You open the printed link in your normal browser and approve; nothing is automated, because
// Google blocks sign-in from automated browsers. In "Testing" publishing status Google expires
// these refresh tokens after 7 days, so re-run this weekly. Each run mints a new refresh token
// (prompt=consent), and Google keeps at most 100 per account and client, so don't use the same
// account for the real connect test. Adapted from the Google Drive plugin's suite.
//
// The OAuth client needs http://localhost:8765/callback as an authorized redirect URI.

import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

import {GCAL_OAUTH_SCOPES} from '../lib/google/auth';
import {isTestAccount} from '../lib/safety';

// E2E_ENV_FILE (relative to e2e/playwright/) picks another file, e.g. for a second OAuth client.
const ENV_FILE = path.resolve(__dirname, '..', process.env.E2E_ENV_FILE ?? '.env.local');
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const ROLES = {
    owner: {emailVar: 'GOOGLE_OWNER_EMAIL', tokenVar: 'GOOGLE_OWNER_REFRESH_TOKEN'},
    collab: {emailVar: 'GOOGLE_COLLAB_EMAIL', tokenVar: 'GOOGLE_COLLAB_REFRESH_TOKEN'},
} as const;

function fail(message: string): never {
    console.error(`\n✘ ${message}\n`);
    process.exit(1);
}

if (fs.existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE);
}

const role = process.argv[2] as keyof typeof ROLES;
if (!ROLES[role]) {
    fail('Usage: npm run google:auth -- owner|collab');
}
const {emailVar, tokenVar} = ROLES[role];
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const expectedEmail = process.env[emailVar]?.toLowerCase();
if (!clientId || !clientSecret) {
    fail(`GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in ${ENV_FILE}.`);
}
if (!expectedEmail) {
    fail(`${emailVar} must be set in ${ENV_FILE}.`);
}
if (!isTestAccount(expectedEmail)) {
    fail(`${emailVar} is not listed in E2E_GOOGLE_TEST_ACCOUNTS in ${ENV_FILE}. Only get tokens for test accounts: the real lane creates events on them and sends them invites.`);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GCAL_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    login_hint: expectedEmail,
    state,
}).toString();

async function exchangeCode(code: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            code,
            client_id: clientId!,
            client_secret: clientSecret!,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });
    const body = await response.json();
    if (!response.ok) {
        throw new Error(`token exchange failed: ${response.status} ${body.error}: ${body.error_description ?? ''}`);
    }
    return body as {access_token: string; refresh_token?: string; scope: string};
}

async function fetchEmail(accessToken: string): Promise<string> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!response.ok) {
        throw new Error(`userinfo failed: ${response.status}`);
    }
    return ((await response.json()).email as string).toLowerCase();
}

/** Sets KEY=value in .env.local, replacing an existing line or appending one. */
function saveToEnvFile(key: string, value: string) {
    const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split('\n') : [];
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (index >= 0) {
        lines[index] = `${key}=${value}`;
    } else {
        if (lines.length && lines[lines.length - 1] === '') {
            lines.pop();
        }
        lines.push(`${key}=${value}`, '');
    }
    fs.writeFileSync(ENV_FILE, lines.join('\n'), {mode: 0o600});
}

// The message can carry Google's `error` query parameter, so it is escaped.
function page(res: http.ServerResponse, status: number, message: string) {
    const escaped = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.writeHead(status, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:2em"><p>${escaped}</p></body></html>`);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname !== '/callback') {
        page(res, 404, 'Not found');
        return;
    }

    try {
        if (url.searchParams.get('error')) {
            throw new Error(`Google returned "${url.searchParams.get('error')}"`);
        }
        if (url.searchParams.get('state') !== state) {
            throw new Error('state mismatch; start again');
        }

        const tokens = await exchangeCode(url.searchParams.get('code') ?? '');
        if (!tokens.refresh_token) {
            throw new Error('Google returned no refresh token');
        }

        const email = await fetchEmail(tokens.access_token);
        if (email !== expectedEmail) {
            throw new Error(`signed in as ${email}, but ${emailVar} is ${expectedEmail}; sign in with that account`);
        }

        // Google's consent screen lets people untick individual scopes; the plugin needs all of them.
        const granted = new Set(tokens.scope.split(' '));
        const missing = GCAL_OAUTH_SCOPES.filter((s) => !granted.has(s));
        if (missing.length) {
            throw new Error(`these scopes were not granted (tick every box on the consent screen): ${missing.join(', ')}`);
        }

        saveToEnvFile(tokenVar, tokens.refresh_token);
        page(res, 200, `Saved a refresh token for ${email}. You can close this tab.`);
        console.log(`\n✓ Saved ${tokenVar} for ${email} to ${ENV_FILE} (all ${GCAL_OAUTH_SCOPES.length} scopes granted).\n`);
        // Exit rather than only closing the server: the browser keeps its connection alive, so the
        // process would linger on the port and swallow the next account's redirect.
        server.closeAllConnections();
        process.exit(0);
    } catch (err) {
        page(res, 400, `Failed: ${String((err as Error).message)}. See the terminal.`);
        server.closeAllConnections();
        fail(String((err as Error).message));
    }
});

server.listen(PORT, 'localhost', () => {
    console.log(`\nSign in as ${expectedEmail} and approve every permission at:\n\n${authUrl.toString()}\n`);
    console.log('Waiting for Google to redirect back… (Ctrl+C to cancel)');
});
