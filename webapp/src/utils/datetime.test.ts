import {getEarliestTimeForToday} from './datetime';

describe('getEarliestTimeForToday', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    const setNow = (hours: number, minutes: number) => {
        jest.useFakeTimers();
        const now = new Date();
        now.setHours(hours, minutes, 0, 0);
        jest.setSystemTime(now);
    };

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
});
