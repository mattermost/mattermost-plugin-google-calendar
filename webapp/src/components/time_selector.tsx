import React, {useMemo} from 'react';
import {useSelector} from 'react-redux';

import {Select} from '@mattermost/compass-ui/components/select';
import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';

import {MINUTE_STEP, getNextTimeStep, getTodayString} from '@/utils/datetime';
import {CreateEventPayload} from '@/types/calendar_api_types';

import {Z_INDEX_MENU_PORTAL} from '@/utils/styles';

type Props = {
    inputId?: string;
    label?: React.ReactNode;
    name: 'start_time' | 'end_time';
    value: string;
    onChange: (name: keyof CreateEventPayload, value: string) => void;
    startTime?: string;
    endTime?: string;
    date?: string;
}

type Option = {
    label: string
    value: string
}

/**
 * Select dropdown of time-of-day options in MINUTE_STEP increments, constrained
 * by the current time (for today's date) and by the paired start/end time.
 */
export default function TimeSelector(props: Props) {
    const timezone = useSelector(getCurrentTimezone);

    const isStartTimeSelector = props.name === 'start_time';
    const isEndTimeSelector = props.name === 'end_time';

    const options: Option[] = useMemo(() => {
        let fromHour = 0;
        let fromMinute = 0;
        let toHour = 23;
        let toMinute = isStartTimeSelector ? 30 : 45;
        let ranges: string[] = [];
        let constrainedByDate = false;

        if (props.date === getTodayString(timezone)) {
            constrainedByDate = true;
            const next = getNextTimeStep(timezone);
            fromHour = next.hour;
            fromMinute = next.minute;
            ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
        }

        if (props.startTime) {
            const parsed = parseHHMM(props.startTime);
            fromHour = parsed.hour;
            fromMinute = parsed.minute + MINUTE_STEP;
            const extraHours = Math.floor(fromMinute / 60);
            fromMinute %= 60;
            fromHour += extraHours;
            if (fromHour < 24) {
                ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
            }
        }

        if (props.endTime) {
            const parsed = parseHHMM(props.endTime);
            toHour = parsed.hour;
            toMinute = parsed.minute;
            if (isStartTimeSelector) {
                const endTotal = (toHour * 60) + toMinute;
                const maxStartTotal = endTotal - MINUTE_STEP;
                if (maxStartTotal < 0) {
                    return [];
                }
                toHour = Math.floor(maxStartTotal / 60);
                toMinute = maxStartTotal % 60;
            }
            ranges = generateMilitaryTimeArray(fromHour, fromMinute, toHour, toMinute);
        }

        if (!ranges.length && !props.startTime && !constrainedByDate) {
            ranges = generateMilitaryTimeArray(0, 0, toHour, toMinute);
        }

        return ranges.map((t) => ({
            label: t,
            value: t,
        }));
    }, [props.startTime, props.endTime, props.date, props.name, isStartTimeSelector, timezone]);

    const value = props.value && options.some((o) => o.value === props.value) ? props.value : '';

    const handleChange = (selectedTime: string) => {
        if (!selectedTime) {
            return;
        }
        props.onChange(props.name, selectedTime);

        if (isStartTimeSelector) {
            const idx = options.findIndex((o) => o.value === selectedTime);
            if (idx >= 0 && idx + 1 < options.length) {
                const endIdx = Math.min(idx + 2, options.length - 1);
                props.onChange('end_time', options[endIdx].value);
            }
        }
    };

    return (
        <Select
            id={props.inputId}
            label={props.label}
            value={value}
            onChange={handleChange}
            options={options}
            zIndex={Z_INDEX_MENU_PORTAL}
        />
    );
}

/** Parses an "HH:MM" string into numeric hour/minute, defaulting invalid parts to 0. */
const parseHHMM = (time: string): {hour: number; minute: number} => {
    const parts = time.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    return {
        hour: Number.isNaN(hour) ? 0 : hour,
        minute: Number.isNaN(minute) ? 0 : minute,
    };
};

/** Generates "HH:MM" time strings in `step`-minute increments between the given bounds. */
const generateMilitaryTimeArray = (fromHour = 0, fromMinute = 0, toHour = 23, toMinute = 45, step = MINUTE_STEP) => {
    const timeArray = [];
    for (let hour = fromHour; hour <= toHour; hour++) {
        const startMinute = hour === fromHour ? fromMinute : 0;
        const endMinute = hour === toHour ? toMinute : 45;
        for (let minute = startMinute; minute <= endMinute; minute += step) {
            const formattedHour = hour.toString().padStart(2, '0');
            const formattedMinute = minute.toString().padStart(2, '0');
            const timeString = `${formattedHour}:${formattedMinute}`;
            timeArray.push(timeString);
        }
    }
    return timeArray;
};
