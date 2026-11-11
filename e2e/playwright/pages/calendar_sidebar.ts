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
        this.nextButton = this.container.getByRole('button', {name: 'Next'});

        // The event details popover (components/event_tooltip) renders outside the region.
        this.closeTooltipButton = this.page.getByRole('button', {name: 'Close event details'});
        this.tooltip = this.page.locator('.gcal-tooltip');
        this.joinMeetingLink = this.tooltip.getByRole('link', {name: 'Join'});
    }

    /**
     * Waits until the webapp has stored the plugin's provider configuration in Redux. The plugin
     * registers its sidebar and app bar button right after that (webapp/src/index.tsx setup), so an
     * absence check before it proves nothing.
     */
    async waitForProviderConfig() {
        await this.page.waitForFunction((reducer) => Boolean((window as any).store?.getState()?.[reducer]?.providerConfiguration), `plugins-${PLUGIN_ID}`);
    }

    /**
     * How many channel header and app bar components the plugin has registered with the webapp
     * (Redux `plugins.components`), whether or not they are rendered.
     */
    registeredButtons(): Promise<number> {
        return this.page.evaluate((pluginId) => {
            const components = (window as any).store?.getState()?.plugins?.components ?? {};
            return ['ChannelHeaderButton', 'AppBar', 'RightHandSidebarComponent']
                .flatMap((kind) => components[kind] ?? [])
                .filter((c: {pluginId?: string}) => c.pluginId === pluginId).length;
        }, PLUGIN_ID);
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

    /**
     * Opens an event's details popover. The popover closes on any scroll, and the scroll event from
     * bringing an off-screen event into view can land after the click (an event near midnight sits
     * below the initial scroll position), so scroll first and retry the click.
     */
    async openEvent(subject: string) {
        const event = this.event(subject);
        await event.scrollIntoViewIfNeeded();
        await expect(async () => {
            await event.click();
            await expect(this.closeTooltipButton).toBeVisible({timeout: 2_000});
        }).toPass();
    }

    /**
     * An empty half-hour slot of the day grid ("HH:MM"). The sidebar renders in the Mattermost user's
     * time zone (getCurrentTimezone), not the calendar's. FullCalendar has no accessible slots.
     */
    slot(time: string): Locator {
        return this.container.locator(`td.fc-timegrid-slot-lane[data-time="${time}:00"]`);
    }
}
