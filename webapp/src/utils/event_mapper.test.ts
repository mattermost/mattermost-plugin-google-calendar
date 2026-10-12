import {RemoteEvent} from '@/types/calendar';
import {mockTheme} from '@/testutils/theme';

import {mapToFullCalendarEvents} from './event_mapper';

const makeEvent = (overrides: Partial<RemoteEvent> = {}): RemoteEvent => ({
    id: 'event-1',
    subject: 'Standup',
    start: {dateTime: '2026-09-10T09:00:00Z'},
    end: {dateTime: '2026-09-10T09:30:00Z'},
    ...overrides,
});

describe('mapToFullCalendarEvents', () => {
    it('drops events without a start time', () => {
        const noStart: RemoteEvent = {id: 'event-1', subject: 'Standup'};
        expect(mapToFullCalendarEvents([noStart], mockTheme)).toEqual([]);
    });

    it('keeps the full timestamps for timed events', () => {
        const [event] = mapToFullCalendarEvents([makeEvent()], mockTheme);
        expect(event).toMatchObject({
            title: 'Standup',
            start: '2026-09-10T09:00:00Z',
            end: '2026-09-10T09:30:00Z',
            allDay: false,
        });
    });

    it('uses date-only values for all-day events so they are not shifted by timezone', () => {
        const [event] = mapToFullCalendarEvents([makeEvent({
            isAllDay: true,
            start: {dateTime: '2026-09-10T00:00:00Z'},
            end: {dateTime: '2026-09-11T00:00:00Z'},
        })], mockTheme);

        expect(event).toMatchObject({
            start: '2026-09-10',
            end: '2026-09-11',
            allDay: true,
        });
    });

    it('handles all-day events without an end', () => {
        const noEnd: RemoteEvent = {
            id: 'event-1',
            subject: 'Standup',
            isAllDay: true,
            start: {dateTime: '2026-09-10T00:00:00Z'},
        };
        const [event] = mapToFullCalendarEvents([noEnd], mockTheme);

        expect(event.start).toBe('2026-09-10');
        expect(event.end).toBeUndefined();
    });

    it('falls back to a placeholder title', () => {
        const [event] = mapToFullCalendarEvents([makeEvent({subject: ''})], mockTheme);
        expect(event.title).toBe('(No title)');
    });
});
