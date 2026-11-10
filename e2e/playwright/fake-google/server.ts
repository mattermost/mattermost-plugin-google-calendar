// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A small fake of the Google APIs the Google Calendar plugin calls: OAuth (accounts.google.com
// consent and oauth2.googleapis.com/token), Calendar v3 and People v1.
//
// It listens on HTTPS 443 for Mattermost, which reaches it through Docker network aliases for
// Google's real hostnames and trusts its throwaway CA through SSL_CERT_FILE, so the plugin bundle
// under test is the normal production build. The tests reach the same routes on plain HTTP 8080,
// along with a /__control API for test setup and assertions. The browser reaches the consent pages
// as https://accounts.google.com through Chromium's --host-resolver-rules (e2e/playwright/lib/browser.ts).
//
// Every request it receives and every response it sends is checked against the contract in
// contract/ (Google's published Discovery documents plus the fields the plugin reads). Requests
// to operations outside the contract, and Calendar/People calls on the wrong host, are recorded as
// violations too. Global teardown fails the run if there are any.
//
// Adapted from the Google Drive plugin suite's fake (mattermost-plugin-google-drive e2e/playwright/fake-google).
// Google behaviour reproduced from the API reference, not yet checked against a live account (the
// real lane does that):
// - Inserting an event with attendees adds the organizer to attendees and puts a copy with the
//   same id on each attendee's calendar (spike Q4 in the implementation plan).
// - A refresh token is only returned when the consent screen was shown (prompt=consent or first
//   grant); the plugin always forces it.
// - events.watch needs an HTTPS address and a channel id of at most 64 characters from
//   [A-Za-z0-9-_+/=].

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

import {missingPaths, tokenResponseFields} from './contract/required.ts';
import {ContractValidator} from './contract/validator.ts';
import type {MethodMatch} from './contract/validator.ts';

type Json = Record<string, any>;
type Result = {status: number; body?: unknown; headers?: Record<string, string>; html?: string};

const HTTP_PORT = Number(process.env.FAKE_HTTP_PORT || 8080);
const HTTPS_PORT = Number(process.env.FAKE_HTTPS_PORT || 443);
const CERT_DIR = process.env.FAKE_CERT_DIR || '/certs';

const CLIENT_ID = 'fake-gcal-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'fake-gcal-client-secret';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3599;
const DEFAULT_TIME_ZONE = 'UTC';

/** Which host serves each API (Discovery rootUrl). Requests over TLS must use it. */
const API_HOSTS: Record<string, string> = {calendar_v3: 'www.googleapis.com', people_v1: 'people.googleapis.com'};

const USERS = [
    {key: 'owner', email: 'owner@fake-google.test', givenName: 'Calendar', familyName: 'Owner', personId: '100000000000000000001', refreshToken: 'fake-refresh-owner'},
    {key: 'collab', email: 'collab@fake-google.test', givenName: 'Calendar', familyName: 'Collaborator', personId: '100000000000000000002', refreshToken: 'fake-refresh-collab'},
] as const;
type User = typeof USERS[number];

const displayName = (u: User) => `${u.givenName} ${u.familyName}`;
const resourceName = (u: User) => `people/${u.personId}`;

type EventRecord = Json & {id: string; start: Json; end: Json};
type Channel = {id: string; token?: string; address: string; resourceId: string; expiration: string; user: string; stopped: boolean};
type Failure = {method: string; status: number; reason: string; remaining: number};
type LoggedRequest = {
    method: string;
    host: string;
    path: string;
    query: Record<string, string | string[]>;
    status: number;
    user?: string;
    methodId?: string;
    grant?: string;
    body?: unknown;
};

const contract = new ContractValidator();

const state = {
    config: {accessTokenTtlSeconds: DEFAULT_ACCESS_TOKEN_TTL_SECONDS},
    timeZones: new Map<string, string>(),
    /** Events per calendar owner (user key), in insertion order. */
    calendars: new Map<string, Map<string, EventRecord>>(),
    channels: new Map<string, Channel>(),
    codes: new Map<string, {user: string; scope: string; redirectUri: string; consented: boolean}>(),
    accessTokens: new Map<string, {user: string; scope: string; expiresAt: number}>(),
    /** Users who granted the client access at least once (Google skips consent next time unless prompt=consent). */
    grants: new Set<string>(),
    revokedRefreshTokens: new Set<string>(),
    pendingConsent: new Map<string, URLSearchParams>(),
    failures: [] as Failure[],
    requests: [] as LoggedRequest[],
    violations: [] as string[],
};

function reset() {
    state.config = {accessTokenTtlSeconds: DEFAULT_ACCESS_TOKEN_TTL_SECONDS};
    state.timeZones.clear();
    state.calendars = new Map(USERS.map((u) => [u.key, new Map()]));
    state.channels.clear();
    state.codes.clear();
    state.accessTokens.clear();
    state.grants.clear();
    state.revokedRefreshTokens.clear();
    state.pendingConsent.clear();
    state.failures = [];
    state.requests = [];
    state.violations = [];
}
reset();

const now = () => new Date().toISOString();
const randomId = (length = 26) => crypto.randomBytes(length).toString('hex').slice(0, length);
// Google event ids use base32hex: lowercase a-v and digits.
const eventId = () => Array.from(crypto.randomBytes(26), (b) => '0123456789abcdefghijklmnopqrstuv'[b % 32]).join('');
const userByKey = (key: string) => USERS.find((u) => u.key === key) as User;
const userByEmail = (email: string) => USERS.find((u) => u.email === email.toLowerCase());
const userByKeyOrEmail = (id: string) => USERS.find((u) => u.key === id || u.email === id.toLowerCase());
const timeZoneOf = (u: User) => state.timeZones.get(u.key) ?? DEFAULT_TIME_ZONE;
const calendarOf = (u: User) => state.calendars.get(u.key)!;
const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c] as string));
const etag = () => `"${Date.now()}${crypto.randomInt(1000, 9999)}"`;

function violation(message: string) {
    state.violations.push(message);
    console.warn(`CONTRACT VIOLATION: ${message}`);
}

// ---------------------------------------------------------------------------------------------
// Errors in Google's two formats: Calendar's (errors[].reason) and People's (status).

function calendarError(status: number, reason: string, message: string): Result {
    return {status, body: {error: {errors: [{domain: 'global', reason, message}], code: status, message}}};
}

function peopleError(status: number, grpcStatus: string, message: string): Result {
    return {status, body: {error: {code: status, message, status: grpcStatus}}};
}

function unauthenticated(): Result {
    const message = 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.';
    return {status: 401, body: {error: {code: 401, message, errors: [{message: 'Invalid Credentials', domain: 'global', reason: 'authError', location: 'Authorization', locationType: 'header'}], status: 'UNAUTHENTICATED'}}};
}

// ---------------------------------------------------------------------------------------------
// OAuth: consent pages (browser, accounts.google.com) and token endpoint (oauth2.googleapis.com).

const allowedRedirect = (uri: string) => /^http:\/\/localhost:\d+\/plugins\/[^/]+\/oauth2\/complete$/.test(uri);

function authorize(query: URLSearchParams): Result {
    if (query.get('client_id') !== CLIENT_ID) {
        return errorPage(401, 'Error 401: invalid_client', 'The OAuth client was not found.');
    }
    const redirectUri = query.get('redirect_uri') ?? '';
    if (!allowedRedirect(redirectUri)) {
        return errorPage(400, 'Error 400: redirect_uri_mismatch', `${redirectUri} is not a registered redirect URI.`);
    }
    if (query.get('response_type') !== 'code') {
        return errorPage(400, 'Error 400: unsupported_response_type', 'Only response_type=code is supported.');
    }
    if (!query.get('scope')) {
        return errorPage(400, 'Error 400: invalid_request', 'Missing required parameter: scope');
    }
    const sid = randomId(16);
    state.pendingConsent.set(sid, query);
    const accounts = USERS.map((u) => `<button type="submit" name="account" value="${u.key}">${html(displayName(u))} (${html(u.email)})</button>`).join('');
    return page('Choose an account', `<h1>Choose an account</h1><p>to continue to Mattermost Google Calendar (fake)</p>
        <form method="post" action="/o/oauth2/consent"><input type="hidden" name="sid" value="${sid}">${accounts}</form>`);
}

function consent(form: URLSearchParams): Result {
    const sid = form.get('sid') ?? '';
    const query = state.pendingConsent.get(sid);
    if (!query) {
        return errorPage(400, 'Error 400: invalid_request', 'The sign-in session expired.');
    }
    const account = form.get('account');
    const forced = query.get('prompt') === 'consent';
    const needsConsent = account && (forced || !state.grants.has(account));
    if (account && needsConsent && !form.get('decision')) {
        const scopes = (query.get('scope') ?? '').split(' ').map((s) => `<li>${html(s)}</li>`).join('');
        return page('Grant access', `<h1>Mattermost Google Calendar wants access to your Google Account</h1><p>${html(userByKey(account).email)}</p><ul>${scopes}</ul>
            <form method="post" action="/o/oauth2/consent"><input type="hidden" name="sid" value="${sid}"><input type="hidden" name="account" value="${html(account)}">
            <button type="submit" name="decision" value="deny">Cancel</button><button type="submit" name="decision" value="allow">Allow</button></form>`);
    }
    state.pendingConsent.delete(sid);
    const redirect = new URL(query.get('redirect_uri')!);
    if (!account || (needsConsent && form.get('decision') !== 'allow')) {
        redirect.searchParams.set('error', 'access_denied');
    } else {
        state.grants.add(account);
        const code = `4/fake-${randomId(40)}`;
        state.codes.set(code, {user: account, scope: query.get('scope') ?? '', redirectUri: query.get('redirect_uri')!, consented: Boolean(needsConsent)});
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('scope', query.get('scope') ?? '');
    }
    if (query.get('state') !== null) {
        redirect.searchParams.set('state', query.get('state')!);
    }
    return {status: 302, headers: {location: redirect.toString()}};
}

function page(title: string, body: string): Result {
    return {status: 200, html: `<!doctype html><html><head><meta charset="utf-8"><title>${html(title)} - Fake Google</title></head><body>${body}</body></html>`};
}

function errorPage(status: number, title: string, message: string): Result {
    return {status, html: `<!doctype html><html><head><title>${html(title)}</title></head><body><h1>${html(title)}</h1><p>${html(message)}</p></body></html>`};
}

function tokenEndpoint(form: URLSearchParams, authorization: string, log: LoggedRequest): Result {
    let clientId = form.get('client_id');
    let clientSecret = form.get('client_secret');
    if (authorization.startsWith('Basic ')) {
        const [id, secret] = Buffer.from(authorization.slice(6), 'base64').toString().split(':').map(decodeURIComponent);
        clientId = id;
        clientSecret = secret;
    }
    const grantType = form.get('grant_type') ?? '';
    log.grant = grantType;
    if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
        return {status: 401, body: {error: 'invalid_client', error_description: 'The OAuth client was not found.'}};
    }

    let user: string;
    let scope: string;
    let refreshToken: string | undefined;
    if (grantType === 'authorization_code') {
        const code = state.codes.get(form.get('code') ?? '');
        state.codes.delete(form.get('code') ?? '');
        if (!code || code.redirectUri !== form.get('redirect_uri')) {
            return {status: 400, body: {error: 'invalid_grant', error_description: 'Bad Request'}};
        }
        user = code.user;
        scope = code.scope;
        if (code.consented) {
            refreshToken = userByKey(user).refreshToken;
            state.revokedRefreshTokens.delete(refreshToken);
        }
    } else if (grantType === 'refresh_token') {
        const found = USERS.find((u) => u.refreshToken === form.get('refresh_token'));
        if (!found || state.revokedRefreshTokens.has(found.refreshToken)) {
            return {status: 400, body: {error: 'invalid_grant', error_description: 'Token has been expired or revoked.'}};
        }
        user = found.key;
        scope = GRANTED_SCOPES;
    } else {
        return {status: 400, body: {error: 'unsupported_grant_type', error_description: `Invalid grant_type: ${grantType}`}};
    }

    const ttl = state.config.accessTokenTtlSeconds;
    const accessToken = `ya29.fake-${randomId(60)}`;
    state.accessTokens.set(accessToken, {user, scope, expiresAt: Date.now() + ttl * 1000});
    const body = {
        access_token: accessToken,
        expires_in: ttl,
        ...(refreshToken ? {refresh_token: refreshToken} : {}),
        scope,
        token_type: 'Bearer',
    };
    for (const missing of missingPaths(body, tokenResponseFields(grantType, Boolean(refreshToken)))) {
        violation(`token response (${grantType}): missing ${missing}`);
    }
    return {status: 200, body};
}

// What Google echoes for a refresh: the scopes granted at consent (gcal/remote.go NewOAuth2Config).
const GRANTED_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.settings.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

function authenticate(authorization: string): User | null {
    const token = state.accessTokens.get(authorization.replace(/^Bearer /, ''));
    return token && token.expiresAt > Date.now() ? userByKey(token.user) : null;
}

// ---------------------------------------------------------------------------------------------
// Time: RFC 3339 instants and all-day dates, which Google anchors at midnight in the calendar's
// time zone.

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validTimeZone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', {timeZone: tz});
        return true;
    } catch {
        return false;
    }
}

function tzOffsetMs(utcMs: number, tz: string): number {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(utcMs / 1000) * 1000;
}

function zonedMidnight(date: string, tz: string): number {
    const guess = Date.parse(`${date}T00:00:00Z`);
    const first = guess - tzOffsetMs(guess, tz);
    return guess - tzOffsetMs(first, tz);
}

/**
 * Google stores a dateTime given without an offset (allowed when timeZone is set) as that wall-clock
 * time in timeZone, and always returns dateTime as RFC 3339 with the zone's offset.
 */
function normalizeDateTime(dt: Json): Json {
    if (!dt?.dateTime || RFC3339.test(dt.dateTime) || !dt.timeZone) {
        return dt;
    }
    const wall = Date.parse(`${dt.dateTime}Z`);
    const utc = wall - tzOffsetMs(wall - tzOffsetMs(wall, dt.timeZone), dt.timeZone);
    const offsetMinutes = Math.round(tzOffsetMs(utc, dt.timeZone) / 60_000);
    const sign = offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    return {...dt, dateTime: `${dt.dateTime.slice(0, 19)}${offset}`};
}

function instant(dt: Json, tz: string): number {
    return dt.date ? zonedMidnight(dt.date, dt.timeZone ?? tz) : Date.parse(dt.dateTime);
}

/** Problems with an event's start/end as Google reports them (400 Bad Request). */
function checkTimes(event: Json): string | null {
    for (const key of ['start', 'end'] as const) {
        const dt = event[key];
        if (!dt || (!dt.date && !dt.dateTime)) {
            return `Missing ${key} time.`;
        }
        if (dt.date && !DATE.test(dt.date)) {
            return `Invalid ${key} date.`;
        }
        if (dt.dateTime && !RFC3339.test(dt.dateTime) && !dt.timeZone) {
            return `Invalid ${key} time: a time zone offset is required unless timeZone is set.`;
        }
        if (dt.timeZone && !validTimeZone(dt.timeZone)) {
            return `Invalid time zone definition for ${key} time.`;
        }
    }
    if (Boolean(event.start.date) !== Boolean(event.end.date)) {
        return 'Start and end times must either both be date or both be dateTime.';
    }
    if (instant(event.end, 'UTC') < instant(event.start, 'UTC')) {
        return 'The specified time range is empty.';
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Recurrence: enough of RFC 5545 RRULE for fixtures (FREQ=DAILY|WEEKLY, INTERVAL, COUNT, UNTIL).

const MAX_INSTANCES = 730;

function parseRRule(recurrence: unknown): {freq: 'DAILY' | 'WEEKLY'; interval: number; count?: number; until?: number} | string {
    if (!Array.isArray(recurrence) || recurrence.length !== 1 || typeof recurrence[0] !== 'string' || !recurrence[0].startsWith('RRULE:')) {
        return 'the fake supports exactly one RRULE line';
    }
    const parts = Object.fromEntries(recurrence[0].slice(6).split(';').map((p: string) => p.split('=')));
    if (parts.FREQ !== 'DAILY' && parts.FREQ !== 'WEEKLY') {
        return `unsupported FREQ ${parts.FREQ}`;
    }
    for (const key of Object.keys(parts)) {
        if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL'].includes(key)) {
            return `unsupported RRULE part ${key}`;
        }
    }
    const until = parts.UNTIL ? Date.parse(parts.UNTIL.replace(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/, (_: string, y: string, mo: string, d: string, h = '23', mi = '59', s = '59') => `${y}-${mo}-${d}T${h}:${mi}:${s}Z`)) : undefined;
    return {freq: parts.FREQ, interval: Number(parts.INTERVAL ?? 1), count: parts.COUNT ? Number(parts.COUNT) : undefined, until};
}

function shiftDateTime(dt: Json, days: number): Json {
    if (dt.date) {
        const d = new Date(`${dt.date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return {...dt, date: d.toISOString().slice(0, 10)};
    }
    // Keep the original offset notation; Date math in UTC is exact for fixed offsets.
    const ms = Date.parse(dt.dateTime) + days * 86_400_000;
    return {...dt, dateTime: new Date(ms).toISOString().replace('.000Z', 'Z')};
}

function instanceSuffix(dt: Json): string {
    return dt.date ? dt.date.replace(/-/g, '') : new Date(Date.parse(dt.dateTime)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function expand(event: EventRecord): EventRecord[] {
    if (!event.recurrence) {
        return [event];
    }
    const rule = parseRRule(event.recurrence);
    if (typeof rule === 'string') {
        return [event];
    }
    const step = (rule.freq === 'DAILY' ? 1 : 7) * rule.interval;
    const out: EventRecord[] = [];
    for (let i = 0; out.length < (rule.count ?? MAX_INSTANCES) && i < MAX_INSTANCES; i++) {
        const start = shiftDateTime(event.start, i * step);
        if (rule.until !== undefined && instant(start, 'UTC') > rule.until) {
            break;
        }
        const {recurrence: _, ...rest} = event;
        out.push({
            ...rest,
            id: `${event.id}_${instanceSuffix(start)}`,
            recurringEventId: event.id,
            originalStartTime: start,
            start,
            end: shiftDateTime(event.end, i * step),
        });
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Calendar resources as a given user sees them.

function renderEvent(event: EventRecord, viewer: User): Json {
    const out: Json = {...event};
    for (const key of ['creator', 'organizer'] as const) {
        if (out[key]) {
            out[key] = {...out[key], ...(out[key].email === viewer.email ? {self: true} : {})};
        }
    }
    if (out.attendees) {
        out.attendees = out.attendees.map((a: Json) => ({...a, ...(a.email === viewer.email ? {self: true} : {})}));
    }
    return out;
}

/**
 * Builds a stored event from an insert body (or a control-API fixture), as Google fills it in.
 * Returns an error message for bodies Google rejects.
 */
function newEvent(organizer: User, body: Json, fixture: Json = {}): EventRecord | string {
    const problem = checkTimes(body);
    if (problem) {
        return problem;
    }
    if (body.recurrence) {
        const rule = parseRRule(body.recurrence);
        if (typeof rule === 'string') {
            return `Invalid recurrence rule (${rule}).`;
        }
    }
    const id = eventId();
    const created = now();
    const attendees = (body.attendees ?? []).map((a: Json) => ({
        email: String(a.email ?? '').toLowerCase(),
        ...(a.displayName ? {displayName: a.displayName} : {}),
        ...(a.optional ? {optional: true} : {}),
        responseStatus: a.responseStatus ?? 'needsAction',
    }));
    if (attendees.some((a: Json) => !a.email)) {
        return 'Missing attendee email.';
    }
    if (attendees.length > 0 && !attendees.some((a: Json) => a.email === organizer.email)) {
        attendees.unshift({email: organizer.email, organizer: true, responseStatus: 'accepted'});
    }
    return {
        kind: 'calendar#event',
        etag: etag(),
        id,
        status: body.status ?? 'confirmed',
        htmlLink: `https://www.google.com/calendar/event?eid=${Buffer.from(`${id} ${organizer.email}`).toString('base64url')}`,
        created,
        updated: created,
        ...(body.summary === undefined ? {} : {summary: body.summary}),
        ...(body.description ? {description: body.description} : {}),
        ...(body.location ? {location: body.location} : {}),
        ...(body.transparency ? {transparency: body.transparency} : {}),
        creator: {email: organizer.email},
        organizer: {email: organizer.email},
        start: normalizeDateTime(body.start),
        end: normalizeDateTime(body.end),
        ...(body.recurrence ? {recurrence: body.recurrence} : {}),
        iCalUID: `${id}@google.com`,
        sequence: 0,
        ...(attendees.length ? {attendees} : {}),
        ...(fixture.hangoutLink ? {hangoutLink: fixture.hangoutLink} : {}),
        reminders: {useDefault: true},
        eventType: body.eventType ?? 'default',
    };
}

/** Stores the event on the organizer's calendar and a copy on each fake attendee's calendar. */
function storeEvent(organizer: User, event: EventRecord) {
    calendarOf(organizer).set(event.id, event);
    for (const attendee of event.attendees ?? []) {
        const guest = userByEmail(attendee.email);
        if (guest && guest.key !== organizer.key) {
            calendarOf(guest).set(event.id, {...event});
        }
    }
}

function findEvent(user: User, id: string): EventRecord | undefined {
    const direct = calendarOf(user).get(id);
    if (direct) {
        return direct;
    }
    const master = calendarOf(user).get(id.replace(/_[0-9TZ]+$/, ''));
    return master ? expand(master).find((e) => e.id === id) : undefined;
}

function calendarResource(user: User): Json {
    return {
        kind: 'calendar#calendar',
        etag: etag(),
        id: user.email,
        summary: user.email,
        timeZone: timeZoneOf(user),
        conferenceProperties: {allowedConferenceSolutionTypes: ['hangoutsMeet']},
    };
}

function resolveCalendar(id: string, user: User): User | null {
    return id === 'primary' || id.toLowerCase() === user.email ? user : null;
}

// ---------------------------------------------------------------------------------------------
// events.list: time range, recurring-event expansion, ordering and paging.

const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 2500;

function listEvents(user: User, query: URLSearchParams): Result {
    const tz = timeZoneOf(user);
    const singleEvents = query.get('singleEvents') === 'true';
    const orderBy = query.get('orderBy');
    if (orderBy === 'startTime' && !singleEvents) {
        return calendarError(400, 'badRequest', 'The requested ordering is not available for the particular query.');
    }
    const bounds: Record<string, number | undefined> = {};
    for (const key of ['timeMin', 'timeMax'] as const) {
        const value = query.get(key);
        if (value !== null && !RFC3339.test(value)) {
            return calendarError(400, 'badRequest', 'Bad Request');
        }
        bounds[key] = value === null ? undefined : Date.parse(value);
    }
    const maxResults = Math.min(Number(query.get('maxResults') ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    if (!Number.isInteger(maxResults) || maxResults < 1) {
        return calendarError(400, 'invalid', 'Invalid value for: maxResults');
    }
    let offset = 0;
    const pageToken = query.get('pageToken');
    if (pageToken) {
        const decoded = /^p(\d+)$/.exec(Buffer.from(pageToken, 'base64url').toString());
        if (!decoded) {
            return calendarError(400, 'invalid', 'Invalid page token value.');
        }
        offset = Number(decoded[1]);
    }
    const eventTypes = query.getAll('eventTypes');
    const showDeleted = query.get('showDeleted') === 'true';

    let items = [...calendarOf(user).values()].flatMap((e) => (singleEvents ? expand(e) : [e]));
    items = items.filter((e) => {
        if (!showDeleted && e.status === 'cancelled') {
            return false;
        }
        if (eventTypes.length && !eventTypes.includes(e.eventType ?? 'default')) {
            return false;
        }
        // A recurring master without expansion matches if any instance does.
        const instances = e.recurrence && !singleEvents ? expand(e) : [e];
        return instances.some((i) => (bounds.timeMax === undefined || instant(i.start, tz) < bounds.timeMax) &&
            (bounds.timeMin === undefined || instant(i.end, tz) > bounds.timeMin));
    });
    if (orderBy === 'startTime') {
        items.sort((a, b) => instant(a.start, tz) - instant(b.start, tz) || a.id.localeCompare(b.id));
    } else if (orderBy === 'updated') {
        items.sort((a, b) => Date.parse(a.updated) - Date.parse(b.updated));
    }

    const pageItems = items.slice(offset, offset + maxResults);
    const next = offset + maxResults < items.length ? Buffer.from(`p${offset + maxResults}`).toString('base64url') : undefined;
    const updated = items.reduce((max, e) => (e.updated > max ? e.updated : max), '1970-01-01T00:00:00.000Z');
    return {
        status: 200,
        body: {
            kind: 'calendar#events',
            etag: etag(),
            summary: user.email,
            updated,
            timeZone: query.get('timeZone') ?? tz,
            accessRole: 'owner',
            defaultReminders: [{method: 'popup', minutes: 10}],
            ...(next ? {nextPageToken: next} : {}),
            items: pageItems.map((e) => renderEvent(e, user)),
        },
    };
}

// ---------------------------------------------------------------------------------------------
// API routes. `match` is the documented method the request was matched to.

const CHANNEL_ID = /^[A-Za-z0-9\-_+/=]{1,64}$/;

function route(match: MethodMatch, user: User, query: URLSearchParams, body: Json | undefined): Result {
    const p = match.pathParams;
    switch (match.id) {
    case 'people.people.get': {
        if (p.peopleId !== 'me' && p.peopleId !== user.personId) {
            return peopleError(404, 'NOT_FOUND', 'Requested entity was not found.');
        }
        const fields = (query.get('personFields') ?? '').split(',').filter(Boolean);
        if (fields.length === 0) {
            return peopleError(400, 'INVALID_ARGUMENT', 'personFields mask is required. Please specify one or more valid paths. Valid paths are documented at https://developers.google.com/people/api/rest/v1/people/get.');
        }
        const source = {type: 'PROFILE', id: user.personId};
        const person: Json = {resourceName: resourceName(user), etag: `%${randomId(20)}`};
        if (fields.includes('names')) {
            person.names = [{
                metadata: {primary: true, source},
                displayName: displayName(user),
                familyName: user.familyName,
                givenName: user.givenName,
                displayNameLastFirst: `${user.familyName}, ${user.givenName}`,
                unstructuredName: displayName(user),
            }];
        }
        if (fields.includes('emailAddresses')) {
            person.emailAddresses = [{metadata: {primary: true, verified: true, source: {type: 'ACCOUNT', id: user.personId}}, value: user.email}];
        }
        return {status: 200, body: person};
    }
    case 'calendar.settings.get': {
        const settings: Record<string, string> = {timezone: timeZoneOf(user), locale: 'en', format24HourTime: 'false', weekStart: '0'};
        if (!(p.setting in settings)) {
            return calendarError(404, 'notFound', 'Not Found');
        }
        return {status: 200, body: {kind: 'calendar#setting', etag: etag(), id: p.setting, value: settings[p.setting]}};
    }
    case 'calendar.calendars.get': {
        const owner = resolveCalendar(p.calendarId, user);
        return owner ? {status: 200, body: calendarResource(owner)} : calendarError(404, 'notFound', 'Not Found');
    }
    case 'calendar.events.list': {
        const owner = resolveCalendar(p.calendarId, user);
        return owner ? listEvents(owner, query) : calendarError(404, 'notFound', 'Not Found');
    }
    case 'calendar.events.get': {
        const owner = resolveCalendar(p.calendarId, user);
        const event = owner && findEvent(owner, p.eventId);
        return event ? {status: 200, body: renderEvent(event, user)} : calendarError(404, 'notFound', 'Not Found');
    }
    case 'calendar.events.insert': {
        const owner = resolveCalendar(p.calendarId, user);
        if (!owner) {
            return calendarError(404, 'notFound', 'Not Found');
        }
        const event = newEvent(owner, body ?? {});
        if (typeof event === 'string') {
            return calendarError(400, 'badRequest', event);
        }
        storeEvent(owner, event);
        return {status: 200, body: renderEvent(event, user)};
    }
    case 'calendar.events.watch': {
        const owner = resolveCalendar(p.calendarId, user);
        if (!owner) {
            return calendarError(404, 'notFound', 'Not Found');
        }
        const channel = body ?? {};
        if (channel.type !== 'web_hook' && channel.type !== 'webhook') {
            return calendarError(400, 'invalidChannelType', `Invalid channel type: ${channel.type}.`);
        }
        if (!String(channel.address ?? '').startsWith('https://')) {
            return calendarError(400, 'push.webhookUrlNotHttps', `WebHook callback must be HTTPS: ${channel.address}`);
        }
        if (!CHANNEL_ID.test(String(channel.id ?? ''))) {
            return calendarError(400, 'invalid', 'Invalid channel id: at most 64 characters from [A-Za-z0-9-_+/=].');
        }
        if (state.channels.has(channel.id)) {
            return calendarError(400, 'channelIdNotUnique', 'Channel id not unique');
        }
        const ttlSeconds = Number(channel.params?.ttl ?? 604800);
        const created: Channel = {
            id: channel.id,
            token: channel.token,
            address: channel.address,
            resourceId: randomId(27),
            expiration: String(Date.now() + ttlSeconds * 1000),
            user: user.key,
            stopped: false,
        };
        state.channels.set(created.id, created);
        return {
            status: 200,
            body: {
                kind: 'api#channel',
                id: created.id,
                resourceId: created.resourceId,
                resourceUri: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(owner.email)}/events?alt=json`,
                ...(created.token ? {token: created.token} : {}),
                expiration: created.expiration,
            },
        };
    }
    case 'calendar.channels.stop': {
        const channel = state.channels.get(body?.id ?? '');
        if (!channel || channel.resourceId !== body?.resourceId || channel.stopped) {
            return calendarError(404, 'notFound', `Channel '${body?.id}' not found for project`);
        }
        channel.stopped = true;
        return {status: 204};
    }
    default:
        violation(`${match.id} is in operations.json but the fake has no route for it`);
        return calendarError(501, 'notImplemented', 'Not implemented by the fake');
    }
}

// ---------------------------------------------------------------------------------------------
// Test control API: setup and assertions that have no Google API equivalent.

function control(method: string, segments: string[], body: Json): Result {
    const [section, id, sub, subId] = segments;
    if (section === 'health') {
        return {status: 200, body: {ok: true}};
    }
    if (section === 'reset' && method === 'POST') {
        reset();
        return {status: 204};
    }
    if (section === 'accounts' && method === 'GET') {
        return {
            status: 200,
            body: {
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                users: USERS.map((u) => ({
                    key: u.key, email: u.email, displayName: displayName(u), resourceName: resourceName(u), refreshToken: u.refreshToken, timeZone: timeZoneOf(u),
                })),
            },
        };
    }
    if (section === 'config' && method === 'POST') {
        if (body.accessTokenTtlSeconds !== undefined) {
            state.config.accessTokenTtlSeconds = Number(body.accessTokenTtlSeconds);
        }
        for (const [key, tz] of Object.entries(body.timeZones ?? {})) {
            const user = userByKeyOrEmail(key);
            if (!user || !validTimeZone(String(tz))) {
                return {status: 400, body: {error: `unknown user ${key} or time zone ${tz}`}};
            }
            state.timeZones.set(user.key, String(tz));
        }
        return {status: 200, body: {...state.config, timeZones: Object.fromEntries(USERS.map((u) => [u.key, timeZoneOf(u)]))}};
    }
    if (section === 'requests') {
        if (method === 'DELETE') {
            state.requests = [];
            return {status: 204};
        }
        return {status: 200, body: {value: state.requests}};
    }
    if (section === 'violations') {
        return {status: 200, body: {value: state.violations}};
    }
    if (section === 'tokens' && id === 'revoke' && method === 'POST') {
        // Revokes refresh tokens (all users, or body.user) and invalidates their access tokens,
        // like a user removing the app at myaccount.google.com/permissions.
        const users = body.user ? [userByKeyOrEmail(body.user)].filter((u): u is User => Boolean(u)) : [...USERS];
        for (const user of users) {
            state.revokedRefreshTokens.add(user.refreshToken);
            state.grants.delete(user.key);
            for (const [token, info] of state.accessTokens) {
                if (info.user === user.key) {
                    state.accessTokens.delete(token);
                }
            }
        }
        return {status: 204};
    }
    if (section === 'failures' && method === 'POST') {
        // Fail the next `times` calls of a method, e.g. {method: 'calendar.events.list', status: 403, reason: 'rateLimitExceeded'}.
        state.failures.push({method: body.method, status: body.status ?? 403, reason: body.reason ?? 'rateLimitExceeded', remaining: body.times ?? 1});
        return {status: 204};
    }
    if (section === 'channels' && method === 'GET') {
        return {status: 200, body: {value: [...state.channels.values()]}};
    }
    if (section === 'users' && id && sub === 'events') {
        const user = userByKeyOrEmail(decodeURIComponent(id));
        if (!user) {
            return {status: 404, body: {error: `unknown user ${id}`}};
        }
        if (method === 'GET' && !subId) {
            return {status: 200, body: {value: [...calendarOf(user).values()].map((e) => renderEvent(e, user))}};
        }
        if (method === 'POST' && !subId) {
            // Fixture events: the same fields as events.insert, plus hangoutLink (Google only sets it
            // through conferenceData, which the plugin never requests).
            const event = newEvent(user, body, body);
            if (typeof event === 'string') {
                return {status: 400, body: {error: event}};
            }
            storeEvent(user, event);
            return {status: 200, body: renderEvent(event, user)};
        }
        const existing = subId ? calendarOf(user).get(decodeURIComponent(subId)) : undefined;
        if (!existing) {
            return {status: 404, body: {error: `unknown event ${subId}`}};
        }
        if (method === 'DELETE') {
            for (const calendar of state.calendars.values()) {
                calendar.delete(existing.id);
            }
            return {status: 204};
        }
        if (method === 'PATCH') {
            const patched = {...existing, ...body, updated: now(), etag: etag(), sequence: existing.sequence + 1};
            patched.start = normalizeDateTime(patched.start);
            patched.end = normalizeDateTime(patched.end);
            const problem = checkTimes(patched);
            if (problem) {
                return {status: 400, body: {error: problem}};
            }
            for (const calendar of state.calendars.values()) {
                if (calendar.has(existing.id)) {
                    calendar.set(existing.id, {...patched});
                }
            }
            return {status: 200, body: renderEvent(patched, user)};
        }
    }
    return {status: 404, body: {error: `unknown control route ${method} /${segments.join('/')}`}};
}

// ---------------------------------------------------------------------------------------------
// HTTP plumbing.

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

function send(res: http.ServerResponse, result: Result) {
    if (result.html !== undefined) {
        res.writeHead(result.status, {'content-type': 'text/html; charset=utf-8', ...result.headers});
        res.end(result.html);
        return;
    }
    if (result.body === undefined) {
        res.writeHead(result.status, result.headers);
        res.end();
        return;
    }
    res.writeHead(result.status, {'content-type': 'application/json; charset=UTF-8', ...result.headers});
    res.end(JSON.stringify(result.body));
}

function loggedQuery(query: URLSearchParams): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    for (const key of new Set(query.keys())) {
        if (key === 'access_token') {
            continue;
        }
        const values = query.getAll(key);
        out[key] = values.length > 1 ? values : values[0];
    }
    return out;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, tls: boolean) {
    const url = new URL(req.url ?? '/', 'http://fake');
    const method = req.method ?? 'GET';
    const host = (req.headers.host ?? '').split(':')[0];
    const raw = await readBody(req);
    const contentType = req.headers['content-type'] ?? '';
    const log: LoggedRequest = {method, host, path: url.pathname, query: loggedQuery(url.searchParams), status: 0};

    let result: Result;
    try {
        if (url.pathname.startsWith('/__control/')) {
            result = control(method, url.pathname.split('/').slice(2), raw.length ? JSON.parse(raw.toString()) : {});
            send(res, result);
            return;
        }
        if (url.pathname === '/o/oauth2/auth' || url.pathname === '/o/oauth2/v2/auth') {
            result = authorize(url.searchParams);
        } else if (url.pathname === '/o/oauth2/consent' && method === 'POST') {
            result = consent(new URLSearchParams(raw.toString()));
        } else if (url.pathname === '/token' && method === 'POST') {
            result = tokenEndpoint(new URLSearchParams(raw.toString()), req.headers.authorization ?? '', log);
        } else if (url.pathname === '/favicon.ico') {
            result = {status: 404};
        } else {
            result = api(method, url, raw, contentType, req.headers.authorization ?? '', log, tls);
        }
    } catch (err) {
        console.error(err);
        violation(`${method} ${url.pathname}: the fake crashed: ${String(err)}`);
        result = calendarError(500, 'backendError', 'Backend Error');
    }
    log.status = result.status;
    state.requests.push(log);
    send(res, result);
}

function api(method: string, url: URL, raw: Buffer, contentType: string, authorization: string, log: LoggedRequest, tls: boolean): Result {
    const match = contract.match(method, url.pathname);
    if (!match) {
        violation(`${method} ${log.host}${url.pathname} is not covered by fake-google/contract/operations.json`);
        return calendarError(404, 'notFound', 'Not Found');
    }
    log.methodId = match.id;
    if (tls && API_HOSTS[match.api] && log.host !== API_HOSTS[match.api]) {
        violation(`${match.id} was called on ${log.host}, but Google serves it on ${API_HOSTS[match.api]}`);
    }

    let body: Json | undefined;
    if (raw.length) {
        if (!contentType.startsWith('application/json')) {
            violation(`${match.id}: request body sent as ${contentType}, not application/json`);
        }
        body = JSON.parse(raw.toString('utf8'));
        log.body = body;
    }

    for (const problem of contract.validateRequest(match, url.searchParams, body)) {
        violation(problem);
    }

    const user = authenticate(authorization);
    if (!user) {
        return unauthenticated();
    }
    log.user = user.key;

    const failure = state.failures.find((f) => f.method === match.id && f.remaining > 0);
    if (failure) {
        failure.remaining--;
        return match.api === 'people_v1'
            ? peopleError(failure.status, failure.status === 429 ? 'RESOURCE_EXHAUSTED' : 'PERMISSION_DENIED', `Injected failure: ${failure.reason}`)
            : calendarError(failure.status, failure.reason, `Injected failure: ${failure.reason}`);
    }

    const result = route(match, user, url.searchParams, body);
    if (result.status !== 204) {
        for (const problem of contract.validateResponse(match, url.searchParams, result.status, result.body)) {
            violation(problem);
        }
    }
    return result;
}

const handler = (tls: boolean) => (req: http.IncomingMessage, res: http.ServerResponse) => {
    handle(req, res, tls).catch((err) => {
        console.error(err);
        res.writeHead(500);
        res.end();
    });
};

const plain = http.createServer(handler(false));
plain.listen(HTTP_PORT, () => console.log(`fake Google on http://0.0.0.0:${(plain.address() as {port: number}).port}`));

const certFile = path.join(CERT_DIR, 'fake.crt');
const keyFile = path.join(CERT_DIR, 'fake.key');
if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    https.createServer({cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile)}, handler(true))
        .listen(HTTPS_PORT, () => console.log(`fake Google on https://0.0.0.0:${HTTPS_PORT}`));
} else {
    console.log(`No certificate in ${CERT_DIR}; HTTPS disabled (fine for running the fake on its own).`);
}
