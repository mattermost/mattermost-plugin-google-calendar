// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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

async function calendarApi(account: GoogleAccount, method: string, path: string, body?: unknown) {
    const response = await fetch(`${googleEndpoints().calendar}${path}`, {
        method,
        headers: {authorization: `Bearer ${await googleAccessToken(account)}`, 'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Calendar API ${method} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? undefined : response.json();
}

/** Puts an event on the account's primary calendar without notifying anyone. */
export async function createFixtureEvent(account: GoogleAccount, event: FakeEventInput): Promise<FixtureEvent> {
    if (googleMode() === 'fake') {
        const created = await fakeGoogle.createEvent(account.email, event);
        return {id: created.id, summary: created.summary};
    }
    const {hangoutLink: _ignored, ...insertable} = event;
    const created = await calendarApi(account, 'POST', '/calendars/primary/events?sendUpdates=none', insertable);
    return {id: created.id, summary: created.summary};
}

/** Events on the account's primary calendar whose summary contains `text`. */
export async function findEvents(account: GoogleAccount, text: string): Promise<Array<FixtureEvent & Record<string, any>>> {
    if (googleMode() === 'fake') {
        return (await fakeGoogle.events(account.email)).filter((e) => e.summary.includes(text));
    }
    const params = new URLSearchParams({q: text, singleEvents: 'true', maxResults: '50'});
    const list = await calendarApi(account, 'GET', `/calendars/primary/events?${params}`);
    return (list.items ?? []).filter((e: any) => String(e.summary ?? '').includes(text));
}

/** Deletes the account's events whose summary contains `text` (real-lane cleanup; the fake resets per run). */
export async function deleteEvents(account: GoogleAccount, text: string) {
    for (const event of await findEvents(account, text)) {
        if (googleMode() === 'fake') {
            await fakeGoogle.deleteEvent(account.email, event.id);
        } else {
            await calendarApi(account, 'DELETE', `/calendars/primary/events/${encodeURIComponent(event.id)}?sendUpdates=none`);
        }
    }
}
