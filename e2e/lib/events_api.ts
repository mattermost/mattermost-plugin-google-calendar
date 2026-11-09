// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {APIResponse, Page} from '@playwright/test';

import {PLUGIN_ID} from './plugin';

/**
 * GET /plugins/<id>/api/v1/events/view as the logged-in browser user (the sidebar's data source,
 * calendar/api/events_view.go). Uses the page's session cookie.
 */
export function viewEvents(page: Page, from: Date, to: Date): Promise<APIResponse> {
    const params = new URLSearchParams({from: from.toISOString(), to: to.toISOString()});
    return page.request.get(`${process.env.PW_BASE_URL}/plugins/${PLUGIN_ID}/api/v1/events/view?${params}`, {
        headers: {'X-Requested-With': 'XMLHttpRequest'},
    });
}
