// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

/**
 * Google's sign-in and consent pages in the connect popup, as the fake Google serves them on
 * https://accounts.google.com (fake-google/server.ts authorize/consent). Real Google blocks
 * automated sign-in, so only the fake lane drives these pages.
 */
export class GoogleConsentPage {
    readonly chooseAccountHeading: Locator;
    readonly grantHeading: Locator;
    readonly allowButton: Locator;
    readonly cancelButton: Locator;

    constructor(readonly page: Page) {
        this.chooseAccountHeading = page.getByRole('heading', {name: 'Choose an account'});
        this.grantHeading = page.getByRole('heading', {name: /wants access to your Google Account/});
        this.allowButton = page.getByRole('button', {name: 'Allow', exact: true});
        this.cancelButton = page.getByRole('button', {name: 'Cancel', exact: true});
    }

    async chooseAccount(email: string) {
        await expect(this.chooseAccountHeading).toBeVisible();
        await this.page.getByRole('button', {name: new RegExp(`\\(${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`)}).click();
        await expect(this.grantHeading).toBeVisible();
    }

    /** Grants access. The plugin's /oauth2/complete page then closes the popup itself. */
    async allow() {
        const closed = this.page.waitForEvent('close');
        await this.allowButton.click();
        await closed;
    }

    /** Denies access. Google sends the popup back to the plugin with error=access_denied. */
    async cancel() {
        const callback = this.page.waitForResponse((r) => r.url().includes('/oauth2/complete'));
        await this.cancelButton.click();
        return callback;
    }
}
