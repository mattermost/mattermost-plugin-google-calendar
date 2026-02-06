// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef} from 'react';
import {useSelector} from 'react-redux';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {CalendarOutlineIcon} from '@mattermost/compass-icons/components';

type Props = {
    value: string;
    min?: string;
    onChange: (value: string) => void;
    className?: string;
};

export default function DateInput(props: Props) {
    const {value, min, onChange, className} = props;
    const inputRef = useRef<HTMLInputElement>(null);
    const theme = useSelector(getTheme);

    const handleIconClick = () => {
        inputRef.current?.showPicker();
    };

    return (
        <div className='date-input-wrapper'>
            <input
                ref={inputRef}
                type='date'
                value={value}
                min={min}
                onChange={(e) => onChange(e.target.value)}
                className={className}
            />
            <span
                onClick={handleIconClick}
                className='date-input-icon'
            >
                <CalendarOutlineIcon
                    size={22}
                    color={theme.centerChannelColor}
                />
            </span>
        </div>
    );
}
