// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type ChannelsPage} from '@mattermost/playwright-lib';
import type {Locator} from '@playwright/test';

import {GcalBotDM} from './gcal_bot_dm';
import {GcalCommand} from './gcal_command';

/**
 * `/gcal settings` posts every setting as a block in one interactive bot message
 * (engine/settings_panel). Copied from the MS Calendar suite's support/bot_dm.ts BotSettings.
 */
export class BotSettings {
    constructor(private readonly channelsPage: ChannelsPage) {}

    async open(teamName: string) {
        await new GcalCommand(this.channelsPage).run('settings');
        await new GcalBotDM(this.channelsPage).open(teamName);
    }

    // Blocks have no role, so pick the innermost element holding both the title and its controls.
    setting(title: string): Locator {
        const page = this.channelsPage.page;
        const controls = page.getByRole('button').or(page.getByRole('combobox'));
        return this.channelsPage.centerView.container.
            locator('div').
            filter({has: page.getByText(`Setting: ${title}`, {exact: true})}).
            filter({has: controls}).
            last();
    }

    async chooseButton(title: string, value: string) {
        const setting = this.setting(title);
        await setting.getByRole('button', {name: value, exact: true}).click();
        await expect(setting).toContainText(`Current value: ${value}`);
    }

    async chooseOption(title: string, option: string) {
        const setting = this.setting(title);
        await setting.getByRole('combobox').click();
        await this.channelsPage.page.getByRole('option', {name: option, exact: true}).click();
        await expect(setting).toContainText(option);
    }
}
