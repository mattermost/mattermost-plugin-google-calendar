// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator, Page} from '@playwright/test';

import {BOT_USERNAME} from '../lib/plugin';

import {GcalCommand} from './gcal_command';
import {GoogleConsentPage} from './google_consent_page';

/**
 * The DM channel with the Google Calendar bot (`@gcal`): the connect prompt, the welcome flow and
 * account notices. Texts from the mscalendar engine (engine/welcomer.go, store/user_store.go).
 * Adapted from the MS Calendar suite's support/bot_dm.ts.
 */
export class GcalBotDM {
    constructor(private readonly channelsPage: ChannelsPage) {}

    async open(teamName: string) {
        await this.channelsPage.goto(teamName, `@${BOT_USERNAME}`);
        await this.channelsPage.toBeVisible();
    }

    private post(text: string | RegExp): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').filter({hasText: text});
    }

    /** "Click here to link your account." in the bot's Connect message. */
    get connectLink(): Locator {
        return this.channelsPage.centerView.container.getByRole('link', {name: 'Click here to link your account.'}).last();
    }

    /** The Connect message after a successful connect (engine/welcomer.go newConnectedAttachment). */
    connectedConfirmation(email: string): Locator {
        return this.post(`Congratulations! Your Google Calendar account (${email}) has been connected to Mattermost.`).last();
    }

    /** DMs telling the user they were marked inactive (store/user_store.go ErrorUserInactive). */
    get inactiveNotices(): Locator {
        return this.post('You have been marked inactive because your refresh token is expired.');
    }

    /** The bot's connect prompt post (the one with the connect link). */
    get connectPrompt(): Locator {
        return this.post('Click here to link your account.').last();
    }

    /** The start-end time line of an event attachment, which depends on when the test runs. */
    eventTimeLine(post: Locator): Locator {
        return post.getByText(/^\d{1,2}:\d{2}[AP]M - \d{1,2}:\d{2}[AP]M/);
    }

    /** A setting in the settings panel the bot posts for `/gcal settings` (calendar/utils/settingspanel). */
    setting(title: string): Locator {
        return this.post(`Setting: ${title}`).last();
    }

    /** One setting's attachment inside the settings panel post (the panel is one post with an attachment per setting). */
    settingCard(title: string): Locator {
        // Mattermost 12 renders message attachments as bordered mm-blocks containers.
        return this.setting(title).locator('.mm-blocks-container--border').filter({hasText: `Setting: ${title}`});
    }

    /** Every setting title in the bot DM, in order (to assert which settings the provider offers). */
    settingTitles(): Locator {
        return this.channelsPage.centerView.container.getByText(/^Setting: /);
    }

    /**
     * Reminder DMs for an event (engine/availability.go notifyUpcomingEvents): an attachment titled
     * with the event, its time, location and, for Meet events, a "Google Meet" field.
     */
    reminder(summary: string): Locator {
        return this.post(summary);
    }

    /** The attachment title, which links to the meeting URL when the event has one. */
    eventTitleLink(post: Locator, summary: string): Locator {
        return post.getByRole('link', {name: summary});
    }

    /** DM after creating an event that is not linked to a channel (calendar/api/events.go createEvent). */
    get eventCreated(): Locator {
        return this.post('Your event was created successfully.').last();
    }

    /**
     * Clicks the connect link for a connect that fails inside the plugin before reaching Google,
     * and returns the error page the popup shows.
     */
    async startConnectExpectingError(): Promise<Locator> {
        const popupPromise = this.channelsPage.page.waitForEvent('popup');
        await this.connectLink.click();
        const popup = await popupPromise;
        await popup.waitForLoadState();
        return popup.locator('body');
    }

    /**
     * Clicks the connect link, which the webapp opens in a new tab (Mattermost opens /plugins/ links
     * outside the app), and returns the Google sign-in page that the plugin redirects it to.
     */
    async startConnect(): Promise<GoogleConsentPage> {
        const popupPromise = this.channelsPage.page.waitForEvent('popup');
        await this.connectLink.click();
        return new GoogleConsentPage(await popupPromise);
    }
}

/**
 * Connects the logged-in user through the bot's connect link and Google's consent pages (on the
 * fake), and waits for the bot to confirm.
 */
export async function connectThroughGoogle(channelsPage: ChannelsPage, teamName: string, googleEmail: string): Promise<Page> {
    const command = new GcalCommand(channelsPage);
    const botDM = new GcalBotDM(channelsPage);

    // `/gcal connect` posts the connect prompt in the bot DM and switches to it.
    await command.run('connect');
    await botDM.open(teamName);
    const consent = await botDM.startConnect();
    await consent.chooseAccount(googleEmail);
    await consent.allow();

    await expect(botDM.connectedConfirmation(googleEmail)).toBeVisible();
    return consent.page;
}
