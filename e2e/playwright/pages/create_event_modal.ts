// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator, Page} from '@playwright/test';

import {GcalCommand} from './gcal_command';

/**
 * The "Create Calendar Event" dialog (webapp/src/components/modals/create_event_modal.tsx). Copied
 * from the MS Calendar suite's support/create_event_modal.ts; the engine's webapp is the same.
 * Time pickers list 24-hour "HH:MM" options in 15-minute steps (components/time_selector.tsx);
 * choosing a start time sets the end time 30 minutes later. The fields are compass-ui components:
 * the date is a DateRangePicker (components/date_input.tsx), the times are Selects, and guests and
 * channel are Comboboxes.
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

    constructor(private readonly channelsPage: ChannelsPage) {
        this.page = channelsPage.page;
        this.container = this.page.getByRole('dialog').filter({has: this.page.getByRole('heading', {name: 'Create Calendar Event'})});
        this.subjectInput = this.container.getByRole('textbox', {name: 'Subject'});

        // The DateRangePicker trigger takes its accessible name from the date it shows, not the field
        // label, so it is found by the id the form gives it.
        this.dateInput = this.container.locator('[id="date"]');
        this.startTimeInput = this.container.getByRole('combobox', {name: 'Start Time'});
        this.endTimeInput = this.container.getByRole('combobox', {name: 'End Time'});
        this.locationInput = this.container.getByRole('textbox', {name: 'Location (optional)'});
        this.descriptionInput = this.container.getByRole('textbox', {name: 'Description (optional)'});
        this.channelInput = this.container.getByRole('combobox', {name: 'Link event to channel (optional)'});
        this.guestsInput = this.container.getByRole('combobox', {name: 'Guests'});
        this.createButton = this.container.getByRole('button', {name: 'Create', exact: true});
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

    /**
     * Picks an ISO "YYYY-MM-DD" date in the date picker. The picker names its month grid "<Month> <Year>"
     * and each day button with its ISO date, and closes once a day is chosen.
     */
    async chooseDate(date: string) {
        await this.dateInput.click();
        const picker = this.page.getByRole('dialog', {name: 'Date picker'});
        const shown = new Date(`${await picker.getByRole('grid').getAttribute('aria-label')} 1`);
        const [year, month] = date.split('-').map(Number);
        const offset = ((year - shown.getFullYear()) * 12) + (month - 1 - shown.getMonth());
        const pager = picker.getByRole('button', {name: offset > 0 ? 'Next month' : 'Previous month'});
        for (let i = 0; i < Math.abs(offset); i++) {
            await pager.click();
        }
        await picker.getByRole('button', {name: date, exact: true}).click();
        await expect(this.dateInput).toHaveText(pickerDate(date));
    }

    async chooseStartTime(time: string) {
        await this.startTimeInput.click();
        await this.page.getByRole('listbox', {name: 'Start time'}).getByRole('option', {name: time, exact: true}).click();
    }

    /**
     * Picks a connected Mattermost user from the guest suggestions (the plugin's
     * /autocomplete/users searches its connected-user index); the plugin invites their Google account.
     */
    async addConnectedGuest(search: string, displayName: string) {
        await this.guestsInput.click();
        const lookup = this.page.waitForResponse((response) => response.url().includes(`/autocomplete/users?search=${encodeURIComponent(search)}`));
        await this.page.keyboard.type(search);
        await lookup;
        await this.page.getByRole('option', {name: displayName}).click();
        await expect(this.guest(displayName)).toBeVisible();
    }

    /** Removes the linked channel, so the plugin DMs the organizer instead of posting in a channel. */
    async clearLinkedChannel() {
        // The channel selector is the only clearable field.
        await this.container.getByRole('button', {name: 'Clear', exact: true}).click();
        await expect(this.channelInput).toHaveValue('');

        // Clearing focuses the input and opens its suggestions, which would cover the dialog's footer.
        await this.page.keyboard.press('Tab');
        await expect(this.channelInput).toHaveAttribute('aria-expanded', 'false');
    }

    guest(email: string) {
        return this.container.getByText(email).first();
    }
}

/** How the date picker's trigger shows an ISO "YYYY-MM-DD" date. */
export function pickerDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${month}/${day}/${year}`;
}
