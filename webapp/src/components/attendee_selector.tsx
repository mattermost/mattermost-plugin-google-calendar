import React, {useCallback, useState} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import AsyncCreatableSelect from 'react-select/async-creatable';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import {getStyleForReactSelect} from '../utils/styles';
import {AutocompleteChannelsResponse, autocompleteConnectedUsers} from '../actions';

type SelectOption = {
    label: string;
    value: string;
}

type Props = {
    onChange: (selected: string[]) => void;
    value: string[];
};

export default function AttendeeSelector(props: Props) {
    const [storedError, setStoredError] = useState('');

    const theme = useSelector(getTheme);

    const dispatch = useDispatch();

    const loadOptions = useCallback(async (input: string): Promise<SelectOption[]> => {
        const response = (await dispatch(autocompleteConnectedUsers(input))) as AutocompleteChannelsResponse;

        if (response.error) {
            setStoredError(response.error);
            return [];
        }

        setStoredError('');

        return response.data.map((u) => ({
            label: u.mm_display_name,
            value: u.mm_id,
        }));
    }, []);

    const isValidEmail = (input: string): boolean => {
        return (/\S+@\S+\.\S+/).test(input);
    };

    const handleChange = (selected: SelectOption[]) => {
        props.onChange(selected.map((option) => option.value));
    };

    return (
        <>
            <AsyncCreatableSelect
                value={props.value}
                loadOptions={loadOptions}
                defaultOptions={true}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                isValidNewOption={isValidEmail}
                styles={getStyleForReactSelect(theme)}
                isMulti={true}
            />
            {storedError && (
                <div>
                    <span className='error-text'>{storedError}</span>
                </div>
            )}
        </>
    );
}
