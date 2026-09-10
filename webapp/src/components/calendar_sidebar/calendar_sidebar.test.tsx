import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import FullCalendar from '@fullcalendar/react';

import {mockTheme} from '@/testutils/theme';

import CalendarSidebar, {CalendarSidebarProps} from './calendar_sidebar';

jest.mock('@fullcalendar/react', () => {
    const FakeCalendar = jest.fn(() => <div data-testid='fullcalendar'/>);
    return {__esModule: true, default: FakeCalendar};
});
jest.mock('@fullcalendar/timegrid', () => ({}));
jest.mock('@fullcalendar/interaction', () => ({}));
jest.mock('@fullcalendar/moment-timezone', () => ({}));

class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
}

const savedResizeObserver = (global as Record<string, unknown>).ResizeObserver;

beforeAll(() => {
    (global as Record<string, unknown>).ResizeObserver = MockResizeObserver;
});

afterAll(() => {
    (global as Record<string, unknown>).ResizeObserver = savedResizeObserver;
});

const makeProps = (overrides: Partial<CalendarSidebarProps> = {}): CalendarSidebarProps => ({
    theme: mockTheme,
    events: [],
    loading: false,
    error: null,
    timezone: 'UTC',
    connected: true,
    pluginServerRoute: '/plugins/com.mattermost.gcal',
    actions: {
        fetchCalendarEvents: jest.fn(),
        refreshCalendarEvents: jest.fn(),
        getConnected: jest.fn(),
        sendEphemeralPost: jest.fn(),
        openCreateEventModal: jest.fn(),
    },
    ...overrides,
});

describe('CalendarSidebar', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('shows loading state when connected is null', () => {
        render(<CalendarSidebar {...makeProps({connected: null})}/>);
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows connect prompt when not connected', () => {
        render(<CalendarSidebar {...makeProps({connected: false})}/>);
        expect(screen.getByText('Welcome to Google Calendar')).toBeInTheDocument();
        expect(screen.getByText('Connect account')).toBeInTheDocument();
    });

    it('does not show connect prompt when connected', () => {
        render(<CalendarSidebar {...makeProps({connected: true})}/>);
        expect(screen.queryByText('Connect account')).not.toBeInTheDocument();
    });

    it('renders FullCalendar when connected', () => {
        render(<CalendarSidebar {...makeProps({connected: true})}/>);
        expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
    });

    it('calls getConnected on mount', () => {
        const actions = makeProps().actions;
        render(<CalendarSidebar {...makeProps({actions})}/>);
        expect(actions.getConnected).toHaveBeenCalledTimes(1);
    });

    const getCalendarProps = () => {
        const mock = FullCalendar as unknown as jest.Mock;
        return mock.mock.calls[mock.mock.calls.length - 1][0];
    };

    it('pre-fills the clicked time slot when creating an event', () => {
        const actions = makeProps().actions;
        render(<CalendarSidebar {...makeProps({actions})}/>);

        getCalendarProps().dateClick({allDay: false, dateStr: '2099-01-01T10:00:00Z'});

        expect(actions.openCreateEventModal).toHaveBeenCalledWith({
            date: '2099-01-01',
            startTime: '10:00',
            endTime: '10:30',
        });
    });

    it('pre-fills a default time slot when clicking the all-day row', () => {
        const actions = makeProps().actions;
        render(<CalendarSidebar {...makeProps({actions})}/>);

        getCalendarProps().dateClick({allDay: true, dateStr: '2099-01-01'});

        expect(actions.openCreateEventModal).toHaveBeenCalledWith({
            date: '2099-01-01',
            startTime: '09:00',
            endTime: '09:30',
        });
    });

    it('displays error message when error is set', () => {
        render(<CalendarSidebar {...makeProps({error: 'something broke'})}/>);
        expect(screen.getByText(/Unable to load calendar events/)).toBeInTheDocument();
    });

    it('does not display error message when error is null', () => {
        render(<CalendarSidebar {...makeProps({error: null})}/>);
        expect(screen.queryByText(/Unable to load calendar events/)).not.toBeInTheDocument();
    });

    it('applies container background from theme', () => {
        const {container} = render(<CalendarSidebar {...makeProps()}/>);
        const sidebar = container.querySelector('.gcal-sidebar');
        expect(sidebar).toHaveStyle({backgroundColor: mockTheme.centerChannelBg});
    });

    const altTheme = {
        ...mockTheme,
        centerChannelBg: '#1e1e1e',
        centerChannelColor: '#dddddd',
        buttonBg: '#ff5500',
        buttonColor: '#000000',
        dndIndicator: '#ee3344',
    };

    it('theme: passes colors to the container in all connection states', () => {
        for (const connected of [null, false, true] as const) {
            const {container, unmount} = render(
                <CalendarSidebar {...makeProps({theme: altTheme, connected})}/>
            );
            const sidebar = container.querySelector('.gcal-sidebar');
            expect(sidebar).toHaveStyle({
                backgroundColor: altTheme.centerChannelBg,
                color: altTheme.centerChannelColor,
            });
            unmount();
        }
    });

    it('theme: passes to ConnectPrompt when disconnected', () => {
        render(<CalendarSidebar {...makeProps({theme: altTheme, connected: false})}/>);
        const connectBtn = screen.getByText('Connect account');
        expect(connectBtn).toHaveStyle({
            backgroundColor: altTheme.buttonBg,
            color: altTheme.buttonColor,
        });
    });

    it('theme: uses dndIndicator for the error message color', () => {
        render(
            <CalendarSidebar {...makeProps({theme: altTheme, error: 'fail'})}/>
        );
        const errorEl = screen.getByText(/Unable to load calendar events/);
        expect(errorEl).toHaveStyle({color: altTheme.dndIndicator});
    });

    it('theme: falls back to #D24B4E when dndIndicator is empty', () => {
        const noIndicatorTheme = {...altTheme, dndIndicator: ''};
        render(
            <CalendarSidebar {...makeProps({theme: noIndicatorTheme, error: 'fail'})}/>
        );
        const errorEl = screen.getByText(/Unable to load calendar events/);
        expect(errorEl).toHaveStyle({color: '#D24B4E'});
    });

    it('theme: reflects change in container when re-rendered with different theme', () => {
        const {container, rerender} = render(
            <CalendarSidebar {...makeProps({theme: mockTheme})}/>
        );
        let sidebar = container.querySelector('.gcal-sidebar');
        expect(sidebar).toHaveStyle({backgroundColor: mockTheme.centerChannelBg});

        rerender(<CalendarSidebar {...makeProps({theme: altTheme})}/>);
        sidebar = container.querySelector('.gcal-sidebar');
        expect(sidebar).toHaveStyle({backgroundColor: altTheme.centerChannelBg});
    });
});
