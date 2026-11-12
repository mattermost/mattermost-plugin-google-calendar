// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {googleMode} from '../lib/google/mode';
import {loadStoredUser, resetConnections} from '../lib/kv';
import {configureGcalPlugin, ensureGcalPlugin, googleOAuthSettings, installedPluginVersion, PLUGIN_STATE, settledPluginState} from '../lib/plugin';
import {GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

// Subcommands `/gcal help` lists for everyone (calendar/command/command.go getCommands).
const HELP_SUBCOMMANDS = ['connect', 'disconnect', 'summary', 'viewcal', 'event', 'today', 'tomorrow', 'settings', 'info', 'help'];

/**
 * @objective Verify that the plugin does not start, and `/gcal` is not registered, until a Google OAuth client ID and secret are configured
 *
 * @precondition
 * The plugin is enabled with an encryption key but an empty OAuth client ID and secret
 */
test('does not start the plugin or register /gcal until a Google OAuth client is configured', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin without a Google OAuth client
    const {adminClient, adminUser, team} = await pw.initSetup();
    await configureGcalPlugin(adminClient, {oauth2ClientId: '', oauth2ClientSecret: ''});

    // * Verify Mattermost reports that the plugin failed to start
    expect(await settledPluginState(adminClient)).toBe(PLUGIN_STATE.failedToStart);

    // # Run the help command as a system admin
    const {channelsPage} = await pw.testBrowser.login(adminUser!);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('help');

    // * Verify Mattermost does not know the command
    await expect(command.commandNotFound).toBeVisible();
});

/**
 * @objective Verify that the plugin does not start without an encryption key, which it needs to store Google tokens
 *
 * @precondition
 * The plugin is enabled with a Google OAuth client but an empty encryption key
 */
test('does not start the plugin without an encryption key', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin with a Google OAuth client and an empty encryption key
    const {adminClient} = await pw.initSetup();
    await configureGcalPlugin(adminClient, {...googleOAuthSettings(), encryptionKey: ''});

    // * Verify Mattermost reports that the plugin failed to start
    expect(await settledPluginState(adminClient)).toBe(PLUGIN_STATE.failedToStart);
});

/**
 * @objective Verify current behaviour with an encryption key AES can't use: the plugin starts (it only rejects an empty key, gcal/remote.go CheckConfiguration), but connecting an account then fails before reaching Google, because the engine uses the key as-is for AES, which needs 16, 24 or 32 bytes (calendar/utils/kvstore/crypt.go). Known product bug: this test should change when activation validates the key length
 *
 * @precondition
 * The plugin is enabled with a Google OAuth client and a 5-character encryption key
 */
test('starts with a 5-character encryption key, but connecting an account then fails', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin with a 5-character encryption key
    const {adminClient, user, team} = await pw.initSetup();
    await configureGcalPlugin(adminClient, {...googleOAuthSettings(), encryptionKey: 'short'});

    // * Verify Mattermost reports that the plugin is running
    expect(await settledPluginState(adminClient)).toBe(PLUGIN_STATE.running);

    // # Start connecting a Google account through the bot's link
    await resetConnections();
    if (googleMode() === 'fake') {
        await fakeGoogle.clearRequests();
    }
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    await new GcalCommand(channelsPage).run('connect');
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    const errorPage = await botDM.startConnectExpectingError();

    // * Verify the plugin fails before sending the user to Google: it can't encrypt the OAuth state with this key
    await expect(errorPage).toContainText('crypto/aes: invalid key size 5');
    if (googleMode() === 'fake') {
        expect((await fakeGoogle.requests()).filter((r) => r.path === '/o/oauth2/auth')).toHaveLength(0);
    }
    expect(await loadStoredUser(user.id)).toBeNull();
});

/**
 * @objective Verify that a configured plugin starts, `/gcal help` lists the user subcommands and `/gcal info` reports the installed version
 */
test('starts with a Google OAuth client and encryption key and lists the subcommands in /gcal help', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin with a Google OAuth client and a 32-byte encryption key
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);

    // # Log in as a regular user and run the help command
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('help');

    // * Verify every user subcommand is listed
    for (const subcommand of HELP_SUBCOMMANDS) {
        await expect(command.helpEntry(subcommand)).toBeVisible();
    }

    // # Run the info command
    await command.run('info');

    // * Verify it reports the installed plugin version
    await expect(command.pluginInfo(await installedPluginVersion(adminClient))).toBeVisible();
});
