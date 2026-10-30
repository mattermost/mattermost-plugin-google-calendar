import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

import {
    AccountOutlineIcon,
    CheckCircleOutlineIcon,
    ClockOutlineIcon,
    CloseIcon,
    MapMarkerOutlineIcon,
    OpenInNewIcon,
    VideoOutlineIcon,
} from '@mattermost/compass-icons/components';
import {Button} from '@mattermost/compass-ui/components/button';
import {Icon} from '@mattermost/compass-ui/components/icon';
import {IconButton} from '@mattermost/compass-ui/components/icon-button';
import {Tag, type TagProps} from '@mattermost/compass-ui/components/tag';

import {RemoteEvent} from '@/types/calendar';

import './event_tooltip.scss';

interface EventTooltipProps {
    event: RemoteEvent;
    anchorRect: DOMRect;
    timezone: string;
    onClose: () => void;
}

/** Maps a raw RSVP response status to a display label and status-specific CSS class. */
function formatResponseStatus(response?: string): {label: string; type: NonNullable<TagProps['type']>} {
    switch (response) {
    case 'accepted':
        return {label: 'Accepted', type: 'success'};
    case 'tentative':
    case 'tentativelyAccepted':
        return {label: 'Tentative', type: 'warning'};
    case 'declined':
        return {label: 'Declined', type: 'danger'};
    case 'not_answered':
    case 'notResponded':
    case 'needsAction':
    default:
        return {label: 'Not responded', type: 'default'};
    }
}

/** Returns Intl formatting options for the given timezone, or none if it's invalid/local. */
function buildTzOptions(timezone: string): Intl.DateTimeFormatOptions {
    if (!timezone || timezone === 'local') {
        return {};
    }
    try {
        new Intl.DateTimeFormat([], {timeZone: timezone}); // eslint-disable-line no-new
        return {timeZone: timezone};
    } catch {
        return {};
    }
}

/** Formats an event's start/end time for display, collapsing to a single date when both fall on the same day. */
function formatEventTime(event: RemoteEvent, timezone: string): string {
    if (event.isAllDay) {
        return 'All day';
    }

    const tzProp = buildTzOptions(timezone);
    const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        ...tzProp,
    };
    const dateOptions: Intl.DateTimeFormatOptions = {
        ...options,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    };

    const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;

    if (!start) {
        return '';
    }

    const startDate = start.toLocaleDateString([], {day: 'numeric', month: 'short', year: 'numeric', ...tzProp});
    const startTime = start.toLocaleTimeString([], options);

    if (!end) {
        return `${startDate} ${startTime}`;
    }

    const endDate = end.toLocaleDateString([], {day: 'numeric', month: 'short', year: 'numeric', ...tzProp});
    const endTime = end.toLocaleTimeString([], options);

    if (startDate === endDate) {
        return `${startDate} ${startTime} - ${endTime}`;
    }

    return `${start.toLocaleString([], dateOptions)} - ${end.toLocaleString([], dateOptions)}`;
}

/**
 * Popover with event details (time, location, conference link, organizer, RSVP
 * status), portaled to document.body and positioned relative to the clicked event.
 */
const EventTooltip = ({event, anchorRect, timezone, onClose}: EventTooltipProps) => {
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEsc);
        window.addEventListener('resize', onClose);

        const scrollableParent = document.getElementById('rhsContainer');
        const scrollTarget = scrollableParent || window;
        scrollTarget.addEventListener('scroll', onClose, true);

        return () => {
            document.removeEventListener('keydown', handleEsc);
            window.removeEventListener('resize', onClose);
            scrollTarget.removeEventListener('scroll', onClose, true);
        };
    }, [onClose]);

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const fitsBelow = spaceBelow > 200;

    const verticalPosition = fitsBelow ?
        {top: anchorRect.bottom + 4} :
        {bottom: (window.innerHeight - anchorRect.top) + 4};
    const right = Math.max(8, window.innerWidth - anchorRect.right);

    const status = formatResponseStatus(event.responseStatus?.response);
    const timeDisplay = formatEventTime(event, timezone);
    const locationName = event.location?.displayName;
    const conferenceUrl = event.conference?.url;
    const conferenceName = event.conference?.application;
    const organizerName = event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address;
    const weblink = event.weblink;

    const tooltip = (
        <div
            className='gcal-tooltip__backdrop'
            role='presentation'
            onClick={onClose}
        >
            <div
                ref={tooltipRef}
                className='gcal-tooltip'
                onClick={(e) => e.stopPropagation()}
                style={{
                    ...verticalPosition,
                    right,
                }}
            >
                <div className='gcal-tooltip__header'>
                    {weblink ? (
                        <a
                            className='gcal-tooltip__title'
                            href={weblink}
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            {event.subject || '(No title)'}
                            <Icon
                                className='gcal-tooltip__title-icon'
                                size='12'
                                glyph={<OpenInNewIcon/>}
                            />
                        </a>
                    ) : (
                        <span className='gcal-tooltip__title'>
                            {event.subject || '(No title)'}
                        </span>
                    )}
                    <IconButton
                        size='small'
                        onClick={onClose}
                        aria-label='Close event details'
                        icon={<Icon glyph={<CloseIcon/>}/>}
                    />
                </div>

                <div className='gcal-tooltip__time'>
                    <Icon
                        size='16'
                        glyph={<ClockOutlineIcon/>}
                    />
                    <span>{timeDisplay}</span>
                </div>

                {locationName && (
                    <div className='gcal-tooltip__row'>
                        <Icon
                            size='16'
                            glyph={<MapMarkerOutlineIcon/>}
                        />
                        <span>{locationName}</span>
                    </div>
                )}

                {conferenceUrl && (
                    <div className='gcal-tooltip__conference'>
                        <Button
                            asChild={true}
                            size='small'
                        >
                            <a
                                href={conferenceUrl}
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                {'Join'}
                            </a>
                        </Button>
                        {conferenceName && (
                            <span className='gcal-tooltip__conference-name'>
                                <Icon
                                    size='16'
                                    glyph={<VideoOutlineIcon/>}
                                />
                                {conferenceName}
                            </span>
                        )}
                    </div>
                )}

                {organizerName && (
                    <div className='gcal-tooltip__row'>
                        <Icon
                            size='16'
                            glyph={<AccountOutlineIcon/>}
                        />
                        <div className='gcal-tooltip__organizer'>
                            <span>{organizerName}</span>
                            <span className='gcal-tooltip__organizer-label'>{'Organizer'}</span>
                        </div>
                    </div>
                )}

                <div className='gcal-tooltip__row gcal-tooltip__row--status'>
                    <Icon
                        size='16'
                        glyph={<CheckCircleOutlineIcon/>}
                    />
                    <Tag
                        size='small'
                        type={status.type}
                        label={status.label}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(tooltip, document.body);
};

export default EventTooltip;
