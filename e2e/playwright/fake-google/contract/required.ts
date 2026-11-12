// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Hand-written contracts for what Discovery cannot express.
//
// Discovery never marks response fields as required, so a fake that leaves out a field the plugin
// reads would still pass the schema. These lists name those fields, per method. Each path uses
// `[]` to mean "every element". Call sites are in this repo's gcal/ package and in the
// mattermost-plugin-mscalendar engine (v1.7.0) it runs on.
//
// The OAuth token endpoint has no Discovery document; its shape is modelled on RFC 6749 and
// Google's OAuth 2.0 web-server guide, and checked against the real service only by the real lane.

type Rule = {when: (query: URLSearchParams) => boolean; paths: string[]; why: string};

const always = () => true;

// convertGCalEventToRemoteEvent (gcal/views.go) dereferences organizer, start and end without nil
// checks, so an event without them panics the plugin. GetDefaultCalendarView drops events without
// an iCalUID.
const EVENT_FIELDS = ['id', 'iCalUID', 'start', 'end', 'organizer.email'];

export const REQUIRED_RESPONSE_FIELDS: Record<string, Rule[]> = {
    'people.people.get': [{when: always, paths: ['resourceName', 'emailAddresses[].value'], why: 'remote user ID and mail (gcal/user.go GetMe)'}],
    'calendar.settings.get': [{when: always, paths: ['value'], why: 'user time zone (gcal/mailbox.go GetMailboxSettings)'}],
    'calendar.calendars.get': [{when: always, paths: ['id', 'summary'], why: 'showcals (gcal/calendar.go GetDefaultCalendar)'}],
    'calendar.events.list': [{
        when: always,
        paths: ['items', ...EVENT_FIELDS.map((p) => `items[].${p}`)],
        why: 'agenda, summary, sidebar, availability (gcal/event.go, gcal/views.go)',
    }],
    'calendar.events.insert': [{when: always, paths: EVENT_FIELDS, why: 'create event reply (gcal/event.go CreateEvent)'}],
    'calendar.events.get': [{when: always, paths: EVENT_FIELDS, why: 'notification path (gcal/notifications.go)'}],
    'calendar.events.watch': [{when: always, paths: ['id', 'resourceId', 'expiration'], why: 'stored subscription (gcal/subscription.go)'}],
};

/** RFC 6749 token response fields. refresh_token only when Google showed the consent screen. */
export function tokenResponseFields(grantType: string, consented: boolean): string[] {
    const fields = ['access_token', 'token_type', 'expires_in', 'scope'];
    return grantType === 'authorization_code' && consented ? [...fields, 'refresh_token'] : fields;
}

/** Paths in `paths` that are missing or null in `value`. `[]` checks every element of an array. */
export function missingPaths(value: unknown, paths: string[]): string[] {
    return paths.filter((p) => !present(value, p.split('.')));
}

function present(value: unknown, parts: string[]): boolean {
    if (parts.length === 0) {
        return value !== undefined && value !== null;
    }
    const [head, ...rest] = parts;
    const isArray = head.endsWith('[]');
    const key = isArray ? head.slice(0, -2) : head;
    if (value === null || typeof value !== 'object' || !(key in value)) {
        return false;
    }
    const child = (value as Record<string, unknown>)[key];
    if (!isArray) {
        return present(child, rest);
    }
    return Array.isArray(child) && child.every((item) => present(item, rest));
}
