import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';

import {RemoteEvent} from '@/types/calendar';
import {mockTheme} from '@/testutils/theme';

import EventTooltip from './event_tooltip';

const makeEvent = (overrides: Partial<RemoteEvent> = {}): RemoteEvent => ({
    id: 'evt-1',
    subject: 'Team Standup',
    start: {dateTime: '2025-07-15T09:00:00Z'},
    end: {dateTime: '2025-07-15T09:30:00Z'},
    ...overrides,
});

const baseAnchorRect = {
    top: 100,
    bottom: 130,
    left: 200,
    right: 400,
    width: 200,
    height: 30,
    x: 200,
    y: 100,
    toJSON: () => ({}),
} as DOMRect;

describe('EventTooltip', () => {
    const baseProps = {
        event: makeEvent(),
        anchorRect: baseAnchorRect,
        timezone: 'UTC',
        theme: mockTheme,
        onClose: jest.fn(),
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('renders the event subject', () => {
        render(<EventTooltip {...baseProps}/>);
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
    });

    it('renders "(No title)" when subject is empty', () => {
        const props = {...baseProps, event: makeEvent({subject: ''})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('(No title)')).toBeInTheDocument();
    });

    it('renders "All day" for all-day events', () => {
        const props = {...baseProps, event: makeEvent({isAllDay: true})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('All day')).toBeInTheDocument();
    });

    it('renders time display for timed events', () => {
        render(<EventTooltip {...baseProps}/>);
        const timeEl = screen.getByText(/AM|PM|:/);
        expect(timeEl).toBeInTheDocument();
    });

    it('renders location when present', () => {
        const props = {...baseProps, event: makeEvent({location: {displayName: 'Room 42'}})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Room 42')).toBeInTheDocument();
    });

    it('does not render location when absent', () => {
        render(<EventTooltip {...baseProps}/>);
        expect(screen.queryByText('Room 42')).not.toBeInTheDocument();
    });

    it('renders conference join button when conference URL exists', () => {
        const props = {
            ...baseProps,
            event: makeEvent({
                conference: {url: 'https://teams.example.com/meet', application: 'Teams'},
            }),
        };
        render(<EventTooltip {...props}/>);
        const joinBtn = screen.getByText('Join');
        expect(joinBtn).toHaveAttribute('href', 'https://teams.example.com/meet');
        expect(screen.getByText('Teams')).toBeInTheDocument();
    });

    it('does not render conference section when no conference', () => {
        render(<EventTooltip {...baseProps}/>);
        expect(screen.queryByText('Join')).not.toBeInTheDocument();
    });

    it('renders organizer name', () => {
        const props = {
            ...baseProps,
            event: makeEvent({
                organizer: {emailAddress: {address: 'jane@example.com', name: 'Jane Doe'}},
            }),
        };
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('Organizer')).toBeInTheDocument();
    });

    it('renders organizer email when name is missing', () => {
        const props = {
            ...baseProps,
            event: makeEvent({
                organizer: {emailAddress: {address: 'jane@example.com'}},
            }),
        };
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });

    it('renders response status', () => {
        const props = {...baseProps, event: makeEvent({responseStatus: {response: 'accepted'}})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Accepted')).toBeInTheDocument();
    });

    it('renders "Not responded" for unknown response status', () => {
        const props = {...baseProps, event: makeEvent({responseStatus: {response: 'notResponded'}})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Not responded')).toBeInTheDocument();
    });

    it('renders "Tentative" for tentativelyAccepted', () => {
        const props = {...baseProps, event: makeEvent({responseStatus: {response: 'tentativelyAccepted'}})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Tentative')).toBeInTheDocument();
    });

    it('renders "Declined" status', () => {
        const props = {...baseProps, event: makeEvent({responseStatus: {response: 'declined'}})};
        render(<EventTooltip {...props}/>);
        expect(screen.getByText('Declined')).toBeInTheDocument();
    });

    it('calls onClose when backdrop is clicked', () => {
        render(<EventTooltip {...baseProps}/>);
        const backdrop = document.body.querySelector('.gcal-tooltip__backdrop');
        fireEvent.click(backdrop!);
        expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape key', () => {
        render(<EventTooltip {...baseProps}/>);
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not propagate clicks on the tooltip itself', () => {
        render(<EventTooltip {...baseProps}/>);
        const tooltip = document.body.querySelector('.gcal-tooltip');
        fireEvent.click(tooltip!);
        expect(baseProps.onClose).not.toHaveBeenCalled();
    });

    it('renders weblink on the title', () => {
        const props = {...baseProps, event: makeEvent({weblink: 'https://calendar.example.com/event/1'})};
        render(<EventTooltip {...props}/>);
        const link = screen.getByText('Team Standup').closest('a');
        expect(link).toHaveAttribute('href', 'https://calendar.example.com/event/1');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('applies theme background and color to tooltip', () => {
        render(<EventTooltip {...baseProps}/>);
        const tooltip = document.body.querySelector('.gcal-tooltip');
        expect(tooltip).toHaveStyle({
            backgroundColor: mockTheme.centerChannelBg,
            color: mockTheme.centerChannelColor,
        });
    });

    it('applies theme color to join button', () => {
        const props = {
            ...baseProps,
            event: makeEvent({
                conference: {url: 'https://teams.example.com/meet', application: 'Teams'},
            }),
        };
        render(<EventTooltip {...props}/>);
        const joinBtn = screen.getByText('Join');
        expect(joinBtn).toHaveStyle({
            backgroundColor: mockTheme.buttonBg,
            color: mockTheme.buttonColor,
        });
    });
});
