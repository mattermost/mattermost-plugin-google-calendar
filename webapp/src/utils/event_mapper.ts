import {EventInput} from '@fullcalendar/core';

import {RemoteEvent, RemoteDateTime} from '@/types/calendar';

import {getEventStyle, MattermostTheme} from './calendar_theme';

type RemoteEventWithStart = RemoteEvent & {start: RemoteDateTime};

/** Type guard filtering out remote events that lack a start date/time. */
function hasStart(event: RemoteEvent): event is RemoteEventWithStart {
    return Boolean(event.start?.dateTime);
}

/** Converts remote calendar events into FullCalendar's EventInput format, dropping events without a start time. */
export function mapToFullCalendarEvents(events: RemoteEvent[], theme: MattermostTheme): EventInput[] {
    return events.
        filter(hasStart).
        map((event) => mapToFullCalendarEvent(event, theme));
}

/**
 * Extracts the calendar date of an all-day event. The server encodes those dates
 * as UTC midnight, so handing FullCalendar the full timestamp would shift the
 * event a day for anyone whose timezone isn't UTC.
 */
function toDateOnly(dateTime?: string): string | undefined {
    return dateTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? dateTime;
}

/** Converts a single remote event into a FullCalendar EventInput, applying theme-derived styling. */
function mapToFullCalendarEvent(event: RemoteEventWithStart, theme: MattermostTheme): EventInput {
    const style = getEventStyle(event, theme);
    const allDay = event.isAllDay || false;

    return {
        id: event.id,
        title: event.subject || '(No title)',
        start: allDay ? toDateOnly(event.start.dateTime) : event.start.dateTime,
        end: allDay ? toDateOnly(event.end?.dateTime) : event.end?.dateTime,
        allDay,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        textColor: style.textColor,
        classNames: style.classNames,
        extendedProps: {
            remoteEvent: event,
            borderStyle: style.borderStyle,
            borderWidth: style.borderWidth,
        },
    };
}
