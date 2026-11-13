import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';

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

    it('exposes navigation controls as named buttons', () => {
        render(<CalendarHeader {...baseProps}/>);
        expect(screen.getByRole('button', {name: 'Previous'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Next'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Today'})).toBeInTheDocument();
    });

    it('shows a spinner in the refresh button while loading', () => {
        render(<CalendarHeader {...{...baseProps, loading: true}}/>);
        const refresh = screen.getByRole('button', {name: 'Refresh'});
        expect(refresh.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('does not show a spinner in the refresh button when idle', () => {
        render(<CalendarHeader {...baseProps}/>);
        const refresh = screen.getByRole('button', {name: 'Refresh'});
        expect(refresh.querySelector('[role="status"]')).not.toBeInTheDocument();
    });
});
