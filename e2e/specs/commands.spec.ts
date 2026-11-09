// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {googleProfile, requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {allDayEvent, createFixtureEvent, dateIn, deleteEvents, eventSummary, timedEvent} from '../lib/google/events';
import {googleMode} from '../lib/google/mode';
import {loadStoredUser, resetConnections} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings} from '../lib/plugin';
import {GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

// A calendar time zone other than the server's (UTC), so the specs see the plugin convert times.
const CALENDAR_TIME_ZONE = 'Europe/Belgrade';

// Settings the bot's settings panel shows for Google (engine/settings.go NewSettingsPanel). Google
// has EventNotifications off (gcal/provider.go), so "Receive notifications of new events" is absent.
const SETTINGS = ['Update Status', 'Get Confirmation', 'Set Custom Status', 'Receive Reminders', 'Daily Summary'];

/** The date heading viewcal prints for `date` (YYYY-MM-DD), Go layout "Monday January 02, 2006". */
function viewcalHeading(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', {timeZone: 'UTC', ...options}).format(d);
    return `${part({weekday: 'long'})} ${part({month: 'long'})} ${part({day: '2-digit'})}, ${part({year: 'numeric'})}`;
}

let runId: string;

test.beforeEach(async ({pw}) => {
    runId = await pw.random.id();
    await resetConnections();
    if (googleMode() === 'fake') {
        await fakeGoogle.configure({timeZones: {owner: CALENDAR_TIME_ZONE}});
    }
});

test.afterEach(async () => {
    const {owner} = requireGoogle('owner');
    await deleteEvents(owner, `[e2e-${runId}]`);
    if (googleMode() === 'fake') {
        await fakeGoogle.configure({timeZones: {owner: 'UTC'}});
    }
});

/**
 * @objective Verify that today, tomorrow and summary view list the right day's events in the calendar's time zone, including all-day events and leaving out declined ones
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store, and the owner's calendar uses a non-UTC time zone
 */
test('lists the day\'s events in the calendar time zone for today, tomorrow and summary view', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');
    const {timeZone} = await googleProfile(owner);

    // # Put a timed, an all-day and a declined event on today's calendar, and a timed event tomorrow
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const today = dateIn(timeZone);
    const tomorrow = dateIn(timeZone, 1);
    const standup = eventSummary(runId, 'Standup');
    const offsite = eventSummary(runId, 'Offsite');
    const declined = eventSummary(runId, 'Declined review');
    const planning = eventSummary(runId, 'Planning');
    await createFixtureEvent(owner, timedEvent(standup, today, '10:00', '10:30', timeZone));
    await createFixtureEvent(owner, allDayEvent(offsite, today));
    await createFixtureEvent(owner, timedEvent(declined, today, '11:00', '12:00', timeZone, {attendees: [{email: owner.email, responseStatus: 'declined'}]}));
    await createFixtureEvent(owner, timedEvent(planning, tomorrow, '15:00', '16:00', timeZone));

    // # Ask for today's agenda
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('today');

    // * Verify the agenda is in the calendar's time zone, lists the timed and all-day events, and leaves out the declined one and tomorrow's
    const todayAgenda = command.agendaInTimeZone(timeZone);
    await expect(command.agendaRow(todayAgenda, '10:00AM - 10:30AM', standup)).toBeVisible();
    await expect(command.agendaRow(todayAgenda, 'All day event', offsite)).toBeVisible();
    await expect(todayAgenda).not.toContainText(declined);
    await expect(todayAgenda).not.toContainText(planning);

    // # Ask for tomorrow's agenda
    await command.run('tomorrow');

    // * Verify it lists only tomorrow's event
    const tomorrowAgenda = command.lastPost;
    await expect(command.agendaRow(tomorrowAgenda, '3:00PM - 4:00PM', planning)).toBeVisible();
    await expect(tomorrowAgenda).not.toContainText(standup);

    // # View the daily summary
    await command.run('summary', 'view');

    // * Verify it shows today's agenda
    await expect(command.lastPost).toContainText(standup);
    await expect(command.lastPost).not.toContainText(planning);
});

/**
 * @objective Verify that viewcal lists the events of the next 14 days grouped under a heading per date, and leaves out later events
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store
 */
test('lists the next 14 days of events grouped by date with viewcal', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');
    const {timeZone} = await googleProfile(owner);

    // # Put events 3 and 7 days from now, and one 20 days from now
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const inThreeDays = dateIn(timeZone, 3);
    const inSevenDays = dateIn(timeZone, 7);
    const review = eventSummary(runId, 'Design review');
    const retro = eventSummary(runId, 'Retro');
    const later = eventSummary(runId, 'Quarterly planning');
    await createFixtureEvent(owner, timedEvent(review, inThreeDays, '09:00', '10:00', timeZone));
    await createFixtureEvent(owner, timedEvent(retro, inSevenDays, '14:00', '14:45', timeZone));
    await createFixtureEvent(owner, timedEvent(later, dateIn(timeZone, 20), '09:00', '10:00', timeZone));

    // # View the calendar
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('viewcal');

    // * Verify both events in range are listed under their dates, in the calendar's time zone
    const view = command.agendaInTimeZone(timeZone);
    await expect(view).toContainText(viewcalHeading(inThreeDays));
    await expect(command.agendaRow(view, '9:00AM - 10:00AM', review)).toBeVisible();
    await expect(view).toContainText(viewcalHeading(inSevenDays));
    await expect(command.agendaRow(view, '2:00PM - 2:45PM', retro)).toBeVisible();

    // * Verify the event beyond 14 days is not listed
    await expect(view).not.toContainText(later);

    // * Verify each event links to Google Calendar
    await expect(command.eventLink(view, review)).toHaveAttribute('href', /^https:\/\/www\.google\.com\/calendar\/event\?eid=/);
});

/**
 * @objective Verify that the summary subcommands show, set, enable and disable the daily summary, and reject a time that is not on a 15-minute step
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store with a disabled 8:00AM daily summary, as a new connection has
 */
test('shows, sets, enables and disables the daily summary', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {timeZone} = await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);

    // # Show the summary settings
    await command.run('summary', 'settings');

    // * Verify the summary is set for 8:00AM in the calendar's time zone and disabled
    await expect(command.summaryConfigured('8:00AM', timeZone, false)).toHaveCount(1);

    // # Set a time that is not a multiple of 15 minutes
    await command.run('summary', 'time', '9:10AM');

    // * Verify the plugin rejects it and shows an example
    await expect(command.reply('time must be a multiple of 15 minutes')).toContainText('/gcal summary time 8:00AM');

    // # Set 9:30am
    await command.run('summary', 'time', '9:30am');

    // * Verify the new time is stored in upper case, still disabled
    await expect(command.summaryConfigured('9:30AM', timeZone, false)).toHaveCount(1);

    // # Enable the summary
    await command.run('summary', 'enable');

    // * Verify it is enabled and the settings are stored
    await expect(command.summaryConfigured('9:30AM', timeZone, true)).toHaveCount(1);
    const stored = await loadStoredUser(user.id);
    expect((stored?.mattermostSettings as any)?.DailySummary).toMatchObject({post_time: '9:30AM', tz: timeZone, enable: true});

    // # Disable the summary and run summary with no action
    await command.run('summary', 'disable');
    await expect(command.summaryConfigured('9:30AM', timeZone, false)).toHaveCount(2);
    await command.run('summary');

    // * Verify the summary is disabled again and the plugin lists the summary commands
    expect(((await loadStoredUser(user.id))?.mattermostSettings as any)?.DailySummary?.enable).toBe(false);
    await expect(command.summaryHelp).toBeVisible();
});

/**
 * @objective Verify that the settings command posts the settings panel in the bot DM with the settings Google supports
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store
 */
test('posts the settings panel in the bot DM without the new-event notifications setting', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user and run the settings command
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('settings');

    // * Verify the bot DM lists the status, reminder and daily summary settings, and no notification setting
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    for (const title of SETTINGS) {
        await expect(botDM.setting(title)).toBeVisible();
    }
    await expect(botDM.settingTitles()).toHaveText(SETTINGS.map((t) => `Setting: ${t}`));
});

/**
 * @objective Verify that the admin-only subcommands refuse a connected user who is neither a plugin admin nor a system admin
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store and the plugin's admin user IDs are empty
 */
test('refuses showcals, avail, subscribe and unsubscribe to a user who is not an admin', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected regular user
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    if (googleMode() === 'fake') {
        await fakeGoogle.clearRequests();
    }

    // # Run each admin-only subcommand
    for (const subcommand of ['showcals', 'avail', 'subscribe', 'unsubscribe']) {
        await command.run(subcommand);
    }

    // * Verify each one is refused
    await expect(command.notAuthorized).toHaveCount(4);

    // * Verify none of them called Google
    if (googleMode() === 'fake') {
        expect((await fakeGoogle.requests()).filter((r) => r.methodId)).toHaveLength(0);
    }
});

/**
 * @objective Verify what showcals does for a plugin admin: the Google provider does not implement listing calendars, so the command fails
 *
 * @precondition
 * The user is listed in the plugin's admin user IDs and the Google connection is seeded directly into the plugin KV store
 */
test('fails showcals for a plugin admin because Google calendars cannot be listed', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Make a regular user a plugin admin and seed their connection
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);

    // # List the calendars
    const response = await command.run('showcals');

    // * Verify the command fails: gcal/calendar.go GetCalendars returns "not implemented"
    expect(response.status()).toBe(500);
    await expect(command.commandFailed).toBeVisible();
    await expect(command.notAuthorized).toHaveCount(0);
});

/**
 * @objective Verify that an unknown subcommand, and /gcal on its own, answer with the help text
 */
test('answers an unknown subcommand with the help text', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin and run an unknown subcommand as a user who is not connected
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('nonsense');

    // * Verify the reply lists the subcommands
    await expect(command.helpEntry('connect')).toHaveCount(1);
    await expect(command.helpEntry('viewcal')).toHaveCount(1);

    // # Run the command with no subcommand
    await command.run();

    // * Verify it also answers with the help text
    await expect(command.helpEntry('connect')).toHaveCount(2);
});
