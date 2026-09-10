export const MINUTE_STEP = 15;

// Latest selectable time in the day, matching the option constraints in TimeSelector.
const LATEST_TIME = '23:45';

// Slot used when a date is picked without a time of day, e.g. the all-day row.
const DEFAULT_START_TIME = '09:00';
const DEFAULT_DURATION_MINUTES = 30;

interface ZonedNow {
    date: string;
    hour: number;
    minute: number;
    secondsIntoMinute: number;
}

/**
 * Reads the current wall clock in the calendar's timezone, falling back to the
 * browser's when none is configured or the timezone isn't recognised.
 */
function getZonedNow(timeZone?: string): ZonedNow {
    const now = new Date();
    const secondsIntoMinute = now.getSeconds() + (now.getMilliseconds() / 1000);

    if (timeZone && timeZone !== 'local') {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone,
                hourCycle: 'h23',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }).formatToParts(now);
            const partValue = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

            return {
                date: `${partValue('year')}-${partValue('month')}-${partValue('day')}`,
                hour: Number(partValue('hour')),
                minute: Number(partValue('minute')),
                secondsIntoMinute,
            };
        } catch {
            // Fall through to the browser's timezone.
        }
    }

    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return {
        date: `${now.getFullYear()}-${month}-${day}`,
        hour: now.getHours(),
        minute: now.getMinutes(),
        secondsIntoMinute,
    };
}

/** Returns today's date as "YYYY-MM-DD" in the calendar's timezone. */
export function getTodayString(timeZone?: string): string {
    return getZonedNow(timeZone).date;
}

/**
 * Returns the next selectable time step, rounding a partially elapsed minute up
 * so the result is never in the past. The hour rolls past 23 near the end of the
 * day, which callers handle themselves.
 */
export function getNextTimeStep(timeZone?: string): {hour: number; minute: number} {
    const now = getZonedNow(timeZone);
    const roundedMinutes = Math.ceil((now.minute + (now.secondsIntoMinute / 60)) / MINUTE_STEP) * MINUTE_STEP;

    return {
        hour: now.hour + Math.floor(roundedMinutes / 60),
        minute: roundedMinutes % 60,
    };
}

// Earliest selectable time for today, rounded up to the next MINUTE_STEP.
// Kept consistent with the option constraints in TimeSelector.
export function getEarliestTimeForToday(timeZone?: string): string {
    const {hour, minute} = getNextTimeStep(timeZone);

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
export function getDefaultTimesForDate(date: string, timeZone?: string): {startTime: string; endTime: string} {
    const earliest = date === getTodayString(timeZone) ? getEarliestTimeForToday(timeZone) : '00:00';
    const startTime = earliest > DEFAULT_START_TIME ? earliest : DEFAULT_START_TIME;

    return {startTime, endTime: addMinutes(startTime, DEFAULT_DURATION_MINUTES)};
}

/** Adds minutes to an "HH:MM" string, clamping at the end of the day. */
function addMinutes(time: string, minutes: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = Math.min((hour * 60) + minute + minutes, (23 * 60) + 59);

    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
