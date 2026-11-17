import React from 'react';

import {DateRangePicker} from '@mattermost/compass-ui/components/date-range-picker';
import {ErrorMessage} from '@mattermost/compass-ui/components/error-message';

import {Z_INDEX_MENU_PORTAL} from '@/utils/styles';

type Props = {
    id: string;
    label: React.ReactNode;
    value: string;
    invalid?: boolean;
    onChange: (value: string) => void;
};

/** Date picker for the event date; past dates are flagged with an inline error. */
export default function DateInput({id, label, value, invalid, onChange}: Props) {
    const errorId = `${id}-error`;

    // DateRangePicker has no `message` prop, so the error is rendered here and linked to the trigger.
    return (
        <div>
            <DateRangePicker
                id={id}
                mode='date'
                label={label}
                required={true}
                value={value}
                onChange={onChange}
                {...(invalid && {'aria-describedby': errorId})}
                zIndex={Z_INDEX_MENU_PORTAL}
            />
            {invalid && (
                <ErrorMessage
                    id={errorId}
                    message='Date cannot be in the past.'
                />
            )}
        </div>
    );
}
