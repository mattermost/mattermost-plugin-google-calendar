export const MINUTE_STEP = 15;

// Latest selectable time in the day, matching the option constraints in TimeSelector.
const LATEST_TIME = '23:45';

// Slot used when a date is picked without a time of day, e.g. the all-day row.
const DEFAULT_START_TIME = '09:00';
const DEFAULT_DURATION_MINUTES = 30;

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Earliest selectable time for today, rounded up to the next MINUTE_STEP.
// Kept consistent with the option constraints in TimeSelector.
export function getEarliestTimeForToday(): string {
    const now = new Date();
    const roundedMinutes = Math.ceil(now.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    const hour = now.getHours() + Math.floor(roundedMinutes / 60);
    const minute = roundedMinutes % 60;

    // When rounding pushes past the end of the day (e.g. now >= 23:45), clamp to
    // the latest selectable time so lex comparisons don't treat every start time
    // as being in the past.
    if (hour >= 24) {
        return LATEST_TIME;
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Returns the start/end times to pre-fill for a date the user picked without a
 * time of day, keeping them selectable in TimeSelector for that date.
 */
export function getDefaultTimesForDate(date: string): {startTime: string; endTime: string} {
    const earliest = date === getTodayString() ? getEarliestTimeForToday() : '00:00';
    const startTime = earliest > DEFAULT_START_TIME ? earliest : DEFAULT_START_TIME;

    return {startTime, endTime: addMinutes(startTime, DEFAULT_DURATION_MINUTES)};
}

/** Adds minutes to an "HH:MM" string, clamping at the end of the day. */
function addMinutes(time: string, minutes: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = Math.min((hour * 60) + minute + minutes, (23 * 60) + 59);

    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
