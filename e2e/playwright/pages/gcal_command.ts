// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator, Response} from '@playwright/test';

/**
 * The `/gcal` slash command and the replies the plugin posts for it. Replies come from the
 * mscalendar engine (calendar/command/*.go) with the Google provider's names filled in.
 * Adapted from the MS Calendar suite's support/ui.ts (mattermost-plugin-mscalendar#565).
 */
export class GcalCommand {
    static readonly trigger = '/gcal';

    constructor(private readonly channelsPage: ChannelsPage) {}

    private get postCreate() {
        return this.channelsPage.centerView.postCreate;
    }

    /**
     * Sends `/gcal <args>` and waits for the server to finish handling it (same approach as
     * mattermost-server's demo plugin specs, sendDemoSlashCommand). Clicks send rather than
     * pressing Enter, which would pick an autocomplete suggestion.
     */
    async run(...args: string[]): Promise<Response> {
        const page = this.channelsPage.page;
        const executed = page.waitForResponse((r) => r.url().includes('/api/v4/commands/execute') && r.request().method() === 'POST');
        await this.send(...args);
        return executed;
    }

    /** Sends `/gcal <args>` without waiting for the server, for commands the webapp handles itself. */
    async send(...args: string[]) {
        await this.postCreate.input.fill([GcalCommand.trigger, ...args].join(' '));
        await this.postCreate.sendMessage();
    }

    /** The last post in the current channel containing `text` (ephemeral replies included). */
    reply(text: string | RegExp): Locator {
        return this.replies(text).last();
    }

    /** Every post in the current channel containing `text`, to count repeated replies. */
    replies(text: string | RegExp): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').filter({hasText: text});
    }

    /** The error Mattermost shows under the message box when a command fails (AppError from the plugin). */
    get commandFailed(): Locator {
        return this.channelsPage.page.getByText('Unable to execute command.');
    }

    /** Mattermost's error when no plugin has registered `/gcal` (the plugin is not running). */
    get commandNotFound(): Locator {
        return this.channelsPage.page.getByText(/Command with a trigger of '\/?gcal' not found/);
    }

    /** Every `/gcal help` reply listing a subcommand (calendar/command/help.go: "/gcal <subcommand> - <help text>"). */
    helpEntry(subcommand: string): Locator {
        return this.replies(`${GcalCommand.trigger} ${subcommand} - `);
    }

    /** Reply to `/gcal connect` when already connected (calendar/command/connect.go). */
    alreadyConnected(email: string): Locator {
        return this.reply(`Your Mattermost account is already connected to Google Calendar account ${email}`);
    }

    get disconnected(): Locator {
        return this.reply('Successfully disconnected your account');
    }

    /** Reply to commands that need a connected account (calendar/command/command.go getNotConnectedText). */
    get notConnected(): Locator {
        return this.reply('It looks like your Mattermost account is not connected to a Google Calendar account.');
    }

    /**
     * Every reply in the current channel saying the user was marked inactive (agenda commands answer
     * with store.ErrorUserInactive when the token cannot be refreshed because there is no refresh token
     * or Google rejects it).
     */
    get markedInactiveReplies(): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').filter({hasText: 'You have been marked inactive because your refresh token is expired.'});
    }

    /** Reply to `/gcal info` (calendar/command/info.go). */
    pluginInfo(version: string): Locator {
        return this.reply(`Mattermost Google Calendar plugin version: ${version}`);
    }

    /** `/gcal today` and `/gcal tomorrow` list an event by its title. */
    agendaWith(summary: string): Locator {
        return this.reply(summary);
    }

    /** Reply to admin-only subcommands from a user who is neither a plugin admin nor a system admin. */
    get notAuthorized(): Locator {
        return this.replies('Not authorized');
    }

    /** Reply to `/gcal summary` with no or an unknown action (calendar/command/daily_summary.go getDailySummaryHelp). */
    get summaryHelp(): Locator {
        return this.reply('Daily summary commands:');
    }

    /** Reply to the summary settings, time, enable and disable actions (dailySummaryResponse). */
    summaryConfigured(postTime: string, timeZone: string, enabled: boolean): Locator {
        const suffix = enabled ? '.' : ', but is disabled. Enable it with /gcal summary enable.';
        return this.replies(`Your daily summary is configured to show at ${postTime} ${timeZone}${suffix}`);
    }

    /** Agenda replies (today, tomorrow, summary view, viewcal) start with the time zone line (engine/views/calendar.go). */
    agendaInTimeZone(timeZone: string): Locator {
        return this.reply(`Times are shown in ${timeZone}`);
    }

    /**
     * An event's row in an agenda reply's table: "| 9:00AM - 10:00AM | [summary](link) |", or
     * "All day event" in the time column (engine/views/calendar.go renderEvent).
     */
    agendaRow(agenda: Locator, time: string, summary: string): Locator {
        return agenda.getByRole('row', {name: `${time} ${summary}`});
    }

    /** The link to the event in Google Calendar (the event's htmlLink). */
    eventLink(agenda: Locator, summary: string): Locator {
        return agenda.getByRole('link', {name: summary});
    }

    /** The agenda's first paragraph: the time zone line and the date heading, which depends on when the test runs. */
    agendaHeading(agenda: Locator): Locator {
        return agenda.getByRole('paragraph').first();
    }

    /** The current channel's last post, for asserting a whole agenda reply. */
    get lastPost(): Locator {
        return this.channelsPage.centerView.container.getByRole('listitem').last();
    }
}
