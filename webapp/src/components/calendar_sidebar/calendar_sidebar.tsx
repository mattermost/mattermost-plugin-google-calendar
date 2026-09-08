import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, {DateClickArg} from '@fullcalendar/interaction';
import momentTimezonePlugin from '@fullcalendar/moment-timezone';
import {DatesSetArg, EventClickArg, EventMountArg} from '@fullcalendar/core';

import {RemoteEvent} from '@/types/calendar';
import {CreateEventPreFill} from '@/actions';
import {getContainerStyle, MattermostTheme} from '@/utils/calendar_theme';
import {mapToFullCalendarEvents} from '@/utils/event_mapper';
import EventTooltip from '@/components/event_tooltip/event_tooltip';

import CalendarHeader from './calendar_header';
import ConnectPrompt from './connect_prompt';

import './calendar_sidebar.scss';

export interface CalendarSidebarProps {
    theme: MattermostTheme;
    events: RemoteEvent[];
    loading: boolean;
    error: string | null;
    timezone: string;
    connected: boolean | null;
    pluginServerRoute: string;
    actions: {
        fetchCalendarEvents: (from: string, to: string) => void;
        refreshCalendarEvents: (from: string, to: string) => void;
        getConnected: () => any;
        sendEphemeralPost: (message: string) => void;
        openCreateEventModal: (preFill: CreateEventPreFill) => void;
    };
}

const EXPANDED_WIDTH_THRESHOLD = 500;
const POLL_INTERVAL_MS = 60_000;

/** Returns an "HH:00:00" string one hour before the current time in the given timezone, for FullCalendar's initial scroll position. */
function getCurrentScrollTime(tz?: string): string {
    const now = new Date();
    let hours: number;

    if (tz) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {hour: 'numeric', hour12: false, timeZone: tz});
            hours = parseInt(formatter.format(now), 10);
        } catch {
            hours = now.getHours();
        }
    } else {
        hours = now.getHours();
    }

    hours = Math.max(0, hours - 1);
    return `${String(hours).padStart(2, '0')}:00:00`;
}

interface TooltipState {
    event: RemoteEvent;
    anchorRect: DOMRect;
}

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Right-hand-sidebar component rendering the calendar. Shows a connect
 * prompt when the user hasn't authenticated, otherwise renders a FullCalendar
 * view that switches between day/week based on available width, polls for
 * new events, and surfaces event details/creation via tooltip and modal.
 */
const CalendarSidebar = ({theme, events, loading, error, timezone, connected, pluginServerRoute, actions}: CalendarSidebarProps) => {
    const calendarRef = useRef<FullCalendar>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [currentRange, setCurrentRange] = useState<DateRange | null>(null);

    useEffect(() => {
        actions.getConnected();
    }, [actions]);

    const handleEventClick = useCallback((info: EventClickArg) => {
        const remoteEvent = info.event.extendedProps.remoteEvent as RemoteEvent;
        if (!remoteEvent) {
            return;
        }

        const rect = info.el.getBoundingClientRect();
        setTooltip({event: remoteEvent, anchorRect: rect});
    }, []);

    const handleTooltipClose = useCallback(() => {
        setTooltip(null);
    }, []);

    const handleDatesSet = useCallback((arg: DatesSetArg) => {
        setCurrentRange({start: arg.start, end: arg.end});
    }, []);

    const handleEventDidMount = useCallback((arg: EventMountArg) => {
        const {borderStyle, borderWidth} = arg.event.extendedProps;
        if (borderStyle) {
            arg.el.style.borderStyle = borderStyle;
        }
        if (borderWidth) {
            arg.el.style.borderWidth = borderWidth;
        }
    }, []);

    const handleDateClick = useCallback((arg: DateClickArg) => {
        if (arg.allDay) {
            const date = arg.dateStr.slice(0, 10);
            actions.openCreateEventModal({date, startTime: '', endTime: ''});
            return;
        }

        const iso = arg.dateStr;
        const date = iso.slice(0, 10);
        const startTime = iso.slice(11, 16);

        const [h, m] = startTime.split(':').map(Number);
        const endMinutes = (h * 60) + m + 30;

        const clampedEnd = Math.min(endMinutes, 1439);
        const endH = String(Math.floor(clampedEnd / 60)).padStart(2, '0');
        const endM = String(clampedEnd % 60).padStart(2, '0');
        const endTime = `${endH}:${endM}`;

        actions.openCreateEventModal({date, startTime, endTime});
    }, [actions]);

    useEffect(() => {
        if (connected && currentRange) {
            actions.fetchCalendarEvents(currentRange.start.toISOString(), currentRange.end.toISOString());
        }
    }, [actions, connected, currentRange]);

    const handlePrev = useCallback(() => {
        calendarRef.current?.getApi().prev();
    }, []);

    const handleNext = useCallback(() => {
        calendarRef.current?.getApi().next();
    }, []);

    const handleToday = useCallback(() => {
        calendarRef.current?.getApi().today();
    }, []);

    const handleRefresh = useCallback(() => {
        if (currentRange) {
            actions.refreshCalendarEvents(currentRange.start.toISOString(), currentRange.end.toISOString());
        }
    }, [actions, currentRange]);

    useEffect(() => {
        if (!connected || !currentRange) {
            return () => { /* noop */ };
        }

        const id = window.setInterval(() => {
            actions.refreshCalendarEvents(currentRange.start.toISOString(), currentRange.end.toISOString());
        }, POLL_INTERVAL_MS);

        return () => window.clearInterval(id);
    }, [actions, connected, currentRange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return () => { /* noop */ };
        }

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                setIsExpanded(width >= EXPANDED_WIDTH_THRESHOLD);
            }

            const api = calendarRef.current?.getApi();
            if (api) {
                api.updateSize();
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [connected]);

    useEffect(() => {
        const api = calendarRef.current?.getApi();
        if (!api) {
            return;
        }

        const targetView = isExpanded ? 'timeGridWeek' : 'timeGridDay';
        if (api.view.type !== targetView) {
            api.changeView(targetView);
            api.updateSize();
        }
    }, [isExpanded]);

    const fullCalendarEvents = useMemo(
        () => mapToFullCalendarEvents(events, theme),
        [events, theme],
    );

    const containerStyle = useMemo(() => getContainerStyle(theme), [theme]);
    const scrollTime = useMemo(() => getCurrentScrollTime(timezone), [timezone]);

    if (connected === null) {
        return (
            <div
                className='gcal-sidebar'
                style={containerStyle}
            >
                <div className='gcal-sidebar__loading'>
                    <span>{'Loading...'}</span>
                </div>
            </div>
        );
    }

    if (!connected) {
        return (
            <div
                className='gcal-sidebar'
                style={containerStyle}
            >
                <ConnectPrompt
                    theme={theme}
                    pluginServerRoute={pluginServerRoute}
                    sendEphemeralPost={actions.sendEphemeralPost}
                />
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className='gcal-sidebar'
            style={containerStyle}
        >
            {currentRange && (
                <CalendarHeader
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onToday={handleToday}
                    onRefresh={handleRefresh}
                    loading={loading}
                    currentStart={currentRange.start}
                    currentEnd={currentRange.end}
                    isWeekView={isExpanded}
                    theme={theme}
                />
            )}
            {error && (
                <div
                    role='alert'
                    style={{padding: '8px 0', color: theme.dndIndicator || '#D24B4E', fontSize: '0.85em'}}
                >
                    {'Unable to load calendar events.'}
                </div>
            )}
            <div className='gcal-sidebar__calendar'>
                <FullCalendar
                    ref={calendarRef}
                    plugins={[timeGridPlugin, interactionPlugin, momentTimezonePlugin]}
                    initialView='timeGridDay'
                    timeZone={timezone || 'local'}
                    nowIndicator={true}
                    headerToolbar={false}
                    allDaySlot={true}
                    slotDuration='00:30:00'
                    scrollTime={scrollTime}
                    height='100%'
                    events={fullCalendarEvents}
                    eventDisplay='block'
                    slotEventOverlap={false}
                    expandRows={true}
                    eventClick={handleEventClick}
                    dateClick={handleDateClick}
                    datesSet={handleDatesSet}
                    eventDidMount={handleEventDidMount}
                />
            </div>
            {tooltip && (
                <EventTooltip
                    event={tooltip.event}
                    anchorRect={tooltip.anchorRect}
                    timezone={timezone}
                    theme={theme}
                    onClose={handleTooltipClose}
                />
            )}
        </div>
    );
};

export default CalendarSidebar;
