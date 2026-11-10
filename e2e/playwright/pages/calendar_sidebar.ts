// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator, Page} from '@playwright/test';

import {PLUGIN_ID, PROVIDER_DISPLAY_NAME} from '../lib/plugin';

// The plugin id contains dots, so an #id selector would parse them as classes.
const APP_BAR_ICON = `[id="app-bar-icon-${PLUGIN_ID}"]`;

/**
 * The experimental calendar sidebar (EnableExperimentalUI; webapp/src/components/calendar_sidebar).
 * Adapted from the MS Calendar suite's support/calendar_sidebar.ts. The sidebar root is a region
 * named "Google Calendar" in every state (loading, connect prompt, calendar).
 */
export class CalendarSidebar {
    readonly page: Page;
    readonly appBarIcon: Locator;
    readonly container: Locator;
    readonly connectButton: Locator;
    readonly welcome: Locator;
    readonly refreshButton: Locator;
    readonly nextButton: Locator;
    readonly tooltip: Locator;
    readonly joinMeetingLink: Locator;
    readonly closeTooltipButton: Locator;

    constructor(channelsPage: ChannelsPage) {
        this.page = channelsPage.page;

        // Mattermost renders the app-bar button without an accessible name.
        this.appBarIcon = channelsPage.appBar.container.locator(APP_BAR_ICON);

        this.container = this.page.getByRole('region', {name: PROVIDER_DISPLAY_NAME});
        this.connectButton = this.container.getByRole('link', {name: 'Connect account'});
        this.welcome = this.container.getByText(`Welcome to ${PROVIDER_DISPLAY_NAME}`);
        this.refreshButton = this.container.getByRole('button', {name: 'Refresh'});
        this.nextButton = this.container.getByRole('button', {name: 'Next'});

        // The event details popover (components/event_tooltip) renders outside the region.
        this.closeTooltipButton = this.page.getByRole('button', {name: 'Close event details'});
        this.tooltip = this.page.locator('.gcal-tooltip');
        this.joinMeetingLink = this.tooltip.getByRole('link', {name: 'Join'});
    }

    /** Opens the sidebar from its app bar button and waits until it has loaded. */
    async open() {
        await this.appBarIcon.click();
        await expect(this.container).toBeVisible();
        await expect(this.container.getByText('Loading...')).toBeHidden();
    }

    /** An event block in the calendar grid (FullCalendar renders the title as text). */
    event(subject: string): Locator {
        return this.container.getByText(subject, {exact: true});
    }

    /** Opens an event's details popover. */
    async openEvent(subject: string) {
        await this.event(subject).click();
        await expect(this.closeTooltipButton).toBeVisible();
    }

    /** An empty half-hour slot of the day grid ("HH:MM", calendar time zone). FullCalendar has no accessible slots. */
    slot(time: string): Locator {
        return this.container.locator(`td.fc-timegrid-slot-lane[data-time="${time}:00"]`);
    }
}
