// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {googleProfile, requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {cleanupEvents, dateIn, eventSummary, waitForEvent} from '../lib/google/events';
import {googleMode} from '../lib/google/mode';
import {resetConnections} from '../lib/kv';
import {ensureGcalPlugin} from '../lib/plugin';
import {createTeammate, pluginDisplayName} from '../lib/users';
import {CreateEventModal} from '../pages/create_event_modal';
import {GcalBotDM} from '../pages/gcal_bot_dm';

// On the fake, a calendar time zone other than the server's (UTC), so the specs see which zone the
// plugin sends. On real Google, the owner account's own calendar time zone.
const FAKE_CALENDAR_TIME_ZONE = 'Europe/Belgrade';

let runId: string;
let calendarTimeZone: string;

test.beforeEach(async ({pw}) => {
    runId = await pw.random.id();
    await resetConnections();
    if (googleMode() === 'fake') {
        await fakeGoogle.configure({timeZones: {owner: FAKE_CALENDAR_TIME_ZONE}});
        await fakeGoogle.clearRequests();
    }
    calendarTimeZone = (await googleProfile(requireGoogle('owner').owner)).timeZone;
});

test.afterEach(async () => {
    await cleanupEvents();
    if (googleMode() === 'fake') {
        await fakeGoogle.configure({timeZones: {owner: 'UTC'}});
    }
});

/**
 * @objective Verify that a connected user opens the create-event dialog from the channel menu and with /gcal event create, and that Create stays disabled until the subject, date and start time are set
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store
 */
test('opens the create-event dialog from the channel menu and the slash command, with Create disabled until the form is valid', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user and open the dialog from the channel menu
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const modal = new CreateEventModal(channelsPage);
    await modal.openFromChannelMenu();

    // * Verify Create is disabled on the empty form
    await expect(modal.createButton).toBeDisabled();

    // # Fill in the subject and date only
    await modal.subjectInput.fill(eventSummary(runId, 'Incomplete'));
    await modal.chooseDate(dateIn(calendarTimeZone, 1));

    // * Verify Create is still disabled without a start time
    await expect(modal.createButton).toBeDisabled();

    // # Choose a start time
    await modal.chooseStartTime('10:00');

    // * Verify the end time defaults to 30 minutes later and Create is enabled
    await expect(modal.endTimeInput).toHaveText('10:30');
    await expect(modal.createButton).toBeEnabled();

    // # Close the dialog and open it with the slash command
    await channelsPage.page.keyboard.press('Escape');
    await expect(modal.container).toBeHidden();
    await modal.openFromCommand();

    // * Verify the dialog opens with an empty form
    await expect(modal.subjectInput).toHaveValue('');
    await expect(modal.createButton).toBeDisabled();
});

/**
 * @objective Verify that a user who is not connected is asked to connect instead of getting the create-event dialog
 */
test('asks a user who is not connected to connect instead of opening the create-event dialog', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin and run /gcal event create as a user who is not connected
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const modal = new CreateEventModal(channelsPage);
    await modal.sendCreateCommand();

    // * Verify the plugin asks the user to connect and no dialog opens
    await expect(modal.notConnectedNotice).toBeVisible();
    await expect(modal.container).toBeHidden();
});

/**
 * @objective Verify that creating an event with a connected teammate as guest inserts it on the organizer's Google calendar in the calendar's time zone, invites the guest with email updates, and announces it in the linked channel
 *
 * @precondition
 * The organizer and the guest each have a Google connection seeded directly into the plugin KV store (owner and collab accounts)
 */
test('creates an event linked to the channel and invites a connected teammate', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');

    // # Seed two connected users on the same team
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const teammate = await createTeammate(adminClient, team, await pw.random.user('guest'));
    await seedConnectedGoogleUser(user, owner);
    await seedConnectedGoogleUser(teammate, collab);

    // # Open the dialog in Town Square and fill in an event for tomorrow at 10:00 with the teammate as guest
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const modal = new CreateEventModal(channelsPage);
    await modal.openFromChannelMenu();
    const summary = eventSummary(runId, 'Kickoff');
    const date = dateIn(calendarTimeZone, 1);
    await modal.subjectInput.fill(summary);
    await modal.chooseDate(date);
    await modal.chooseStartTime('10:00');
    await modal.addConnectedGuest(teammate.username, pluginDisplayName(teammate));

    // * Verify the dialog links the event to the current channel
    await expect(modal.channelInput).toHaveValue('Town Square');

    // # Create the event
    await modal.createButton.click();

    // * Verify the dialog closes without an error
    await expect(modal.container).toBeHidden();

    // * Verify the plugin announces the event in the channel
    await expect(modal.linkedAnnouncement(summary, user.username)).toBeVisible();

    // * Verify the event is on the organizer's calendar and on the guest's
    const created = await waitForEvent(owner, summary);
    expect(created.start.dateTime).toMatch(new RegExp(`^${date}T10:00:00`));
    expect((created.attendees ?? []).map((a: {email: string}) => a.email)).toContain(collab.email);
    await waitForEvent(collab, summary);

    // * Verify the plugin asked Google to email the guests, with times in the calendar's time zone
    if (googleMode() === 'fake') {
        const inserts = (await fakeGoogle.requests()).filter((r) => r.methodId === 'calendar.events.insert');
        expect(inserts).toHaveLength(1);
        expect(inserts[0].status).toBe(200);
        expect(inserts[0].query.sendUpdates).toBe('all');
        expect(inserts[0].body.start).toEqual({dateTime: expect.stringMatching(new RegExp(`^${date}T10:00:00`)), timeZone: calendarTimeZone});
        expect(inserts[0].body.end).toEqual({dateTime: expect.stringMatching(new RegExp(`^${date}T10:30:00`)), timeZone: calendarTimeZone});
        expect(inserts[0].body.attendees).toEqual([{email: collab.email}]);
    }
});

/**
 * @objective Verify that an event created without a linked channel carries its location and description to Google and is confirmed in a bot DM
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store
 */
test('creates an event without a channel and confirms it in a bot DM', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user and fill in an event with a location and description, without a channel
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const modal = new CreateEventModal(channelsPage);
    await modal.openFromCommand();
    const summary = eventSummary(runId, '1:1');
    await modal.subjectInput.fill(summary);
    await modal.chooseDate(dateIn(calendarTimeZone, 2));
    await modal.chooseStartTime('14:00');
    await modal.locationInput.fill('Room 4');
    await modal.descriptionInput.fill('Quarterly goals');
    await modal.clearLinkedChannel();

    // # Create the event
    await modal.createButton.click();
    await expect(modal.container).toBeHidden();

    // * Verify the bot confirms the event with its time in the calendar's time zone and its location
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    await expect(botDM.eventCreated).toContainText(summary);
    await expect(botDM.eventCreated).toContainText(`2:00PM - 2:30PM (${calendarTimeZone})`);
    await expect(botDM.eventCreated).toContainText('Room 4');

    // * Verify Google has the event with its location and description
    const created = await waitForEvent(owner, summary);
    expect(created).toMatchObject({summary, location: 'Room 4', description: 'Quarterly goals'});
});
