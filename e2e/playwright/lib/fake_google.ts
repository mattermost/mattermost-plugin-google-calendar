// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Client for the fake Google's /__control API (fake-google/server.ts). The fake runs in the compose
// stack (docker-compose.yml, profile `fake`); Mattermost reaches it on Google's hostnames.

export type FakeGoogleUser = {
    key: 'owner' | 'collab';
    email: string;
    displayName: string;
    resourceName: string;
    refreshToken: string;
    timeZone: string;
};

export type FakeGoogleAccounts = {clientId: string; clientSecret: string; users: FakeGoogleUser[]};

export type FakeRequest = {
    method: string;
    host: string;
    path: string;
    query: Record<string, string | string[]>;
    status: number;
    user?: string;
    methodId?: string;
    grant?: string;
    body?: any;
};

export type FakeEventDateTime = {dateTime?: string; date?: string; timeZone?: string};

export type FakeEventInput = {
    summary: string;
    start: FakeEventDateTime;
    end: FakeEventDateTime;
    description?: string;
    location?: string;
    attendees?: Array<{email: string; responseStatus?: string}>;
    recurrence?: string[];
    hangoutLink?: string;
    transparency?: 'opaque' | 'transparent';
};

export type FakeEvent = FakeEventInput & {id: string; iCalUID: string; status: string; organizer: {email: string}};

async function control<T>(method: string, route: string, body?: unknown): Promise<T> {
    const response = await fetch(`${process.env.FAKE_GOOGLE_URL}/__control/${route}`, {
        method,
        headers: {'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Fake Google ${method} ${route} failed: ${response.status} ${await response.text()}`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
}

const user = (who: string) => `users/${encodeURIComponent(who)}`;

export const fakeGoogle = {
    health: () => control<{ok: boolean}>('GET', 'health'),
    reset: () => control('POST', 'reset'),
    accounts: () => control<FakeGoogleAccounts>('GET', 'accounts'),
    /** accessTokenTtlSeconds: lifetime of tokens issued from now on; timeZones: calendar time zone per user key or email. */
    configure: (config: {accessTokenTtlSeconds?: number; timeZones?: Record<string, string>}) => control('POST', 'config', config),
    violations: async () => (await control<{value: string[]}>('GET', 'violations')).value,
    requests: async () => (await control<{value: FakeRequest[]}>('GET', 'requests')).value,
    clearRequests: () => control('DELETE', 'requests'),
    /** Revokes every refresh token (all users, or one user key or email), like removing the app's access in the Google account. */
    revokeRefreshTokens: (who?: string) => control('POST', 'tokens/revoke', who ? {user: who} : {}),
    /** Refresh tokens issued by consents and mintRefreshToken (user key, scopes, revoked), oldest first. */
    refreshTokens: async () => (await control<{value: Array<{token: string; user: string; scope: string; revoked: boolean}>}>('GET', 'tokens')).value,
    /** Revokes one refresh token, like Google's revoke endpoint. */
    revokeRefreshToken: (token: string) => control('POST', 'tokens/revoke', {token}),
    /** A new refresh token for a user key or email, as if they had just consented (default: the plugin's scopes). */
    mintRefreshToken: async (who: string, scope?: string) => (await control<{refreshToken: string}>('POST', 'tokens/mint', {user: who, ...(scope ? {scope} : {})})).refreshToken,
    failNext: (method: string, status = 403, reason = 'rateLimitExceeded', times = 1) => control('POST', 'failures', {method, status, reason, times}),
    channels: async () => (await control<{value: unknown[]}>('GET', 'channels')).value,

    createEvent: (who: string, event: FakeEventInput) => control<FakeEvent>('POST', `${user(who)}/events`, event),
    events: async (who: string) => (await control<{value: FakeEvent[]}>('GET', `${user(who)}/events`)).value,
    updateEvent: (who: string, id: string, patch: Partial<FakeEventInput>) => control<FakeEvent>('PATCH', `${user(who)}/events/${encodeURIComponent(id)}`, patch),
    deleteEvent: (who: string, id: string) => control('DELETE', `${user(who)}/events/${encodeURIComponent(id)}`),
};

/** Plugin traffic to the fake's OAuth token endpoint, optionally only one grant type. */
export async function tokenRequests(grant?: 'authorization_code' | 'refresh_token'): Promise<FakeRequest[]> {
    return (await fakeGoogle.requests()).filter((r) => r.path === '/token' && (!grant || r.grant === grant));
}
