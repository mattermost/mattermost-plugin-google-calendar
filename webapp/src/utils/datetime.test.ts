import {getDefaultTimesForDate, getEarliestTimeForToday, getTodayString} from './datetime';

const setNow = (hours: number, minutes: number, seconds = 0) => {
    jest.useFakeTimers();
    const now = new Date();
    now.setHours(hours, minutes, seconds, 0);
    jest.setSystemTime(now);
};

const setInstant = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
};

describe('getEarliestTimeForToday', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('rounds up to the next 15-minute step', () => {
        setNow(9, 1);
        expect(getEarliestTimeForToday()).toBe('09:15');
    });

    it('keeps the time when already on a step boundary', () => {
        setNow(9, 30);
        expect(getEarliestTimeForToday()).toBe('09:30');
    });

    it('rolls the hour over when rounding crosses the hour', () => {
        setNow(9, 46);
        expect(getEarliestTimeForToday()).toBe('10:00');
    });

    it('clamps to 23:45 when rounding pushes past the end of the day', () => {
        setNow(23, 46);
        expect(getEarliestTimeForToday()).toBe('23:45');
    });

    it('clamps to 23:45 at exactly 23:45', () => {
        setNow(23, 45);
        expect(getEarliestTimeForToday()).toBe('23:45');
    });

    it('keeps the time on an exact step boundary', () => {
        setNow(9, 30);
        expect(getEarliestTimeForToday()).toBe('09:30');
    });

    it('rounds up when seconds have already elapsed past a step boundary', () => {
        setNow(9, 30, 20);
        expect(getEarliestTimeForToday()).toBe('09:45');
    });

    it('reads the current time in the given timezone', () => {
        setInstant('2026-09-10T02:30:00Z');

        expect(getEarliestTimeForToday('Asia/Tokyo')).toBe('11:30');
        expect(getEarliestTimeForToday('America/Los_Angeles')).toBe('19:30');
    });
});

describe('getDefaultTimesForDate', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('defaults to a 30-minute morning slot on a future date', () => {
        expect(getDefaultTimesForDate('2099-01-01')).toEqual({startTime: '09:00', endTime: '09:30'});
    });

    it('keeps the morning slot for today when it has not passed yet', () => {
        setNow(7, 0);
        expect(getDefaultTimesForDate(getTodayString())).toEqual({startTime: '09:00', endTime: '09:30'});
    });

    it('starts at the next selectable slot when the morning has passed', () => {
        setNow(14, 20);
        expect(getDefaultTimesForDate(getTodayString())).toEqual({startTime: '14:30', endTime: '15:00'});
    });

    it('clamps the end time to the end of the day', () => {
        setNow(23, 50);
        expect(getDefaultTimesForDate(getTodayString())).toEqual({startTime: '23:45', endTime: '23:59'});
    });

    // At this instant it is Sep 10 in Tokyo but still Sep 9 in Los Angeles, so the
    // same date is "today" in one timezone and a future date in the other.
    it('treats the date as today when the calendar timezone is behind the browser', () => {
        setInstant('2026-09-10T02:30:00Z');

        expect(getTodayString('America/Los_Angeles')).toBe('2026-09-09');
        expect(getDefaultTimesForDate('2026-09-09', 'America/Los_Angeles')).toEqual({startTime: '19:30', endTime: '20:00'});
    });

    it('treats the same date as a future date when the calendar timezone is ahead', () => {
        setInstant('2026-09-10T02:30:00Z');

        expect(getTodayString('Asia/Tokyo')).toBe('2026-09-10');
        expect(getDefaultTimesForDate('2026-09-09', 'Asia/Tokyo')).toEqual({startTime: '09:00', endTime: '09:30'});
    });
});
