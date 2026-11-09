// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Unit smoke test for the fake Google (npm run fake:smoke, part of npm run check). Starts the
// fake on a random HTTP port, drives OAuth and every Calendar/People route the plugin uses the
// way the plugin's Go client does, and checks the fake recorded no contract violations.

import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import path from 'node:path';
import {after, before, beforeEach, describe, test} from 'node:test';

type Json = Record<string, any>;

let fake: ChildProcess;
let base = '';

before(async () => {
    fake = spawn(process.execPath, [path.join(import.meta.dirname, 'server.ts')], {
        env: {...process.env, FAKE_HTTP_PORT: '0', FAKE_CERT_DIR: '/nonexistent'},
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    base = await new Promise<string>((resolve, reject) => {
        fake.stdout!.on('data', (chunk: Buffer) => {
            const port = /http:\/\/0\.0\.0\.0:(\d+)/.exec(chunk.toString())?.[1];
            if (port) {
                resolve(`http://127.0.0.1:${port}`);
            }
        });
        fake.on('exit', (code) => reject(new Error(`fake exited with ${code}`)));
    });
});

after(() => {
    fake.kill();
});

beforeEach(async () => {
    await control('POST', 'reset');
});

async function control(method: string, route: string, body?: unknown): Promise<any> {
    const response = await fetch(`${base}/__control/${route}`, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
    assert.ok(response.ok, `${method} ${route}: ${response.status} ${await response.clone().text()}`);
    return response.status === 204 ? undefined : response.json();
}

async function token(user: 'owner' | 'collab' = 'owner'): Promise<string> {
    const {clientId, clientSecret} = await control('GET', 'accounts');
    const response = await fetch(`${base}/token`, {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: `fake-refresh-${user}`, client_id: clientId, client_secret: clientSecret}),
    });
    assert.equal(response.status, 200);
    return (await response.json()).access_token;
}

async function call(accessToken: string, method: string, pathAndQuery: string, body?: Json): Promise<{status: number; body: any}> {
    const response = await fetch(`${base}${pathAndQuery}`, {
        method,
        headers: {authorization: `Bearer ${accessToken}`, ...(body ? {'content-type': 'application/json'} : {})},
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {status: response.status, body: text ? JSON.parse(text) : undefined};
}

async function assertNoViolations() {
    assert.deepEqual((await control('GET', 'violations')).value, []);
}

// The query the plugin's GetDefaultCalendarView and GetEventsBetweenDates send (gcal/views.go, gcal/event.go).
function listQuery(timeMin: string, timeMax: string, extra: Record<string, string> = {}) {
    return `/calendar/v3/calendars/primary/events?${new URLSearchParams({
        alt: 'json', eventTypes: 'default', orderBy: 'startTime', prettyPrint: 'false', showDeleted: 'false',
        showHiddenInvitations: 'false', singleEvents: 'true', timeMax, timeMin, ...extra,
    })}`;
}

describe('OAuth', () => {
    test('issues a refresh token only when the consent screen was shown', async () => {
        const {clientId, clientSecret} = await control('GET', 'accounts');
        const redirectUri = 'http://localhost:8075/plugins/com.mattermost.gcal/oauth2/complete';
        const authorizeQuery = (prompt?: string) => new URLSearchParams({
            client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar', state: 'st', access_type: 'offline', ...(prompt ? {prompt} : {}),
        });
        const sid = async (prompt?: string) => /name="sid" value="([^"]+)"/.exec(await (await fetch(`${base}/o/oauth2/auth?${authorizeQuery(prompt)}`)).text())![1];
        const post = (form: Record<string, string>) => fetch(`${base}/o/oauth2/consent`, {method: 'POST', body: new URLSearchParams(form), redirect: 'manual'});
        const exchange = async (location: string) => (await fetch(`${base}/token`, {
            method: 'POST',
            body: new URLSearchParams({grant_type: 'authorization_code', code: new URL(location).searchParams.get('code')!, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret}),
        })).json();

        // First grant: account chooser, then the consent screen.
        const first = await sid('consent');
        const consentPage = await (await post({sid: first, account: 'owner'})).text();
        assert.match(consentPage, /wants access to your Google Account/);
        const allowed = await post({sid: first, account: 'owner', decision: 'allow'});
        assert.equal(allowed.status, 302);
        const granted = await exchange(allowed.headers.get('location')!);
        assert.equal(granted.refresh_token, 'fake-refresh-owner');

        // Without prompt=consent an earlier grant skips the consent screen and no refresh token comes back.
        const skipped = await post({sid: await sid(), account: 'owner'});
        assert.equal(skipped.status, 302);
        assert.equal((await exchange(skipped.headers.get('location')!)).refresh_token, undefined);

        // Cancelling the consent screen redirects with access_denied and keeps the state.
        const second = await sid('consent');
        const denied = await post({sid: second, account: 'owner', decision: 'deny'});
        const deniedUrl = new URL(denied.headers.get('location')!);
        assert.equal(deniedUrl.searchParams.get('error'), 'access_denied');
        assert.equal(deniedUrl.searchParams.get('state'), 'st');

        const prompts = (await control('GET', 'requests')).value.filter((r: Json) => r.path === '/o/oauth2/auth').map((r: Json) => r.query.prompt);
        assert.deepEqual(prompts, ['consent', undefined, 'consent']);
        await assertNoViolations();
    });

    test('rejects a revoked refresh token with invalid_grant and honours the configured access token lifetime', async () => {
        await control('POST', 'config', {accessTokenTtlSeconds: 120});
        const {clientId, clientSecret} = await control('GET', 'accounts');
        const refresh = () => fetch(`${base}/token`, {method: 'POST', body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: 'fake-refresh-owner', client_id: clientId, client_secret: clientSecret})});
        const ok = await (await refresh()).json();
        assert.equal(ok.expires_in, 120);
        await control('POST', 'tokens/revoke', {user: 'owner'});
        assert.equal((await call(ok.access_token, 'GET', '/calendar/v3/users/me/settings/timezone?alt=json&prettyPrint=false')).status, 401);
        const revoked = await refresh();
        assert.equal(revoked.status, 400);
        assert.deepEqual(await revoked.json(), {error: 'invalid_grant', error_description: 'Token has been expired or revoked.'});
    });
});

describe('People and settings', () => {
    test('returns the profile, time zone and primary calendar the plugin reads on connect', async () => {
        await control('POST', 'config', {timeZones: {owner: 'Europe/Berlin'}});
        const accessToken = await token();
        const me = await call(accessToken, 'GET', '/v1/people/me?alt=json&personFields=names%2CemailAddresses&prettyPrint=false');
        assert.equal(me.status, 200);
        assert.equal(me.body.resourceName, 'people/100000000000000000001');
        assert.equal(me.body.emailAddresses[0].value, 'owner@fake-google.test');
        assert.equal(me.body.names[0].displayName, 'Calendar Owner');
        assert.equal((await call(accessToken, 'GET', '/v1/people/me?alt=json')).status, 400);

        const tz = await call(accessToken, 'GET', '/calendar/v3/users/me/settings/timezone?alt=json&prettyPrint=false');
        assert.equal(tz.body.value, 'Europe/Berlin');
        const cal = await call(accessToken, 'GET', '/calendar/v3/calendars/primary?alt=json&prettyPrint=false');
        assert.equal(cal.body.summary, 'owner@fake-google.test');
        await assertNoViolations();
    });
});

describe('events', () => {
    test('lists only events inside timeMin/timeMax, ordered by start time, and pages with pageToken', async () => {
        const day = '2030-03-10';
        for (const [summary, start, end] of [
            ['late', `${day}T15:00:00Z`, `${day}T16:00:00Z`],
            ['early', `${day}T09:00:00Z`, `${day}T10:00:00Z`],
            ['before window', '2030-03-09T09:00:00Z', '2030-03-09T10:00:00Z'],
            ['ends at timeMin', `${day}T07:00:00Z`, `${day}T08:00:00Z`],
            ['middle', `${day}T12:00:00+02:00`, `${day}T13:00:00+02:00`],
        ]) {
            await control('POST', 'users/owner/events', {summary, start: {dateTime: start}, end: {dateTime: end}});
        }
        await control('POST', 'users/owner/events', {summary: 'all day', start: {date: day}, end: {date: '2030-03-11'}});
        const accessToken = await token();

        const all = await call(accessToken, 'GET', listQuery(`${day}T08:00:00Z`, `${day}T23:00:00Z`));
        assert.equal(all.status, 200);
        assert.deepEqual(all.body.items.map((e: Json) => e.summary), ['all day', 'early', 'middle', 'late']);
        assert.equal(all.body.items[1].organizer.self, true);

        const first = await call(accessToken, 'GET', listQuery(`${day}T08:00:00Z`, `${day}T23:00:00Z`, {maxResults: '3'}));
        assert.equal(first.body.items.length, 3);
        assert.ok(first.body.nextPageToken);
        const second = await call(accessToken, 'GET', listQuery(`${day}T08:00:00Z`, `${day}T23:00:00Z`, {maxResults: '3', pageToken: first.body.nextPageToken}));
        assert.deepEqual(second.body.items.map((e: Json) => e.summary), ['late']);
        assert.equal(second.body.nextPageToken, undefined);
        await assertNoViolations();
    });

    test('expands recurring events only with singleEvents=true and refuses orderBy=startTime without it', async () => {
        await control('POST', 'users/owner/events', {
            summary: 'standup', start: {dateTime: '2030-03-10T09:00:00Z'}, end: {dateTime: '2030-03-10T09:15:00Z'}, recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
        });
        const accessToken = await token();
        const expanded = await call(accessToken, 'GET', listQuery('2030-03-11T00:00:00Z', '2030-03-13T00:00:00Z'));
        assert.deepEqual(expanded.body.items.map((e: Json) => e.start.dateTime), ['2030-03-11T09:00:00Z', '2030-03-12T09:00:00Z']);
        assert.ok(expanded.body.items.every((e: Json) => e.recurringEventId && !e.recurrence));

        const instance = await call(accessToken, 'GET', `/calendar/v3/calendars/primary/events/${expanded.body.items[0].id}?alt=json`);
        assert.equal(instance.status, 200);

        const masters = await call(accessToken, 'GET', `/calendar/v3/calendars/primary/events?${new URLSearchParams({timeMin: '2030-03-11T00:00:00Z', timeMax: '2030-03-13T00:00:00Z'})}`);
        assert.equal(masters.body.items.length, 1);
        assert.deepEqual(masters.body.items[0].recurrence, ['RRULE:FREQ=DAILY;COUNT=5']);

        const refused = await call(accessToken, 'GET', `/calendar/v3/calendars/primary/events?${new URLSearchParams({orderBy: 'startTime'})}`);
        assert.equal(refused.status, 400);
        await assertNoViolations();
    });

    test('inserts an event with attendees, adds the organizer and copies it to the attendee calendar', async () => {
        const accessToken = await token();
        const inserted = await call(accessToken, 'POST', '/calendar/v3/calendars/primary/events?alt=json&prettyPrint=false&sendUpdates=all', {
            summary: 'planning',
            start: {dateTime: '2030-03-10T09:00:00Z', timeZone: 'UTC'},
            end: {dateTime: '2030-03-10T10:00:00Z', timeZone: 'UTC'},
            attendees: [{email: 'collab@fake-google.test'}, {email: 'someone@example.com'}],
        });
        assert.equal(inserted.status, 200);
        assert.deepEqual(inserted.body.attendees.map((a: Json) => a.email), ['owner@fake-google.test', 'collab@fake-google.test', 'someone@example.com']);
        const collabCopy = (await control('GET', 'users/collab/events')).value;
        assert.equal(collabCopy[0].id, inserted.body.id);

        const badTz = await call(accessToken, 'POST', '/calendar/v3/calendars/primary/events?alt=json', {
            summary: 'x', start: {dateTime: '2030-03-10T09:00:00Z', timeZone: 'Pacific Standard Time'}, end: {dateTime: '2030-03-10T10:00:00Z'},
        });
        assert.equal(badTz.status, 400);
        await assertNoViolations();
    });

    test('rejects a watch on an HTTP address and stops a channel it created', async () => {
        const accessToken = await token();
        const http = await call(accessToken, 'POST', '/calendar/v3/calendars/primary/events/watch?alt=json&eventTypes=default', {id: 'chan-1', type: 'webhook', address: 'http://localhost:8075/x'});
        assert.equal(http.status, 400);
        const watch = await call(accessToken, 'POST', '/calendar/v3/calendars/primary/events/watch?alt=json&eventTypes=default', {id: 'chan-1', token: 't', type: 'webhook', address: 'https://mm.example.com/x', params: {ttl: '60'}});
        assert.equal(watch.status, 200);
        const stop = await call(accessToken, 'POST', '/calendar/v3/channels/stop?alt=json', {id: 'chan-1', resourceId: watch.body.resourceId});
        assert.equal(stop.status, 204);
        await assertNoViolations();
    });
});

describe('contract', () => {
    test('records operations outside the contract and undocumented query parameters as violations', async () => {
        const accessToken = await token();
        assert.equal((await call(accessToken, 'DELETE', '/calendar/v3/calendars/primary/events/abc')).status, 404);
        await call(accessToken, 'GET', '/calendar/v3/calendars/primary?bogus=1');
        const violations = (await control('GET', 'violations')).value;
        assert.equal(violations.length, 2);
        assert.match(violations[0], /DELETE .*is not covered/);
        assert.match(violations[1], /undocumented query parameter "bogus"/);
    });
});
