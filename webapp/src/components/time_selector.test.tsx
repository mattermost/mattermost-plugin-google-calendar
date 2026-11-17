import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TimeSelector from './time_selector';

let mockState: unknown;

jest.mock('react-redux', () => ({
    useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('mattermost-redux/selectors/entities/timezone', () => ({
    getCurrentTimezone: () => 'UTC',
}));

const FUTURE_DATE = '2999-01-01';

// Holds only the user's Clock Display setting, so the real preference selector
// runs and the test covers the preference key wiring.
const withClockDisplay = (useMilitaryTime: boolean | null) => {
    const myPreferences = useMilitaryTime === null ? {} : {
        'display_settings--use_military_time': {
            user_id: 'user1',
            category: 'display_settings',
            name: 'use_military_time',
            value: String(useMilitaryTime),
        },
    };
    mockState = {entities: {preferences: {myPreferences}}};
};

const nodeLabel = (text: string) => (
    <>
        {text}
        <span aria-hidden='true'>{' *'}</span>
    </>
);

const renderStartSelector = (props: Partial<React.ComponentProps<typeof TimeSelector>> = {}) => {
    const onChange = jest.fn();
    render(
        <TimeSelector
            name='start_time'
            label={nodeLabel('Start time')}
            value=''
            date={FUTURE_DATE}
            onChange={onChange}
            {...props}
        />,
    );
    return {onChange};
};

const openStartMenu = async () => {
    await userEvent.click(screen.getByRole('combobox', {name: 'Start time'}));
};

describe('TimeSelector', () => {
    beforeEach(() => {
        withClockDisplay(null);
    });

    it('advances the end time by 30 minutes when a start time is picked', async () => {
        const {onChange} = renderStartSelector();

        await openStartMenu();
        await userEvent.click(screen.getByRole('option', {name: '10:00 AM'}));

        expect(onChange).toHaveBeenCalledWith('start_time', '10:00');
        expect(onChange).toHaveBeenCalledWith('end_time', '10:30');
    });

    it('only offers end times after the start time, in a labelled listbox', async () => {
        render(
            <TimeSelector
                name='end_time'
                label={nodeLabel('End time')}
                value=''
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('combobox', {name: 'End time'}));
        const options = screen.getAllByRole('option');

        expect(screen.getByRole('listbox', {name: 'End time'})).toBeInTheDocument();
        expect(options[0]).toHaveTextContent('10:15 AM');
        expect(screen.queryByRole('option', {name: '10:00 AM'})).not.toBeInTheDocument();
    });

    it('shows no selection when the current value is not an option', () => {
        render(
            <TimeSelector
                name='end_time'
                label={nodeLabel('End time')}
                value='09:00'
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        expect(screen.getByRole('combobox', {name: 'End time'})).not.toHaveTextContent('9:00 AM');
    });

    it('lists 12-hour options when the user has no clock display preference', async () => {
        renderStartSelector();
        await openStartMenu();

        expect(screen.getByRole('option', {name: '12:00 AM'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '1:30 PM'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: '13:30'})).not.toBeInTheDocument();
    });

    it('lists 12-hour options when the user chose the 12-hour clock', async () => {
        withClockDisplay(false);
        renderStartSelector();
        await openStartMenu();

        expect(screen.getByRole('option', {name: '9:00 AM'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '11:30 PM'})).toBeInTheDocument();
    });

    it('lists 24-hour options when the user chose the 24-hour clock', async () => {
        withClockDisplay(true);
        renderStartSelector();
        await openStartMenu();

        expect(screen.getByRole('option', {name: '09:00'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '13:30'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: '1:30 PM'})).not.toBeInTheDocument();
    });

    it('relabels the options when the user changes the clock display', async () => {
        const props = {name: 'start_time' as const, label: nodeLabel('Start time'), value: '', date: FUTURE_DATE, onChange: jest.fn()};
        const {rerender} = render(<TimeSelector {...props}/>);
        await openStartMenu();
        expect(screen.getByRole('option', {name: '2:00 PM'})).toBeInTheDocument();

        withClockDisplay(true);
        rerender(<TimeSelector {...props}/>);

        expect(screen.getByRole('option', {name: '14:00'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: '2:00 PM'})).not.toBeInTheDocument();
    });

    it('keeps the current-time cutoff when only the clock display changes', () => {
        jest.useFakeTimers({now: new Date('2030-01-01T09:55:00Z')});
        try {
            const props = {name: 'start_time' as const, label: nodeLabel('Start time'), value: '10:00', date: '2030-01-01', onChange: jest.fn()};
            const {rerender} = render(<TimeSelector {...props}/>);
            expect(screen.getByRole('combobox', {name: 'Start time'})).toHaveTextContent('10:00 AM');

            jest.setSystemTime(new Date('2030-01-01T10:20:00Z'));
            withClockDisplay(true);
            rerender(<TimeSelector {...props}/>);

            expect(screen.getByRole('combobox', {name: 'Start time'})).toHaveTextContent('10:00');
        } finally {
            jest.useRealTimers();
        }
    });

    it('shows the selected value in the 12-hour clock', () => {
        renderStartSelector({value: '14:00'});

        expect(screen.getByRole('combobox', {name: 'Start time'})).toHaveTextContent('2:00 PM');
    });

    it('reports 24-hour "HH:MM" values when a 12-hour option is chosen', async () => {
        const {onChange} = renderStartSelector();
        await openStartMenu();
        await userEvent.click(screen.getByRole('option', {name: '2:00 PM'}));

        expect(onChange).toHaveBeenCalledWith('start_time', '14:00');
        expect(onChange).toHaveBeenCalledWith('end_time', '14:30');
    });
});
