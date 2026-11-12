// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

/**
 * Creates `profile` (from pw.random.user()) as a regular user on the team, keeping its password so
 * the test can log in as them.
 */
export async function createTeammate(adminClient: Client4, team: Team, profile: UserProfile): Promise<UserProfile> {
    const created = await adminClient.createUser(profile, '', '');
    await adminClient.addToTeam(team.id, created.id);
    return {...created, password: profile.password};
}

/** How the plugin shows a Mattermost user in its user index ("First Last", else the username). */
export function pluginDisplayName(user: {username: string; first_name?: string; last_name?: string}): string {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
}

/**
 * Sets the Mattermost user's time zone (instead of the browser's, which Mattermost uses by default).
 * The calendar sidebar renders in this zone.
 */
export async function setMattermostTimeZone(userClient: Client4, timeZone: string) {
    await userClient.patchMe({timezone: {useAutomaticTimezone: 'false', automaticTimezone: '', manualTimezone: timeZone}} as any);
}
