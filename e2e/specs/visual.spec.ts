// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Screenshot baselines of what the plugin renders: the create-event dialog, the sidebar and its
// event details, and the bot's posts. Run with `npm run test:visual`; after an intended UI change,
// run `npm run test:visual-update-snapshots` and review the PNGs in visual.spec.ts-snapshots/.
// Event names are fixed (no [e2e-<runId>] prefix) because they appear in the screenshots; the
// visual stack is thrown away after each run, so nothing needs cleaning up. Text that depends on
// the day the test runs (agenda date headings, reminder times) is masked.

import {expect, test, type PlaywrightExtended} from '@mattermost/playwright-lib';

import {requireGoogle, seedConnectedGoogleUser} from '../lib/google/auth';
import {allDayEvent, createFixtureEvent, dateIn, timedEvent} from '../lib/google/events';
import {googleMode} from '../lib/google/mode';
import {resetConnections, type UserSettings} from '../lib/kv';
import {ensureGcalPlugin, googleOAuthSettings} from '../lib/plugin';
import {routeExternalRequests, settle} from '../lib/visual';
import {CalendarSidebar} from '../pages/calendar_sidebar';
import {CreateEventModal} from '../pages/create_event_modal';
import {GcalBotDM} from '../pages/gcal_bot_dm';
import {GcalCommand} from '../pages/gcal_command';

// The sidebar renders "now" and the create dialog prefills today's date from the browser clock, so
// those tests freeze it on a fixed day.
const FIXED_NOW = new Date('2027-01-15T10:20:00Z');
const FIXED_DAY = '2027-01-15';
// Events created through the dialog go on another day, so they never show in the sidebar baselines.
const CREATED_DAY = '2027-02-10';
const MEET_LINK = 'https://meet.google.com/abc-defg-hij';
const SETTINGS = ['Update Status', 'Get Confirmation', 'Set Custom Status', 'Receive Reminders', 'Daily Summary'];

test.describe('visual', {tag: '@visual'}, () => {
    test.skip(!process.env.PW_VISUAL_BROWSER_WS, 'Baselines only match the dockerized browser (npm run test:visual).');
    test.skip(googleMode() !== 'fake', 'Visual tests run against the fake Google only.');

    test.beforeEach(async () => {
        await resetConnections();
    });

    /**
     * Enables the plugin (with the experimental sidebar), optionally connects a regular user to the
     * owner account, and opens Town Square in their browser, with the clock frozen if asked.
     */
    async function openTownSquare(pw: PlaywrightExtended, options: {connected?: boolean; settings?: Partial<UserSettings>; adminUser?: boolean; frozenAt?: Date} = {}) {
        const {owner} = requireGoogle('owner');
        const {adminClient, user, team} = await pw.initSetup();
        await ensureGcalPlugin(adminClient, {...googleOAuthSettings(), enableExperimentalUI: true, adminUserIds: options.adminUser ? user.id : ''});
        if (options.connected ?? true) {
            await seedConnectedGoogleUser(user, owner, undefined, options.settings);
        }
        const {page, channelsPage} = await pw.testBrowser.login(user);
        await routeExternalRequests(page);
        if (options.frozenAt) {
            await page.clock.setFixedTime(options.frozenAt);
        }
        await channelsPage.goto(team.name);
        await channelsPage.toBeVisible();
        return {page, channelsPage, team, user, owner};
    }

    /**
     * @objective Verify the create-event dialog renders like the baselines, empty and filled in
     *
     * @precondition
     * Run through `npm run test:visual`, which provides the fake Google and the dockerized browser the baselines come from
     */
    test('matches baselines for the create-event dialog', {tag: '@google_calendar'}, async ({pw}) => {
        // # Open the dialog (on a fixed day: the empty form prefills today's date)
        const {channelsPage} = await openTownSquare(pw, {frozenAt: FIXED_NOW});
        const modal = new CreateEventModal(channelsPage);
        await modal.openFromCommand();
        await modal.clearLinkedChannel();
        await settle(pw, modal.container);

        // * Verify the empty dialog matches the baseline
        await expect(modal.container).toHaveScreenshot('create-event-dialog-empty.png');

        // # Fill in an event
        await modal.subjectInput.fill('Quarterly planning');
        await modal.dateInput.fill(CREATED_DAY);
        await modal.chooseStartTime('10:00');
        await modal.locationInput.fill('Room 4');
        await modal.descriptionInput.fill('Goals for the next quarter');
        await settle(pw, modal.container);

        // * Verify the filled dialog matches the baseline
        await expect(modal.container).toHaveScreenshot('create-event-dialog-filled.png');
    });

    /**
     * @objective Verify the bot's event-created DM renders like the baseline
     *
     * @precondition
     * Run through `npm run test:visual`, which provides the fake Google and the dockerized browser the baselines come from
     */
    test('matches the baseline for the event-created DM', {tag: '@google_calendar'}, async ({pw}) => {
        // # Create an event on a fixed day without a channel
        const {channelsPage, team} = await openTownSquare(pw);
        const modal = new CreateEventModal(channelsPage);
        await modal.openFromCommand();
        await modal.subjectInput.fill('Quarterly planning');
        await modal.dateInput.fill(CREATED_DAY);
        await modal.chooseStartTime('10:00');
        await modal.locationInput.fill('Room 4');
        await modal.clearLinkedChannel();
        await modal.createButton.click();
        await expect(modal.container).toBeHidden();

        // # Open the bot DM
        const botDM = new GcalBotDM(channelsPage);
        await botDM.open(team.name);
        await expect(botDM.eventCreated).toContainText('Quarterly planning');
        await settle(pw, botDM.eventCreated);

        // * Verify the DM matches the baseline
        await expect(botDM.eventCreated).toHaveScreenshot('event-created-dm.png');
    });

    /**
     * @objective Verify the bot's connect prompt and settings panel render like the baselines
     *
     * @precondition
     * Run through `npm run test:visual`, which provides the fake Google and the dockerized browser the baselines come from
     */
    test('matches baselines for the connect prompt and the settings panel', {tag: '@google_calendar'}, async ({pw}) => {
        // # Ask a user who is not connected to connect, and open the bot DM
        const {channelsPage, team, user, owner} = await openTownSquare(pw, {connected: false});
        const command = new GcalCommand(channelsPage);
        const botDM = new GcalBotDM(channelsPage);
        await command.run('connect');
        await botDM.open(team.name);
        await settle(pw, botDM.connectPrompt);

        // * Verify the connect prompt matches the baseline
        await expect(botDM.connectPrompt).toHaveScreenshot('connect-prompt-dm.png');

        // # Seed the connection and ask for the settings panel
        await seedConnectedGoogleUser(user, owner);
        await channelsPage.goto(team.name);
        await command.run('settings');
        await botDM.open(team.name);
        await expect(botDM.setting(SETTINGS[SETTINGS.length - 1])).toBeVisible();

        // * Verify each setting matches its baseline (the panel is one post, taller than the viewport)
        for (const [i, title] of SETTINGS.entries()) {
            const card = botDM.settingCard(title);
            await card.scrollIntoViewIfNeeded();
            await settle(pw, card);
            await expect(card).toHaveScreenshot(`settings-panel-${i + 1}.png`);
        }
    });

    /**
     * @objective Verify today's agenda renders like the baseline, with timed and all-day events
     *
     * @precondition
     * Run through `npm run test:visual`, which provides the fake Google and the dockerized browser the baselines come from
     */
    test('matches the baseline for today\'s agenda', {tag: '@google_calendar'}, async ({pw}) => {
        // # Put a timed and an all-day event on today's calendar and ask for today's agenda
        const {channelsPage, owner} = await openTownSquare(pw);
        const today = dateIn('UTC');
        await createFixtureEvent(owner, timedEvent('Standup', today, '09:00', '09:15', 'UTC'));
        await createFixtureEvent(owner, timedEvent('Design review', today, '14:00', '15:00', 'UTC'));
        await createFixtureEvent(owner, allDayEvent('Team offsite', today));
        const command = new GcalCommand(channelsPage);
        await command.run('today');
        const agenda = command.agendaInTimeZone('UTC');
        await expect(command.agendaRow(agenda, '9:00AM - 9:15AM', 'Standup')).toBeVisible();
        await settle(pw, agenda);

        // * Verify the agenda matches the baseline, apart from the date heading
        await expect(agenda).toHaveScreenshot('today-agenda.png', {mask: [command.agendaHeading(agenda)]});
    });

    /**
     * @objective Verify the reminder DM renders like the baseline, with the location and the Google Meet link
     *
     * @precondition
     * Run through `npm run test:visual`, which provides the fake Google and the dockerized browser the baselines come from
     */
    test('matches the baseline for the reminder DM', {tag: '@google_calendar'}, async ({pw}) => {
        const {collab} = requireGoogle('collab');

        // # Put a meeting starting in 8 minutes on the calendar and run the availability job as a plugin admin with reminders on
        const {channelsPage, team, owner} = await openTownSquare(pw, {adminUser: true, settings: {ReceiveReminders: true}});
        const at = (min: number) => new Date(Math.floor((Date.now() + (min * 60_000)) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
        await createFixtureEvent(owner, {summary: 'Customer call', start: {dateTime: at(8)}, end: {dateTime: at(38)}, location: 'Room 7', attendees: [{email: collab.email}], hangoutLink: MEET_LINK});
        await new GcalCommand(channelsPage).run('avail');

        // # Open the bot DM
        const botDM = new GcalBotDM(channelsPage);
        await botDM.open(team.name);
        const reminder = botDM.reminder('Customer call');
        await expect(reminder).toBeVisible();
        await settle(pw, reminder);

        // * Verify the reminder matches the baseline, apart from its start and end times
        await expect(reminder).toHaveScreenshot('reminder-dm.png', {mask: [botDM.eventTimeLine(reminder)]});
    });

    /**
     * @objective Verify the sidebar renders like the baselines: the connect prompt, a day with events, and an event's details
     *
     * @precondition
     * Run through `npm run test:visual`; the browser clock is frozen on a fixed day so the day view and its now line do not move
     */
    test('matches baselines for the calendar sidebar', {tag: '@google_calendar'}, async ({pw}) => {
        const {owner, collab} = requireGoogle('owner', 'collab');

        // # Open the sidebar as a user who is not connected
        const notConnected = await openTownSquare(pw, {connected: false, frozenAt: FIXED_NOW});
        let sidebar = new CalendarSidebar(notConnected.channelsPage);
        await sidebar.open();
        await settle(pw, sidebar.container);

        // * Verify the connect prompt matches the baseline
        await expect(sidebar.container).toHaveScreenshot('sidebar-connect-prompt.png');

        // # Put a meeting with a Meet link and an all-day event on the fixed day, and open the sidebar as a connected user
        await createFixtureEvent(owner, timedEvent('Sprint review', FIXED_DAY, '10:00', '11:00', 'UTC', {location: 'Room 9', attendees: [{email: collab.email}], hangoutLink: MEET_LINK}));
        await createFixtureEvent(owner, allDayEvent('Release day', FIXED_DAY));
        const connected = await openTownSquare(pw, {frozenAt: FIXED_NOW});
        sidebar = new CalendarSidebar(connected.channelsPage);
        await sidebar.open();
        await expect(sidebar.event('Sprint review')).toBeVisible();
        await settle(pw, sidebar.container);

        // * Verify the day view matches the baseline
        await expect(sidebar.container).toHaveScreenshot('sidebar-day.png');

        // # Open the meeting's details
        await sidebar.openEvent('Sprint review');
        await settle(pw, sidebar.tooltip);

        // * Verify the event details match the baseline
        await expect(sidebar.tooltip).toHaveScreenshot('sidebar-event-details.png');
    });
});
