// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// The plugin's status and reminder job runs every 5 minutes on the clock (engine.StatusSyncJobInterval,
// scheduled with cluster.MakeWaitForRoundedInterval, so at :00, :05, ...). Reminders have no
// "already sent" record, and the job changes statuses, so a scheduled run in the middle of a test
// that runs the job itself with `/gcal avail` sends a second reminder or changes the reply.

const INTERVAL_MS = 5 * 60_000;
// Longer than an availability test takes from seeding to its last assertion.
const MARGIN_MS = 45_000;
// Time for the scheduled run to finish once it starts.
const SETTLE_MS = 10_000;

/** Waits past the next scheduled run of the status job when it is due within the margin. */
export async function avoidScheduledStatusJob() {
    const untilNext = INTERVAL_MS - (Date.now() % INTERVAL_MS);
    if (untilNext < MARGIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, untilNext + SETTLE_MS));
    }
}
