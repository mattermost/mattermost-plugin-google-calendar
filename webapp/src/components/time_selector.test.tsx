import {render} from '@testing-library/react';

import TimeSelector from './time_selector';

jest.mock('react-redux', () => ({
    useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('mattermost-redux/selectors/entities/timezone', () => ({
    getCurrentTimezone: () => 'UTC',
}));

let selectProps: any;
jest.mock('@mattermost/compass-ui/components/select', () => ({
    Select: (props: any) => {
        selectProps = props;
        return null;
    },
}));

const FUTURE_DATE = '2999-01-01';

describe('TimeSelector', () => {
    it('advances the end time by 30 minutes when a start time is picked', () => {
        const onChange = jest.fn();
        render(
            <TimeSelector
                name='start_time'
                value=''
                date={FUTURE_DATE}
                onChange={onChange}
            />,
        );

        selectProps.onChange('10:00');

        expect(onChange).toHaveBeenCalledWith('start_time', '10:00');
        expect(onChange).toHaveBeenCalledWith('end_time', '10:30');
    });

    it('only offers end times after the start time', () => {
        render(
            <TimeSelector
                name='end_time'
                value=''
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        expect(selectProps.options[0].value).toBe('10:15');
    });

    it('passes an empty value when the current value is not an option', () => {
        render(
            <TimeSelector
                name='end_time'
                value='09:00'
                startTime='10:00'
                date={FUTURE_DATE}
                onChange={jest.fn()}
            />,
        );

        expect(selectProps.value).toBe('');
    });
});
