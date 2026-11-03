import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TimeSelector from './time_selector';

jest.mock('react-redux', () => ({
    useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('mattermost-redux/selectors/entities/timezone', () => ({
    getCurrentTimezone: () => 'UTC',
}));

const FUTURE_DATE = '2999-01-01';

const nodeLabel = (text: string) => (
    <>
        {text}
        <span aria-hidden='true'>{' *'}</span>
    </>
);

describe('TimeSelector', () => {
    it('advances the end time by 30 minutes when a start time is picked', async () => {
        const onChange = jest.fn();
        render(
            <TimeSelector
                name='start_time'
                label={nodeLabel('Start Time')}
                value=''
                date={FUTURE_DATE}
                onChange={onChange}
            />,
        );

        await userEvent.click(screen.getByRole('combobox', {name: 'Start Time'}));
        await userEvent.click(screen.getByRole('option', {name: '10:00'}));

        expect(onChange).toHaveBeenCalledWith('start_time', '10:00');
        expect(onChange).toHaveBeenCalledWith('end_time', '10:30');
    });

    it('only offers end times after the start time, in a labelled listbox', async () => {
        render(
            <TimeSelector
                name='end_time'
                label={nodeLabel('End Time')}
                value=''
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('combobox', {name: 'End Time'}));
        const options = screen.getAllByRole('option');

        expect(screen.getByRole('listbox', {name: 'End time'})).toBeInTheDocument();
        expect(options[0]).toHaveTextContent('10:15');
        expect(screen.queryByRole('option', {name: '10:00'})).not.toBeInTheDocument();
    });

    it('shows no selection when the current value is not an option', () => {
        render(
            <TimeSelector
                name='end_time'
                label={nodeLabel('End Time')}
                value='09:00'
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        expect(screen.getByRole('combobox', {name: 'End Time'})).not.toHaveTextContent('09:00');
    });
});
