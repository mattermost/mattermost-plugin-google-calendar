import React, {useCallback, useState} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import AsyncSelect from 'react-select/async';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import {getStyleForReactSelect} from '../utils/styles';
import {AutocompleteChannelsResponse, autocompleteUserChannels} from '../actions';

type SelectOption = {
    label: string;
    value: string;
}

type Props = {
    onChange: (selected: string) => void;
    value: string[];
};

export default function ChannelSelector(props: Props) {
    const [storedError, setStoredError] = useState('');

    const theme = useSelector(getTheme);
    const teamId = useSelector(getCurrentTeamId);

    const dispatch = useDispatch();

    const loadOptions = useCallback(async (input: string): Promise<SelectOption[]> => {
        const response = (await dispatch(autocompleteUserChannels(input, teamId)) as unknown as AutocompleteChannelsResponse);

        if (response.error) {
            setStoredError(response.error);
            return [];
        }

        setStoredError('');

        return response.data.map((c) => ({
            label: c.display_name,
            value: c.id,
        }));
    }, []);

    const handleChange = (selected: SelectOption) => {
        props.onChange(selected.value);
    };

    return (
        <>
            <AsyncSelect
                value={props.value}
                loadOptions={loadOptions}
                defaultOptions={true}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                styles={getStyleForReactSelect(theme)}
                isMulti={false}
            />
            {storedError && (
                <div>
                    <span className='error-text'>{storedError}</span>
                </div>
            )}
        </>
    );
}
