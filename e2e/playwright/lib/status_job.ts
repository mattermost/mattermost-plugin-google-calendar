// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// The plugin's status and reminder job runs every 5 minutes on the clock (engine.StatusSyncJobInterval,
// scheduled with cluster.MakeWaitForRoundedInterval, so at :00, :05, ...). Reminders have no
// "already sent" record, and the job changes statuses, so a scheduled run in the middle of a test
// that runs the job itself with `/gcal avail` sends a second reminder or changes the reply.

const INTERVAL_MS = 5 * 60_000;
// Longer than an availability test takes from seeding to its last assertion.
const MARGIN_MS = 60_000;
// Time for a scheduled run to finish once it starts.
const SETTLE_MS = 10_000;

/**
 * Call right before seeding the connected user (the job skips users who aren't connected). Waits
 * until the next scheduled run is at least the margin away and the last one has had time to finish.
 */
export async function avoidScheduledStatusJob() {
    const sinceLast = Date.now() % INTERVAL_MS;
    const untilNext = INTERVAL_MS - sinceLast;
    if (untilNext < MARGIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, untilNext + SETTLE_MS));
    } else if (sinceLast < SETTLE_MS) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS - sinceLast));
    }
}
