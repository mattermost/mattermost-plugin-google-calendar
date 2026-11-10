// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {fakeGoogle} from '../lib/fake_google';
import {requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {createFixtureEvent, deleteEvents, eventSummary} from '../lib/google/events';
import {googleMode} from '../lib/google/mode';
import {resetConnections} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings} from '../lib/plugin';
import {GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

// `/gcal avail` (admin only) runs the 5-minute status and reminder job for the calling user right
// away (engine/availability.go Sync). The job reads events overlapping the next 10 minutes, counts
// only busy events with attendees, and reminds about events starting 10 minutes from now (±5.5).

const MINUTE = 60_000;
const MEET_LINK = 'https://meet.google.com/abc-defg-hij';

/** An event from `startMin` to `endMin` minutes from now, as Google stores times (UTC, whole seconds). */
function eventAround(summary: string, startMin: number, endMin: number, extra: Record<string, unknown> = {}) {
    const at = (min: number) => new Date(Math.floor((Date.now() + (min * MINUTE)) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    return {summary, start: {dateTime: at(startMin)}, end: {dateTime: at(endMin)}, ...extra};
}

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
 * @objective Verify that the availability job sets Do Not Disturb while a meeting is running, and restores the status the user had set by hand once the meeting is gone
 *
 * @precondition
 * The user is a plugin admin, set to update their status to Do Not Disturb without confirmation; the Google connection is seeded directly into the plugin KV store
 */
test('sets Do Not Disturb during a running meeting and restores the manual status afterwards', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');

    // # Seed a connected plugin admin who wants Do Not Disturb during meetings, log in and set Away by hand
    // (after the page loads, which otherwise asks whether to switch back to Online)
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner, undefined, {UpdateStatusFromOptions: 'Do Not Disturb'});
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    await userClient.updateStatus({user_id: user.id, status: 'away'} as any);

    // # Put a meeting with a guest on the calendar that started 5 minutes ago
    const meeting = eventSummary(runId, 'Running meeting');
    await createFixtureEvent(owner, eventAround(meeting, -5, 25, {attendees: [{email: collab.email}]}));

    // # Run the availability job
    const command = new GcalCommand(channelsPage);
    await command.run('avail');

    // * Verify the plugin reports the change and the user is in Do Not Disturb
    await expect(command.reply('User was free, but is now busy (dnd). Set status to busy.')).toBeVisible();
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('dnd');

    // # Remove the meeting and run the job again
    await deleteEvents(owner, meeting);
    await command.run('avail');

    // * Verify the plugin restores the Away status the user had set before the meeting
    await expect(command.reply('User is no longer busy in calendar. Set status to previous status (away)')).toBeVisible();
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('away');
});

/**
 * @objective Verify that the availability job ignores events marked free and events without guests when setting the status
 *
 * @precondition
 * The user is a plugin admin, set to update their status to Do Not Disturb without confirmation; the Google connection is seeded directly into the plugin KV store
 */
test('leaves the status alone for events marked free and events without guests', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');

    // # Seed a connected plugin admin who wants Do Not Disturb during meetings, and set them online
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner, undefined, {UpdateStatusFromOptions: 'Do Not Disturb'});
    await userClient.updateStatus({user_id: user.id, status: 'online'} as any);

    // # Put a running event marked free (with a guest) and a running event without guests on the calendar
    await createFixtureEvent(owner, eventAround(eventSummary(runId, 'Focus time'), -5, 25, {attendees: [{email: collab.email}], transparency: 'transparent'}));
    await createFixtureEvent(owner, eventAround(eventSummary(runId, 'Lunch'), -5, 25));

    // # Run the availability job
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('avail');

    // * Verify the plugin finds no meeting and the user stays online
    await expect(command.reply('No events in local or remote. No status change.')).toBeVisible();
    expect((await adminClient.getStatus(user.id)).status).toBe('online');
});

/**
 * @objective Verify that the availability job sets an "In a meeting" custom status during a meeting and clears it once the meeting is gone
 *
 * @precondition
 * The user is a plugin admin with automatic custom status on; the Google connection is seeded directly into the plugin KV store
 */
test('sets an In a meeting custom status during a meeting and clears it afterwards', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');

    // # Seed a connected plugin admin who wants a custom status during meetings
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner, undefined, {SetCustomStatus: true});

    // # Put a running meeting with a guest on the calendar and run the availability job
    const meeting = eventSummary(runId, 'Design sync');
    const fixture = eventAround(meeting, -5, 25, {attendees: [{email: collab.email}]});
    await createFixtureEvent(owner, fixture);
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('avail');

    // * Verify the user's custom status is "In a meeting" with the calendar emoji, expiring when the meeting ends
    const customStatus = async () => (await adminClient.getUser(user.id)).props?.customStatus;
    await expect.poll(customStatus).toBeTruthy();
    const status = JSON.parse((await customStatus())!);
    expect(status).toMatchObject({emoji: 'calendar', text: 'In a meeting', duration: 'date_and_time'});
    expect(Date.parse(status.expires_at)).toBe(Date.parse(fixture.end.dateTime));

    // # Remove the meeting and run the job again
    await deleteEvents(owner, meeting);
    await command.run('avail');

    // * Verify the custom status is cleared
    await expect.poll(async () => {
        const raw = await customStatus();
        return raw ? JSON.parse(raw).text ?? '' : '';
    }).toBe('');
});

/**
 * @objective Verify that the availability job sends a reminder DM for an event starting in about ten minutes, with its time, location and Google Meet link
 *
 * @precondition
 * The user is a plugin admin with reminders on and no automatic status; the Google connection is seeded directly into the plugin KV store
 */
test('sends a reminder DM with the Meet link for an event starting in about ten minutes', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');
    test.skip(googleMode() === 'real', 'Fake Google only: real Google sets Meet links through conferenceData, which fixtures cannot set without creating a real meeting');

    // # Seed a connected plugin admin with reminders on
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner, undefined, {ReceiveReminders: true});

    // # Put a meeting starting in 8 minutes with a guest, a room and a Meet link on the calendar
    const meeting = eventSummary(runId, 'Customer call');
    await createFixtureEvent(owner, eventAround(meeting, 8, 38, {attendees: [{email: collab.email}], location: 'Room 7', hangoutLink: MEET_LINK}));
    await fakeGoogle.clearRequests();

    // # Run the availability job
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('avail');

    // * Verify the job read the next 10 minutes of the calendar
    const lists = (await fakeGoogle.requests()).filter((r) => r.methodId === 'calendar.events.list');
    expect(lists.length).toBeGreaterThan(0);
    const {timeMin, timeMax} = lists[0].query as Record<string, string>;
    expect(Date.parse(timeMax) - Date.parse(timeMin)).toBe(10 * MINUTE);

    // * Verify the bot sends one reminder with the event, its location and the Google Meet link
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    const reminder = botDM.reminder(meeting);
    await expect(reminder).toHaveCount(1);
    await expect(reminder).toContainText('Room 7');
    await expect(reminder).toContainText('Google Meet');
    await expect(botDM.eventTitleLink(reminder, meeting)).toHaveAttribute('href', MEET_LINK);
});

/**
 * @objective Verify that the availability job does not remind about an event it reads but that starts too soon for the reminder window (about ten minutes before the start)
 *
 * @precondition
 * The user is a plugin admin with reminders and automatic custom status on; the Google connection is seeded directly into the plugin KV store
 */
test('does not remind about a meeting that starts in two minutes', {tag: '@google_calendar'}, async ({pw}) => {
    const {owner, collab} = requireGoogle('owner', 'collab');

    // # Seed a connected plugin admin with reminders and custom status on, and a meeting starting in 2 minutes
    const {adminClient, user, team} = await pw.initSetup();
    await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), adminUserIds: user.id});
    await seedConnectedGoogleUser(user, owner, undefined, {ReceiveReminders: true, SetCustomStatus: true});
    const meeting = eventSummary(runId, 'Imminent meeting');
    await createFixtureEvent(owner, eventAround(meeting, 2, 32, {attendees: [{email: collab.email}]}));

    // # Run the availability job
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name);
    await channelsPage.toBeVisible();
    const command = new GcalCommand(channelsPage);
    await command.run('avail');

    // * Verify the job read the meeting: it set the In a meeting custom status
    await expect.poll(async () => {
        const raw = (await adminClient.getUser(user.id)).props?.customStatus;
        return raw ? JSON.parse(raw).text : '';
    }).toBe('In a meeting');

    // * Verify the bot sent no reminder for it
    const botDM = new GcalBotDM(channelsPage);
    await botDM.open(team.name);
    await expect(botDM.reminder(meeting)).toHaveCount(0);
});
