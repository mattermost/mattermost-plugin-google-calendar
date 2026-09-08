import React, {useCallback, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import {GroupBase} from 'react-select';
import AsyncCreatableSelect from 'react-select/async-creatable';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import {useAppDispatch} from '@/hooks';
import {getStyleForReactSelect} from '@/utils/styles';
import {autocompleteConnectedUsers} from '@/actions';

type SelectOption = {
    label: string;
    value: string;
}

type Props = {
    inputId?: string;
    onChange: (selected: string[]) => void;
    value: string[];
};

export default function AttendeeSelector(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [labelMap, setLabelMap] = useState<Record<string, string>>({});
    const requestIdRef = useRef(0);

    const theme = useSelector(getTheme);

    const dispatch = useAppDispatch();

    const loadOptions = useCallback(async (input: string): Promise<SelectOption[]> => {
        const requestId = ++requestIdRef.current;
        const response = await dispatch(autocompleteConnectedUsers(input));

        if (requestId !== requestIdRef.current) {
            return [];
        }

        if (response.error) {
            setStoredError(response.error);
            return [];
        }

        setStoredError('');

        const options = (response.data ?? []).map((u) => ({
            label: u.mm_display_name,
            value: u.mm_id,
        }));

        setLabelMap((prev) => {
            const next = {...prev};
            for (const opt of options) {
                next[opt.value] = opt.label;
            }
            return next;
        });

        return options;
    }, [dispatch]);

    const isValidNewOption = (
        input: string,
        _selectValue: readonly SelectOption[],
        selectOptions: readonly (SelectOption | GroupBase<SelectOption>)[],
    ): boolean => {
        const trimmed = input.trim().toLowerCase();
        if (!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(trimmed)) {
            return false;
        }
        const inSelected = props.value.some((v) => v.trim().toLowerCase() === trimmed);
        const inOptions = selectOptions.some((opt) =>
            'value' in opt && opt.value.trim().toLowerCase() === trimmed,
        );
        return !inSelected && !inOptions;
    };

    const handleChange = (selected: readonly SelectOption[] | null) => {
        if (selected) {
            setLabelMap((prev) => {
                const next = {...prev};
                for (const opt of selected) {
                    next[opt.value.trim()] = opt.label.trim();
                }
                return next;
            });
        }
        props.onChange(selected ? selected.map((option) => option.value.trim()) : []);
    };

    const selectedValues = props.value.map((v) => ({
        label: labelMap[v] || v,
        value: v,
    }));

    return (
        <>
            <AsyncCreatableSelect<SelectOption, true>
                inputId={props.inputId}
                value={selectedValues}
                loadOptions={loadOptions}
                defaultOptions={true}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                isValidNewOption={isValidNewOption}
                styles={getStyleForReactSelect(theme)}
                isMulti={true}
            />
            {storedError && (
                <div role='alert'>
                    <span className='error-text'>{storedError}</span>
                </div>
            )}
        </>
    );
}
