export const MINUTE_STEP = 15;

// Latest selectable time in the day, matching the option constraints in TimeSelector.
const LATEST_TIME = '23:45';

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
