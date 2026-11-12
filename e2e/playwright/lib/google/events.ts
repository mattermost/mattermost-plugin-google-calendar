// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect} from '@playwright/test';

import {fakeGoogle, type FakeEventInput} from '../fake_google';

import type {GoogleAccount} from './auth';
import {googleAccessToken} from './auth';
import {googleEndpoints, googleMode} from './mode';

// Fixture events on a Google user's primary calendar: the fake's control API in fake mode, the
// Calendar API in real mode. Every summary starts with the run's prefix so the real lane can clean up.

export type FixtureEvent = {id: string; summary: string};

/** `[e2e-<id>] <title>`: the prefix every fixture and created event carries. */
export function eventSummary(id: string, title: string): string {
    return `[e2e-${id}] ${title}`;
}

/** The calendar date `offsetDays` from today in `timeZone`, as YYYY-MM-DD. */
export function dateIn(timeZone: string, offsetDays = 0): string {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    const [y, m, d] = parts.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
    return date.toISOString().slice(0, 10);
}

/** A timed event on `date` (YYYY-MM-DD) from `start` to `end` (HH:MM) in `timeZone`. */
export function timedEvent(summary: string, date: string, start: string, end: string, timeZone: string, extra: Partial<FakeEventInput> = {}): FakeEventInput {
    return {
        summary,
        start: {dateTime: `${date}T${start}:00`, timeZone},
        end: {dateTime: `${date}T${end}:00`, timeZone},
        ...extra,
    };
}

/** An all-day event on `date` (YYYY-MM-DD). */
export function allDayEvent(summary: string, date: string, extra: Partial<FakeEventInput> = {}): FakeEventInput {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return {summary, start: {date}, end: {date: next.toISOString().slice(0, 10)}, ...extra};
}

async function calendarApi(account: GoogleAccount, method: string, path: string, body?: unknown, okStatuses: number[] = []) {
    const response = await fetch(`${googleEndpoints().calendar}${path}`, {
        method,
        headers: {authorization: `Bearer ${await googleAccessToken(account)}`, 'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && !okStatuses.includes(response.status)) {
        throw new Error(`Calendar API ${method} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return response.status === 204 || !response.ok ? undefined : response.json();
}

// Every event a test puts on (or finds on) a calendar, so cleanup deletes by id. Lookups go through
// Google's `q` search, which can lag right after an insert, so cleanup must not depend on it.
const tracked: Array<{account: GoogleAccount; id: string}> = [];

/** Records an event for cleanupEvents(), e.g. one the plugin created and a test looked up. */
export function trackEvent(account: GoogleAccount, id: string) {
    if (!tracked.some((t) => t.account.email === account.email && t.id === id)) {
        tracked.push({account, id});
    }
}

/** Puts an event on the account's primary calendar without notifying anyone, and tracks it for cleanup. */
export async function createFixtureEvent(account: GoogleAccount, event: FakeEventInput): Promise<FixtureEvent> {
    let created: FixtureEvent;
    if (googleMode() === 'fake') {
        const result = await fakeGoogle.createEvent(account.email, event);
        created = {id: result.id, summary: result.summary};
    } else {
        const {hangoutLink: _ignored, ...insertable} = event;
        const result = await calendarApi(account, 'POST', '/calendars/primary/events?sendUpdates=none', insertable);
        created = {id: result.id, summary: result.summary};
    }
    trackEvent(account, created.id);
    return created;
}

/** Deletes one event by id without notifying anyone. An event that is already gone is fine. */
export async function deleteEvent(account: GoogleAccount, id: string) {
    if (googleMode() === 'fake') {
        await fakeGoogle.deleteEvent(account.email, id).catch(() => undefined);
    } else {
        await calendarApi(account, 'DELETE', `/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`, undefined, [404, 410]);
    }
    const i = tracked.findIndex((t) => t.account.email === account.email && t.id === id);
    if (i >= 0) {
        tracked.splice(i, 1);
    }
}

/** Deletes every tracked event (call in afterEach). */
export async function cleanupEvents() {
    for (const {account, id} of [...tracked]) {
        await deleteEvent(account, id);
    }
}

/**
 * Events on the account's primary calendar whose summary contains `text`. On real Google this uses
 * the `q` search, which can lag behind an insert: poll it (expect.poll) rather than reading it once.
 */
export async function findEvents(account: GoogleAccount, text: string): Promise<Array<FixtureEvent & Record<string, any>>> {
    if (googleMode() === 'fake') {
        return (await fakeGoogle.events(account.email)).filter((e) => e.summary.includes(text));
    }
    const items: any[] = [];
    let pageToken: string | undefined;
    do {
        const params = new URLSearchParams({q: text, singleEvents: 'true', maxResults: '250', ...(pageToken ? {pageToken} : {})});
        const list = await calendarApi(account, 'GET', `/calendars/primary/events?${params}`);
        items.push(...(list.items ?? []));
        pageToken = list.nextPageToken;
    } while (pageToken);
    return items.filter((e: any) => String(e.summary ?? '').includes(text));
}

/**
 * Real lane, start of run: deletes `[e2e-` events created more than `olderThanMs` ago, left behind
 * by a run that crashed before its cleanup. Newer ones may belong to a run still in progress.
 */
export async function sweepStaleEvents(account: GoogleAccount, olderThanMs = 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const stale = (await findEvents(account, '[e2e-')).filter((e) => e.summary.startsWith('[e2e-') && Date.parse(e.created) < cutoff);
    for (const event of stale) {
        await deleteEvent(account, event.id);
    }
    return stale.length;
}

/**
 * Waits until the account's calendar has an event whose summary contains `text` (Google's search
 * can lag behind an insert), tracks it for cleanup, and returns it. For events the plugin created.
 */
export async function waitForEvent(account: GoogleAccount, text: string): Promise<FixtureEvent & Record<string, any>> {
    let found: Array<FixtureEvent & Record<string, any>> = [];
    await expect.poll(async () => {
        found = await findEvents(account, text);
        return found.length;
    }, {message: `an event matching "${text}" on ${account.email}`, timeout: 30_000}).toBeGreaterThan(0);
    for (const event of found) {
        trackEvent(account, event.id);
    }
    return found[0];
}
