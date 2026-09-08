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

/** Converts a single remote event into a FullCalendar EventInput, applying theme-derived styling. */
function mapToFullCalendarEvent(event: RemoteEventWithStart, theme: MattermostTheme): EventInput {
    const style = getEventStyle(event, theme);

    return {
        id: event.id,
        title: event.subject || '(No title)',
        start: event.start.dateTime,
        end: event.end?.dateTime,
        allDay: event.isAllDay || false,
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
