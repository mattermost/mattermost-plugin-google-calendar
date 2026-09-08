import React, {useRef} from 'react';
import {useSelector} from 'react-redux';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {CalendarOutlineIcon} from '@mattermost/compass-icons/components';

type Props = {
    id?: string;
    value: string;
    min?: string;
    onChange: (value: string) => void;
    className?: string;
};

export default function DateInput(props: Props) {
    const {id, value, min, onChange, className} = props;
    const inputRef = useRef<HTMLInputElement>(null);
    const theme = useSelector(getTheme);

    const handleIconClick = () => {
        if (inputRef.current && typeof inputRef.current.showPicker === 'function') {
            inputRef.current.showPicker();
        } else {
            inputRef.current?.focus();
        }
    };

    return (
        <div className='date-input-wrapper'>
            <input
                id={id}
                ref={inputRef}
                type='date'
                value={value}
                min={min}
                onChange={(e) => onChange(e.target.value)}
                className={className}
            />
            <button
                type='button'
                onClick={handleIconClick}
                className='date-input-icon'
                aria-label='Open date picker'
            >
                <CalendarOutlineIcon
                    size={22}
                    color={theme.centerChannelColor}
                />
            </button>
        </div>
    );
}
