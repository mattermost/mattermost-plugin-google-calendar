// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {requireFakeGoogle} from '../lib/google/mode';
import {resetConnections} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings, PLUGIN_ID} from '../lib/plugin';
import {GcalCommand} from '../pages/gcal_command';

// Google ships with EventNotifications off (gcal/provider.go), so nothing subscribes on its own and
// the notification endpoint has no processor. These specs document what the admin-only subscribe
// commands and the push endpoint do today.

const notificationUrl = () => `${process.env.PW_BASE_URL}/plugins/${PLUGIN_ID}/notification/v1/event`;

test.beforeEach(async () => {
    requireFakeGoogle('asserts the watch request Google receives, through the fake\'s request log');
    await resetConnections();
    await fakeGoogle.clearRequests();
});

/**
 * @objective Verify what /gcal subscribe does for a plugin admin on a non-HTTPS site: Google refuses the watch channel, the command fails and nothing is stored, so unsubscribe has nothing to remove
 *
 * @precondition
 * The user is a plugin admin; the Google connection is seeded directly into the plugin KV store; SiteURL is plain HTTP, as in the e2e stack
 */
test('fails to subscribe on a non-HTTPS site because Google refuses the watch channel', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Make a regular user a plugin admin and seed their connection
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    const {remote} = await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);

    // # Subscribe to calendar events
    const response = await command.run('subscribe');

    // * Verify the command fails
    expect(response.status()).toBe(500);
    await expect(command.commandFailed).toBeVisible();

    // * Verify the plugin asked Google to watch the primary calendar with a webhook to its notification URL, and Google refused the HTTP address
    const watches = (await fakeGoogle.requests()).filter((r) => r.methodId === 'calendar.events.watch');
    expect(watches).toHaveLength(1);
    expect(watches[0].status).toBe(400);
    expect(watches[0].body).toMatchObject({type: 'webhook', address: notificationUrl()});

    // * Verify the channel id is longer than the 64 characters Google documents, so the watch would also fail on an HTTPS site (gcal/subscription.go)
    expect(watches[0].body.id.startsWith(`${remote.id}_calendar_event_notifications_`)).toBe(true);
    expect(watches[0].body.id.length).toBeGreaterThan(64);
    expect(await fakeGoogle.channels()).toHaveLength(0);

    // # Unsubscribe
    await command.run('unsubscribe');

    // * Verify the plugin reports there is no subscription and does not call Google
    await expect(command.reply('You are not subscribed to events.')).toBeVisible();
    expect((await fakeGoogle.requests()).filter((r) => r.methodId === 'calendar.channels.stop')).toHaveLength(0);
});

/**
 * @objective Verify that the push notification endpoint accepts Google's sync and change notifications without processing them, since Google has event notifications off
 */
test('accepts Google push notifications without acting on them', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin
    const {adminClient} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);

    // # Send Google's sync notification and a change notification for an unknown channel, without a Mattermost session
    const push = (state: string) => fetch(notificationUrl(), {
        method: 'POST',
        headers: {
            'X-Goog-Channel-Id': `e2e-channel-${state}`,
            'X-Goog-Channel-Token': 'e2e-token',
            'X-Goog-Resource-Id': 'e2e-resource',
            'X-Goog-Resource-State': state,
            'X-Goog-Message-Number': '1',
        },
    });
    const sync = await push('sync');
    const change = await push('exists');

    // * Verify both are accepted with an empty body
    expect(sync.status).toBe(200);
    expect(await sync.text()).toBe('');
    expect(change.status).toBe(200);
    expect(await change.text()).toBe('');

    // * Verify the plugin did not call Google for either
    expect((await fakeGoogle.requests()).filter((r) => r.methodId)).toHaveLength(0);
});
