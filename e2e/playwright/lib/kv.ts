// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Direct access to the plugin's rows in PluginKeyValueStore. Mattermost has no REST or mmctl path
// to write another plugin's KV, so tests seed it in Postgres, as mattermost-server's
// specs/functional/system_console/abac/masking/masking_db_setup.ts does.
//
// Key layout of the mscalendar engine v1.7.0 the plugin runs on (calendar/store/store.go):
// - user_<md5(mmUserId)>: the store.User JSON, AES-GCM encrypted (the Google provider sets
//   EncryptedStore), see lib/crypto.ts
// - mmuid_<md5(remoteId)>: the Mattermost user ID, plain
// - userindex_: plain JSON array of {mm_id, mm_username, mm_display_name, remote_id, email}

import {Client} from 'pg';

import {decrypt, encrypt, hashedKey} from './crypto';
import {PLUGIN_ID, TEST_ENCRYPTION_KEY} from './plugin';
import {assertLocalTargets} from './safety';

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
    assertLocalTargets();
    const db = new Client({connectionString: process.env.E2E_DATABASE_URL});
    await db.connect();
    try {
        return await fn(db);
    } finally {
        await db.end();
    }
}

export async function kvGet(key: string): Promise<Buffer | null> {
    return withDb(async (db) => {
        const {rows} = await db.query('SELECT pvalue FROM pluginkeyvaluestore WHERE pluginid = $1 AND pkey = $2', [PLUGIN_ID, key]);
        return rows.length ? (rows[0].pvalue as Buffer) : null;
    });
}

export async function kvSet(key: string, value: Buffer) {
    await withDb((db) =>
        db.query(
            `INSERT INTO pluginkeyvaluestore (pluginid, pkey, pvalue, expireat) VALUES ($1, $2, $3, 0)
             ON CONFLICT (pluginid, pkey) DO UPDATE SET pvalue = EXCLUDED.pvalue, expireat = 0`,
            [PLUGIN_ID, key, value],
        ),
    );
}

const USER_PREFIX = 'user_';
const MMUID_PREFIX = 'mmuid_';
const USER_INDEX_KEY = 'userindex_';

/**
 * Forgets every connected account. The fake Google has fixed accounts, and the engine refuses to
 * connect a Google account that is still mapped to another Mattermost user, so each test starts
 * from no connections (pw.initSetup() gives it new Mattermost users).
 */
export async function resetConnections() {
    await withDb((db) =>
        db.query(
            `DELETE FROM pluginkeyvaluestore WHERE pluginid = $1 AND (pkey LIKE $2 OR pkey LIKE $3 OR pkey = $4)`,
            [PLUGIN_ID, `${USER_PREFIX}%`, `${MMUID_PREFIX}%`, USER_INDEX_KEY],
        ),
    );
}

/** golang.org/x/oauth2 Token JSON. A missing expiry decodes as the zero time, i.e. expired. */
export type OAuth2Token = {
    access_token?: string;
    token_type?: string;
    refresh_token?: string;
    expiry?: string;
};

export type RemoteUser = {id: string; displayName: string; mail: string};

/** The engine's store.User as stored in user_<md5(mmUserId)> (calendar/store/user_store.go). */
export type StoredUser = {
    mattermostSettings?: Record<string, unknown>;
    Remote: RemoteUser;
    OAuth2Token: OAuth2Token | null;
    PluginVersion?: string;
    MattermostUserID: string;
    MattermostUsername: string;
    MattermostDisplayName: string;
    events?: string[] | null;
};

type UserIndexEntry = {mm_id: string; mm_username: string; mm_display_name: string; remote_id: string; email: string};

export type SeedUser = {
    mattermostUser: {id: string; username: string; first_name?: string; last_name?: string};
    remote: RemoteUser;
    token: OAuth2Token;
    timeZone: string;
    /** Overrides for the engine's user settings (store.Settings JSON names), e.g. ReceiveReminders. */
    settings?: Partial<UserSettings>;
};

/**
 * The engine's per-user settings (calendar/store/user_store.go Settings). UpdateStatusFromOptions
 * takes the settings panel's option labels: "Away", "Do Not Disturb" or "Don't set status for me".
 */
export type UserSettings = {
    DailySummary: {post_time: string; tz: string; last_post_time: string; enable: boolean};
    EventSubscriptionID: string;
    UpdateStatusFromOptions: '' | 'Away' | 'Do Not Disturb' | 'Don\'t set status for me';
    GetConfirmation: boolean;
    ReceiveReminders: boolean;
    SetCustomStatus: boolean;
    UpdateStatus: boolean;
    ReceiveNotificationsDuringMeeting: boolean;
};

/**
 * Stores a connected user exactly as the engine's OAuth callback would (engine/oauth2.go
 * CompleteOAuth2: StoreUser and StoreUserInIndex), without the welcome flow DMs.
 */
export async function seedConnectedUser({mattermostUser, remote, token, timeZone, settings}: SeedUser) {
    const displayName = [mattermostUser.first_name, mattermostUser.last_name].filter(Boolean).join(' ') || mattermostUser.username;
    const user: StoredUser = {
        mattermostSettings: {
            DailySummary: {post_time: '8:00AM', tz: timeZone, last_post_time: '', enable: false},
            EventSubscriptionID: '',
            UpdateStatusFromOptions: '',
            GetConfirmation: false,
            ReceiveReminders: false,
            SetCustomStatus: false,
            UpdateStatus: false,
            ReceiveNotificationsDuringMeeting: false,
            ...settings,
        },
        Remote: remote,
        OAuth2Token: token,
        MattermostUserID: mattermostUser.id,
        MattermostUsername: mattermostUser.username,
        MattermostDisplayName: displayName,
        events: null,
    };
    await kvSet(hashedKey(USER_PREFIX, mattermostUser.id), Buffer.from(encrypt(TEST_ENCRYPTION_KEY, JSON.stringify(user)), 'utf8'));
    await kvSet(hashedKey(MMUID_PREFIX, remote.id), Buffer.from(mattermostUser.id, 'utf8'));

    const index = await loadUserIndex();
    const entry: UserIndexEntry = {mm_id: mattermostUser.id, mm_username: mattermostUser.username, mm_display_name: displayName, remote_id: remote.id, email: remote.mail};
    await kvSet(USER_INDEX_KEY, Buffer.from(JSON.stringify([...index.filter((u) => u.mm_id !== mattermostUser.id), entry]), 'utf8'));
}

async function loadUserIndex(): Promise<UserIndexEntry[]> {
    const raw = await kvGet(USER_INDEX_KEY);
    return raw ? JSON.parse(raw.toString('utf8')) ?? [] : [];
}

/** The stored user record, decrypted, or null when the user is not connected. */
export async function loadStoredUser(mmUserId: string): Promise<StoredUser | null> {
    const raw = await kvGet(hashedKey(USER_PREFIX, mmUserId));
    return raw ? JSON.parse(decrypt(TEST_ENCRYPTION_KEY, raw.toString('utf8'))) : null;
}

/** The Mattermost user a Google account (people/<id>) is mapped to, if any. */
export async function mattermostUserIdFor(remoteId: string): Promise<string | null> {
    const raw = await kvGet(hashedKey(MMUID_PREFIX, remoteId));
    return raw ? raw.toString('utf8') : null;
}
