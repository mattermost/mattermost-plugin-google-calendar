// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {viewEvents} from '../lib/events_api';
import {fakeGoogle} from '../lib/fake_google';
import {googleProfile, requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {allDayEvent, createFixtureEvent, dateIn, deleteEvents, eventSummary} from '../lib/google/events';
import {googleMode} from '../lib/google/mode';
import {resetConnections} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings} from '../lib/plugin';
import {setMattermostTimeZone} from '../lib/users';
import {CalendarSidebar} from '../pages/calendar_sidebar';
import {CreateEventModal} from '../pages/create_event_modal';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MEET_LINK = 'https://meet.google.com/xyz-abcd-efg';

// The sidebar is behind the plugin's EnableExperimentalUI setting.
const withSidebar = () => ({...googleOAuthSettings(), enableExperimentalUI: true});

let runId: string;

test.beforeEach(async ({pw}) => {
    runId = await pw.random.id();
    await resetConnections();
});

test.afterEach(async () => {
    const {owner} = requireGoogle('owner');
    await deleteEvents(owner, `[e2e-${runId}]`);
});

/**
 * @objective Verify that the sidebar app bar button only exists with the experimental UI setting, and that the sidebar offers to connect a user who is not connected
 */
test('shows the sidebar only with the experimental UI, with a connect prompt for a user who is not connected', {tag: '@google_calendar'}, async ({pw}) => {
    // # Enable the plugin without the experimental UI and log in
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient);
    const {page, channelsPage} = await pw.testBrowser.login(user);
    const providerConfig = CalendarSidebar.providerConfigLoaded(page);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    await providerConfig;
    const sidebar = new CalendarSidebar(channelsPage);

    // * Verify the app bar has no calendar button once the plugin has loaded its configuration
    await expect(sidebar.appBarIcon).toHaveCount(0);

    // # Turn on the experimental UI and reload
    await ensureGcalPlugin(adminClient, withSidebar());
    await channelsPage.page.reload();
    await channelsPage.toBeVisible();

    // # Open the sidebar
    await sidebar.open();

    // * Verify it asks the user to connect a Google account
    await expect(sidebar.welcome).toBeVisible();
    await expect(sidebar.connectButton).toBeVisible();
});

/**
 * @objective Verify that the sidebar shows today's timed and all-day events, and an event's details with its location and Google Meet link
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store, and their Mattermost time zone is set to the calendar's (the sidebar renders in the Mattermost time zone)
 */
test('shows today\'s events and an event\'s details with the Meet link', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');
    test.skip(googleMode() === 'real', 'Fake Google only: real Google sets Meet links through conferenceData, which fixtures cannot set without creating a real meeting');

    // # Put a meeting around now with a Meet link and an all-day event for today on the calendar
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, withSidebar());
    await seedConnectedGoogleUser(user, owner);
    const {timeZone} = await googleProfile(owner);
    await setMattermostTimeZone(userClient, timeZone);
    const meeting = eventSummary(runId, 'Sidebar meeting');
    const holiday = eventSummary(runId, 'Team day');
    const at = (min: number) => new Date(Math.floor((Date.now() + (min * MINUTE)) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    await createFixtureEvent(owner, {summary: meeting, start: {dateTime: at(-15)}, end: {dateTime: at(45)}, location: 'Room 9', attendees: [{email: collab.email}], hangoutLink: MEET_LINK});
    await createFixtureEvent(owner, allDayEvent(holiday, dateIn(timeZone)));

    // # Log in and open the sidebar
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const sidebar = new CalendarSidebar(channelsPage);
    await sidebar.open();

    // * Verify both events are on today's calendar
    await expect(sidebar.event(meeting)).toBeVisible();
    await expect(sidebar.event(holiday)).toBeVisible();

    // # Open the meeting's details
    await sidebar.openEvent(meeting);

    // * Verify the details show the location and a Join link to the Meet call
    await expect(sidebar.tooltip).toContainText('Room 9');
    await expect(sidebar.tooltip).toContainText('Google Meet');
    await expect(sidebar.joinMeetingLink).toHaveAttribute('href', MEET_LINK);

    // # Close the details
    await sidebar.closeTooltipButton.click();

    // * Verify the details are gone
    await expect(sidebar.tooltip).toBeHidden();
});

/**
 * @objective Verify that clicking an empty time slot in the sidebar opens the create-event dialog for that date and half hour
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store, and their Mattermost time zone is set to the calendar's (the sidebar renders in the Mattermost time zone)
 */
test('opens the create-event dialog for a clicked time slot', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user, open the sidebar and go to tomorrow
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, withSidebar());
    await seedConnectedGoogleUser(user, owner);
    const {timeZone} = await googleProfile(owner);
    await setMattermostTimeZone(userClient, timeZone);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const sidebar = new CalendarSidebar(channelsPage);
    await sidebar.open();
    await sidebar.nextButton.click();

    // # Click the empty 15:00 slot
    await sidebar.slot('15:00').click();

    // * Verify the dialog opens for tomorrow from 15:00 to 15:30
    const modal = new CreateEventModal(channelsPage);
    await expect(modal.container).toBeVisible();
    await expect(modal.dateInput).toHaveValue(dateIn(timeZone, 1));
    await expect(modal.container).toContainText('15:00');
    await expect(modal.container).toContainText('15:30');
});

/**
 * @objective Verify that the sidebar's events endpoint rejects a range over 62 days without calling Google
 *
 * @precondition
 * The user's Google connection is seeded directly into the plugin KV store
 */
test('rejects an events range over 62 days', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner} = requireGoogle('owner');

    // # Seed a connected user and log in
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, withSidebar());
    await seedConnectedGoogleUser(user, owner);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    if (googleMode() === 'fake') {
        await fakeGoogle.clearRequests();
    }

    // # Ask for 63 days of events, then for 62
    const from = new Date();
    const tooLong = await viewEvents(channelsPage.page, from, new Date(from.getTime() + (63 * DAY)));
    const longest = await viewEvents(channelsPage.page, from, new Date(from.getTime() + (62 * DAY)));

    // * Verify the 63-day range is refused and the 62-day range is answered
    expect(tooLong.status()).toBe(400);
    expect(await tooLong.text()).toContain('date range must not exceed 62 days');
    expect(longest.status()).toBe(200);

    // * Verify only the allowed range reached Google
    if (googleMode() === 'fake') {
        const lists = (await fakeGoogle.requests()).filter((r) => r.methodId === 'calendar.events.list');
        expect(lists).toHaveLength(1);
    }
});
