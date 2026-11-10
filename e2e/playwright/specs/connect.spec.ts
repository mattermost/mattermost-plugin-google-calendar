// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {GCAL_OAUTH_SCOPES, requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {requireFakeGoogle} from '../lib/google/mode';
import {loadStoredUser, mattermostUserIdFor, resetConnections} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings, PLUGIN_ID} from '../lib/plugin';
import {connectThroughGoogle, GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

test.beforeEach(async () => {
    requireFakeGoogle('drives Google\'s consent pages, which real Google does not allow to be automated');
    await resetConnections();
    await fakeGoogle.clearRequests();
});

/**
 * @objective Verify that a user connects a Google account through the bot's connect link and Google's consent pages, and the plugin stores the account and confirms it
 */
test('connects a Google account through the consent pages and confirms it in a bot DM', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Enable the plugin and log in as a regular user
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();

    // # Connect through the bot's link, choose the Google account and allow access
    // * Verify the bot confirms the connected Google account
    await connectThroughGoogle(channelsPage, team.name, owner.email);

    // * Verify the browser reached Google's sign-in host, and the plugin exchanged the code, then read the Google profile and time zone
    const requests = await fakeGoogle.requests();
    expect(requests.find((r) => r.path === '/o/oauth2/auth')?.host).toBe('accounts.google.com');
    expect(requests.filter((r) => r.grant === 'authorization_code').map((r) => r.status)).toEqual([200]);
    expect(requests.find((r) => r.methodId === 'people.people.get')?.status).toBe(200);
    expect(requests.find((r) => r.methodId === 'calendar.settings.get')?.status).toBe(200);

    // * Verify the account is stored for this user with Google's refresh token
    const stored = await loadStoredUser(user.id);
    expect(stored?.Remote.mail).toBe(owner.email);
    expect(stored?.OAuth2Token?.refresh_token).toBe(owner.refreshToken);
    expect(await mattermostUserIdFor(stored!.Remote.id)).toBe(user.id);

    // # Run the connect command again
    await channelsPage.goto(team.name);
    const command = new GcalCommand(channelsPage);
    await command.run('connect');

    // * Verify the plugin reports the already connected Google account instead of a new link
    await expect(command.alreadyConnected(owner.email)).toBeVisible();
});

/**
 * @objective Verify that every connect asks Google for offline access with a forced consent screen, including a reconnect after disconnecting
 */
test('requests offline access and forces the Google consent screen on every connect', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Enable the plugin, log in and connect a Google account
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    await connectThroughGoogle(channelsPage, team.name, owner.email);

    // # Disconnect and connect the same account again
    const command = new GcalCommand(channelsPage);
    await command.run('disconnect');
    await expect(command.disconnected).toBeVisible();
    await connectThroughGoogle(channelsPage, team.name, owner.email);

    // * Verify both authorization requests asked for offline access with forced consent, the plugin's scopes and its callback
    const authorizations = (await fakeGoogle.requests()).filter((r) => r.path === '/o/oauth2/auth');
    expect(authorizations).toHaveLength(2);
    for (const {query} of authorizations) {
        expect(query.client_id).toBe(googleOAuthSettings().oauth2ClientId);
        expect(query.access_type).toBe('offline');
        expect(query.prompt).toBe('consent');
        expect(query.redirect_uri).toBe(`${process.env.PW_BASE_URL}/plugins/${PLUGIN_ID}/oauth2/complete`);
        expect(String(query.scope).split(' ').sort()).toEqual([...GCAL_OAUTH_SCOPES].sort());
        expect(query.state).toMatch(new RegExp(`^[a-z0-9]{15}_${user.id}$`));
    }

    // * Verify the reconnect stored a refresh token again (Google only returns one after consent)
    expect((await loadStoredUser(user.id))?.OAuth2Token?.refresh_token).toBe(owner.refreshToken);
});

/**
 * @objective Verify that cancelling Google's consent screen leaves the user disconnected and the connect link still works afterwards
 */
test('stays disconnected when the user cancels the Google consent screen', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Enable the plugin, log in and start connecting from the bot's link
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('connect');
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    const consent = await botDM.startConnect();

    // # Choose the Google account and cancel the consent screen
    await consent.chooseAccount(owner.email);
    const callback = await consent.cancel();

    // * Verify the plugin rejects the callback, which carries no authorization code
    expect(callback.status()).toBe(400);
    expect(await callback.text()).toContain('missing authorization code');

    // * Verify the user is not connected and the plugin never asked Google for a token
    expect(await loadStoredUser(user.id)).toBeNull();
    expect((await fakeGoogle.requests()).filter((r) => r.path === '/token')).toHaveLength(0);
    await consent.page.close();

    // # Run the connect command again
    await channelsPage.goto(team.name);
    await command.run('connect');
    await botDM.open(team.name);

    // * Verify the bot offers the connect link again
    await expect(botDM.connectLink).toBeVisible();
});

/**
 * @objective Verify that disconnecting removes the stored Google account, after which commands ask the user to connect
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store (no Google sign-in)
 */
test('disconnects the Google account and asks the user to connect before using commands', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Enable the plugin and seed a connected Google account for a regular user
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {remote} = await seedConnectedGoogleUser(user, owner);

    // # Log in and disconnect
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('disconnect');

    // * Verify the plugin confirms and removes the account and its Google mapping
    await expect(command.disconnected).toBeVisible();
    expect(await loadStoredUser(user.id)).toBeNull();
    expect(await mattermostUserIdFor(remote.id)).toBeNull();

    // # Ask for today's agenda
    await command.run('today');

    // * Verify the plugin asks the user to connect a Google account
    await expect(command.notConnected).toBeVisible();
});
