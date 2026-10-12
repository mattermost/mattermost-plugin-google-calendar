import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';

import {mockTheme} from '@/testutils/theme';

import CalendarHeader from './calendar_header';

describe('CalendarHeader', () => {
    const baseProps = {
        onPrev: jest.fn(),
        onNext: jest.fn(),
        onToday: jest.fn(),
        onRefresh: jest.fn(),
        loading: false,
        currentStart: new Date('2025-07-14T00:00:00'),
        currentEnd: new Date('2025-07-15T00:00:00'),
        isWeekView: false,
        theme: mockTheme,
    };

    let localeDateSpy: jest.SpyInstance;

    function formatEnUS(this: Date, _locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        return new Intl.DateTimeFormat('en-US', options).format(this);
    }

    beforeAll(() => {
        localeDateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(formatEnUS);
    });

    afterAll(() => {
        localeDateSpy.mockRestore();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('renders a single-day label when isWeekView is false', () => {
        render(<CalendarHeader {...baseProps}/>);
        const label = screen.getByText(/Jul/);
        expect(label).toBeInTheDocument();
        expect(label.textContent).toContain('14');
    });

    it('renders a week range label when isWeekView is true', () => {
        const props = {
            ...baseProps,
            isWeekView: true,
            currentStart: new Date('2025-07-14T00:00:00'),
            currentEnd: new Date('2025-07-21T00:00:00'),
        };
        render(<CalendarHeader {...props}/>);
        const label = screen.getByText(/14 - 20/);
        expect(label).toBeInTheDocument();
    });

    it('renders a cross-month week range', () => {
        const props = {
            ...baseProps,
            isWeekView: true,
            currentStart: new Date('2025-06-30T00:00:00'),
            currentEnd: new Date('2025-07-07T00:00:00'),
        };
        render(<CalendarHeader {...props}/>);
        expect(screen.getByText(/Jun.*Jul/)).toBeInTheDocument();
    });

    it('calls onPrev when previous button is clicked', () => {
        render(<CalendarHeader {...baseProps}/>);
        fireEvent.click(screen.getByTitle('Previous'));
        expect(baseProps.onPrev).toHaveBeenCalledTimes(1);
    });

    it('calls onNext when next button is clicked', () => {
        render(<CalendarHeader {...baseProps}/>);
        fireEvent.click(screen.getByTitle('Next'));
        expect(baseProps.onNext).toHaveBeenCalledTimes(1);
    });

    it('calls onToday when Today button is clicked', () => {
        render(<CalendarHeader {...baseProps}/>);
        fireEvent.click(screen.getByText('Today'));
        expect(baseProps.onToday).toHaveBeenCalledTimes(1);
    });

    it('calls onRefresh when refresh button is clicked', () => {
        render(<CalendarHeader {...baseProps}/>);
        fireEvent.click(screen.getByTitle('Refresh'));
        expect(baseProps.onRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button when loading', () => {
        const props = {...baseProps, loading: true};
        render(<CalendarHeader {...props}/>);
        expect(screen.getByTitle('Refresh')).toBeDisabled();
    });

    it('adds spin class to refresh icon when loading', () => {
        const props = {...baseProps, loading: true};
        const {container} = render(<CalendarHeader {...props}/>);
        const icon = container.querySelector('.icon-refresh');
        expect(icon?.className).toContain('gcal-spin');
    });

    it('does not add spin class when not loading', () => {
        const props = {...baseProps, loading: false};
        const {container} = render(<CalendarHeader {...props}/>);
        const icon = container.querySelector('.icon-refresh');
        expect(icon?.className).not.toContain('gcal-spin');
    });

    it('applies theme colors to navigation buttons', () => {
        render(<CalendarHeader {...baseProps}/>);
        const prevBtn = screen.getByTitle('Previous');
        expect(prevBtn).toHaveStyle({color: mockTheme.centerChannelColor});
    });

    it('applies theme colors to Today button', () => {
        render(<CalendarHeader {...baseProps}/>);
        const todayBtn = screen.getByText('Today');
        expect(todayBtn).toHaveStyle({
            color: mockTheme.buttonBg,
            borderColor: mockTheme.buttonBg,
        });
    });
});
