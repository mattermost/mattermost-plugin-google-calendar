import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {useSelector} from 'react-redux';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';

import {mockTheme} from '@/testutils/theme';

import TimeSelector from './time_selector';

jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;

const FUTURE_DATE = '2099-01-01';

// Resolves the real preference selector against a state holding only the
// user's Clock Display setting, so the test covers the preference key wiring.
const withClockDisplay = (useMilitaryTime: boolean | null) => {
    const myPreferences = useMilitaryTime === null ? {} : {
        'display_settings--use_military_time': {
            user_id: 'user1',
            category: 'display_settings',
            name: 'use_military_time',
            value: String(useMilitaryTime),
        },
    };
    const state = {entities: {preferences: {myPreferences}}};

    mockUseSelector.mockImplementation((selector: (s: never) => unknown) => {
        if (selector === getTheme) {
            return mockTheme;
        }
        if (selector === getCurrentTimezone) {
            return 'UTC';
        }
        return selector(state as never);
    });
};

const renderSelector = (props: Partial<React.ComponentProps<typeof TimeSelector>> = {}) => {
    const onChange = jest.fn();
    render(
        <TimeSelector
            inputId='start_time'
            name='start_time'
            value=''
            date={FUTURE_DATE}
            onChange={onChange}
            {...props}
        />,
    );
    return {onChange};
};

const openMenu = async () => {
    await userEvent.click(screen.getByRole('combobox'));
};

describe('TimeSelector', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('lists 12-hour options when the user has no clock display preference', async () => {
        withClockDisplay(null);
        renderSelector();
        await openMenu();

        expect(screen.getByRole('option', {name: '12:00 AM'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '1:30 PM'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: '13:30'})).not.toBeInTheDocument();
    });

    it('lists 12-hour options when the user chose the 12-hour clock', async () => {
        withClockDisplay(false);
        renderSelector();
        await openMenu();

        expect(screen.getByRole('option', {name: '9:00 AM'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '11:30 PM'})).toBeInTheDocument();
    });

    it('lists 24-hour options when the user chose the 24-hour clock', async () => {
        withClockDisplay(true);
        renderSelector();
        await openMenu();

        expect(screen.getByRole('option', {name: '09:00'})).toBeInTheDocument();
        expect(screen.getByRole('option', {name: '13:30'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: '1:30 PM'})).not.toBeInTheDocument();
    });

    it('shows the selected value in the 12-hour clock', () => {
        withClockDisplay(false);
        renderSelector({value: '14:00'});

        expect(screen.getByText('2:00 PM')).toBeInTheDocument();
    });

    it('reports 24-hour "HH:MM" values when a 12-hour option is chosen', async () => {
        withClockDisplay(false);
        const {onChange} = renderSelector();
        await openMenu();
        await userEvent.click(screen.getByRole('option', {name: '2:00 PM'}));

        expect(onChange).toHaveBeenCalledWith('start_time', '14:00');
        expect(onChange).toHaveBeenCalledWith('end_time', '14:30');
    });
});
