import React from 'react';

import {DateRangePicker} from '@mattermost/compass-ui/components/date-range-picker';
import {ErrorMessage} from '@mattermost/compass-ui/components/error-message';

import {Z_INDEX_MENU_PORTAL} from '@/utils/styles';

type Props = {
    id?: string;
    value: string;
    invalid?: boolean;
    onChange: (value: string) => void;
};

/** Date picker for the event date; past dates are flagged with an inline error. */
export default function DateInput({id, value, invalid, onChange}: Props) {
    return (
        <div>
            <label
                className='gcal-date-label'
                htmlFor={id}
            >
                {'Date'}
                <span
                    className='gcal-required-star'
                    aria-hidden={true}
                >{' *'}</span>
            </label>
            <DateRangePicker
                id={id}
                mode='date'
                value={value}
                onChange={onChange}
                zIndex={Z_INDEX_MENU_PORTAL}
            />
            {invalid && <ErrorMessage message='Date cannot be in the past.'/>}
        </div>
    );
}
