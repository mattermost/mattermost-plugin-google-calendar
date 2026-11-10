// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle, tokenRequests} from '../lib/fake_google';
import {requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {googleMode, requireFakeGoogle} from '../lib/google/mode';
import {loadStoredUser, resetConnections} from '../lib/kv';
import {ensureGcalPlugin} from '../lib/plugin';
import {GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

// The engine refreshes any token that expires within 5 minutes (calendar/store/user_store.go
// RefreshAndStoreToken), so tokens below that lifetime are refreshed on every use: no waiting.
const SHORT_TOKEN_TTL_SECONDS = 120;
const DEFAULT_TOKEN_TTL_SECONDS = 3599;

const inOneMinute = () => new Date(Date.now() + 60_000).toISOString();

test.beforeEach(async () => {
    requireFakeGoogle('sets token lifetimes and revokes tokens through the fake\'s control API');
    await resetConnections();
});

test.afterEach(async () => {
    if (googleMode() === 'fake') {
        await fakeGoogle.configure({accessTokenTtlSeconds: DEFAULT_TOKEN_TTL_SECONDS});
    }
});

/**
 * @objective Verify that the plugin refreshes an access token that is about to expire before calling Google, and stores the new token
 *
 * @precondition
 * The user's Google connection is seeded with an access token that expires in one minute, and the fake issues access tokens that expire in two minutes
 */
test('refreshes an access token that expires within five minutes before each command', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connection whose access token expires in a minute, and an event for today
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await fakeGoogle.configure({accessTokenTtlSeconds: SHORT_TOKEN_TTL_SECONDS});
    const staleAccessToken = `e2e-stale-${await pw.random.id()}`;
    await seedConnectedGoogleUser(user, owner, {access_token: staleAccessToken, token_type: 'Bearer', refresh_token: owner.refreshToken, expiry: inOneMinute()});
    const today = new Date().toISOString().slice(0, 10);
    const summary = `[e2e-${await pw.random.id()}] Token refresh check`;
    await fakeGoogle.createEvent(owner.email, {summary, start: {dateTime: `${today}T12:00:00Z`}, end: {dateTime: `${today}T13:00:00Z`}});
    await fakeGoogle.clearRequests();

    // # Ask for today's agenda
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('today');

    // * Verify the agenda shows the event, read with a refreshed token
    await expect(command.agendaWith(summary)).toBeVisible();
    const firstRefreshes = await tokenRequests('refresh_token');
    expect(firstRefreshes.length).toBeGreaterThan(0);
    expect(firstRefreshes.every((r) => r.status === 200)).toBe(true);
    const calendarCalls = (await fakeGoogle.requests()).filter((r) => r.methodId);
    expect(calendarCalls.length).toBeGreaterThan(0);
    expect(calendarCalls.every((r) => r.status === 200)).toBe(true);

    // * Verify the plugin stored the new access token and its expiry
    const stored = (await loadStoredUser(user.id))?.OAuth2Token;
    expect(stored?.access_token).not.toBe(staleAccessToken);
    expect(stored?.refresh_token).toBe(owner.refreshToken);
    expect(Date.parse(stored!.expiry!)).toBeGreaterThan(Date.now());
    expect(Date.parse(stored!.expiry!)).toBeLessThanOrEqual(Date.now() + SHORT_TOKEN_TTL_SECONDS * 1000);

    // # Ask for today's agenda again
    await fakeGoogle.clearRequests();
    await command.run('today');

    // * Verify the plugin refreshed the stored token again, since it also expires within five minutes
    await expect.poll(async () => (await tokenRequests('refresh_token')).length).toBeGreaterThan(0);
    expect((await loadStoredUser(user.id))?.OAuth2Token?.access_token).not.toBe(stored?.access_token);
});

/**
 * @objective Verify that a user whose access token expires and who has no refresh token is marked inactive and told once to reconnect
 *
 * @precondition
 * The user's Google connection is seeded with an access token that expires in one minute and no refresh token (as domain-wide delegation issues them)
 */
test('marks a user without a refresh token inactive and sends one reconnect DM', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connection with an expiring access token and no refresh token
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner, {access_token: `e2e-access-${await pw.random.id()}`, token_type: 'Bearer', expiry: inOneMinute()});
    await fakeGoogle.clearRequests();

    // # Ask for today's agenda twice
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    const botDM = new GcalBotDM(channelsPage);
    await command.run('today');
    await expect(command.markedInactiveReplies).toHaveCount(1);
    await command.run('today');

    // * Verify both commands answer that the user was marked inactive
    await expect(command.markedInactiveReplies).toHaveCount(2);

    // * Verify the plugin cleared the stored token without asking Google
    expect((await loadStoredUser(user.id))?.OAuth2Token).toBeNull();
    expect(await tokenRequests()).toHaveLength(0);

    // # Open the bot DM
    await botDM.open(team.name);

    // * Verify the bot sent the reconnect notice once
    await expect(botDM.inactiveNotices).toHaveCount(1);
});

/**
 * @objective Verify what happens when Google rejects a revoked refresh token: the command fails, and the user is not marked inactive or told to reconnect
 *
 * @precondition
 * The user's Google connection is seeded with an expired access token and a refresh token that the fake has revoked
 */
test('fails commands without marking the user inactive when Google rejects a revoked refresh token', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connection with an expired access token and revoke its refresh token at Google
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner, {access_token: `e2e-expired-${await pw.random.id()}`, token_type: 'Bearer', refresh_token: owner.refreshToken, expiry: new Date(Date.now() - 60_000).toISOString()});
    await fakeGoogle.revokeRefreshTokens(owner.email);
    await fakeGoogle.clearRequests();

    // # Ask for today's agenda
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('today');

    // * Verify the command fails after Google refuses the refresh with invalid_grant
    await expect(command.commandFailed).toBeVisible();
    const refreshes = await tokenRequests('refresh_token');
    expect(refreshes.length).toBeGreaterThan(0);
    expect(refreshes.every((r) => r.status === 400)).toBe(true);

    // * Verify the plugin keeps the connection: Google's "invalid_grant" matches neither error the engine treats as an expired refresh token (spike Q1)
    expect((await loadStoredUser(user.id))?.OAuth2Token?.refresh_token).toBe(owner.refreshToken);

    // # Open the bot DM
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);

    // * Verify the bot did not tell the user to reconnect
    await expect(botDM.inactiveNotices).toHaveCount(0);
});
