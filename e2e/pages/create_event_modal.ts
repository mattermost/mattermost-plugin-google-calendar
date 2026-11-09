// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator, Page} from '@playwright/test';

import {GcalCommand} from './gcal_command';

/**
 * The "Create Calendar Event" dialog (webapp/src/components/modals/create_event_modal.tsx). Copied
 * from the MS Calendar suite's support/create_event_modal.ts; the engine's webapp is the same.
 * Time pickers list 24-hour "HH:MM" options in 15-minute steps (components/time_selector.tsx);
 * choosing a start time sets the end time 30 minutes later.
 */
export class CreateEventModal {
    readonly page: Page;
    readonly container: Locator;
    readonly subjectInput: Locator;
    readonly dateInput: Locator;
    readonly startTimeInput: Locator;
    readonly endTimeInput: Locator;
    readonly locationInput: Locator;
    readonly descriptionInput: Locator;
    readonly channelInput: Locator;
    readonly guestsInput: Locator;
    readonly createButton: Locator;
    readonly error: Locator;

    constructor(private readonly channelsPage: ChannelsPage) {
        this.page = channelsPage.page;
        this.container = this.page.getByRole('dialog').filter({has: this.page.getByRole('heading', {name: 'Create Calendar Event'})});
        this.subjectInput = this.container.getByRole('textbox', {name: 'Subject'});
        this.dateInput = this.container.getByRole('textbox', {name: 'Date'});
        this.startTimeInput = this.container.getByRole('combobox', {name: 'Start Time'});
        this.endTimeInput = this.container.getByRole('combobox', {name: 'End Time'});
        this.locationInput = this.container.getByRole('textbox', {name: 'Location (optional)'});
        this.descriptionInput = this.container.getByRole('textbox', {name: 'Description (optional)'});
        this.channelInput = this.container.getByRole('combobox', {name: 'Link event to channel (optional)'});
        this.guestsInput = this.container.getByRole('combobox', {name: 'Guests'});
        this.createButton = this.container.getByRole('button', {name: 'Create', exact: true});
        this.error = this.container.getByRole('alert');
    }

    /**
     * The channel menu entry the plugin registers (webapp/src/index.tsx registerChannelHeaderMenuAction),
     * which Mattermost lists under the channel menu's "More actions" submenu.
     */
    async openFromChannelMenu() {
        await this.channelsPage.centerView.header.openChannelMenu();
        await this.page.getByRole('menuitem', {name: 'More actions'}).hover();
        await this.page.getByRole('menuitem', {name: 'Create calendar event'}).click();
        await expect(this.container).toBeVisible();
    }

    /** `/gcal event create`, which the webapp intercepts before it reaches the server (plugin_hooks.ts). */
    async openFromCommand() {
        await new GcalCommand(this.channelsPage).send('event', 'create');
        await expect(this.container).toBeVisible();
    }

    /** Sends `/gcal event create` without waiting for the dialog (it does not open for a user who is not connected). */
    async sendCreateCommand() {
        await new GcalCommand(this.channelsPage).send('event', 'create');
    }

    /** The ephemeral notice the webapp posts instead of opening the dialog (plugin_hooks.ts checkUserIsConnected). */
    get notConnectedNotice(): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').filter({hasText: 'Your Mattermost account is not connected to Google Calendar. In order to create a calendar event please connect your account first'});
    }

    /** The channel post announcing a linked event (calendar/api/events.go createEvent). */
    linkedAnnouncement(summary: string, username: string): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').filter({hasText: `The event ${summary} was linked to this channel by @${username}`});
    }

    async chooseStartTime(time: string) {
        await this.startTimeInput.click();
        await this.page.keyboard.type(time);
        await this.page.keyboard.press('Enter');
    }

    // The guest selector accepts plain email addresses once the user lookup has answered.
    async addGuest(email: string) {
        await this.guestsInput.click();
        const lookup = this.page.waitForResponse((response) => response.url().includes('/autocomplete/users'));
        await this.page.keyboard.type(email);
        await lookup;
        await this.page.keyboard.press('Enter');
        await expect(this.guest(email)).toBeVisible();
    }

    /**
     * Picks a connected Mattermost user from the guest suggestions (the plugin's
     * /autocomplete/users searches its connected-user index); the plugin invites their Google account.
     */
    async addConnectedGuest(search: string, displayName: string) {
        await this.guestsInput.click();
        const lookup = this.page.waitForResponse((response) => response.url().includes('/autocomplete/users'));
        await this.page.keyboard.type(search);
        await lookup;
        await this.page.getByRole('option', {name: displayName}).click();
        await expect(this.guest(displayName)).toBeVisible();
    }

    /** The channel the event will be linked to, shown in the channel selector. */
    linkedChannel(displayName: string) {
        return this.container.getByText(displayName, {exact: true});
    }

    /** Removes the linked channel, so the plugin DMs the organizer instead of posting in a channel. */
    async clearLinkedChannel() {
        await this.channelInput.focus();
        await this.page.keyboard.press('Backspace');
    }

    guest(email: string) {
        return this.container.getByText(email).first();
    }
}
