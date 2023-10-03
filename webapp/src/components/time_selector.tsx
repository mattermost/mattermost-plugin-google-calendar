import React, {useMemo} from 'react';
import {useSelector} from 'react-redux';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import {getTodayString} from '@/utils/datetime';

import ReactSelectSetting from './react_select_setting';

const minuteStep = 15;

type Props = {
    value: string;
    onChange: (value: string) => void;
    startTime?: string
    endTime?: string
    date?: string
}

type Option = {
    label: string
    value: string
}

export default function TimeSelector(props: Props) {
    const theme = useSelector(getTheme);

    const options: Option[] = useMemo(() => {
        let fromHour = 0;
        let fromMinute = 0;
        let toHour = 23;
        let toMinute = 45;
        let ranges: string[] = [];

        // Handle fields not allowing times before the current time if the date selected is the current day
        if (props.date === getTodayString()) {
            const now = new Date();
            fromHour = now.getHours();
            fromMinute = (Math.ceil(now.getMinutes() / 15) * 15) % 60;
            if (fromMinute === 0) {
                fromHour++;
            }
            ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
        }

        // Handle end time not allowing dates before the startTime field
        if (props.startTime) {
            const parts = props.startTime.split(':');
            fromHour = parseInt(parts[0], 10);
            fromMinute = parseInt(parts[1], 10) + minuteStep;
            ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
        }

        // Handle start time not allowing dates after the endTime field
        if (props.endTime) {
            const parts = props.endTime.split(':');
            toHour = parseInt(parts[0], 10);
            toMinute = parseInt(parts[1], 10);
            ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
        }

        if (!ranges.length) {
            ranges = generateMilitaryTimeArray();
        }

        return ranges.map((t) => ({
            label: t,
            value: t,
        }));
    }, [props.startTime, props.endTime, props.date]);

    let value: Option | undefined | null = options[0];
    if (props.value) {
        value = options.find((option: Option) => option.value === props.value);
    }

    const handleChange = (_: string, newValue: string) => {
        props.onChange(newValue);
    };

    return (
        <ReactSelectSetting
            value={value}
            onChange={handleChange}
            theme={theme}
            options={options}
        />
    );
}

const generateMilitaryTimeArray = (fromHour = 0, fromMinute = 0, toHour = 23, toMinute = 45, step = minuteStep) => {
    const timeArray = [];
    for (let hour = fromHour; hour <= toHour; hour++) {
        if (hour !== fromHour) {
            fromMinute = 0;
        }
        if (hour !== toHour) {
            toMinute = 45;
        }
        for (let minute = fromMinute; minute <= toMinute; minute += step) {
            const formattedHour = hour.toString().padStart(2, '0');
            const formattedMinute = minute.toString().padStart(2, '0');
            const timeString = `${formattedHour}:${formattedMinute}`;
            timeArray.push(timeString);
        }
    }
    return timeArray;
};
