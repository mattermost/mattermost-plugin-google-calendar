import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import {Combobox, type ComboboxOption} from '@mattermost/compass-ui/components/combobox';
import {ErrorMessage} from '@mattermost/compass-ui/components/error-message';

import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import {useAppDispatch} from '@/hooks';
import {Z_INDEX_MENU_PORTAL} from '@/utils/styles';
import {autocompleteUserChannels} from '@/actions';

type Props = {
    inputId?: string;
    onChange: (selected: string) => void;
    value: string | null;
};

/**
 * Single-select input for a channel the user can post to, with async
 * autocomplete and resolution of a pre-selected channel ID to its label.
 */
export default function ChannelSelector(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const teamId = useSelector(getCurrentTeamId);
    const dispatch = useAppDispatch();

    const loadOptions = useCallback(async (input: string) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);

        try {
            const response = await dispatch(autocompleteUserChannels(input, teamId));

            if (requestId !== requestIdRef.current) {
                return;
            }

            if (response.error) {
                setStoredError(response.error);
                setOptions([]);
                return;
            }

            setStoredError('');

            const loaded = (response.data ?? []).map((c) => ({
                label: c.display_name,
                value: c.id,
            }));
            setOptions(loaded);

            if (props.value) {
                const match = loaded.find((o) => o.value === props.value);
                if (match) {
                    setSelectedOption(match);
                }
            }
        } catch (err) {
            if (requestId === requestIdRef.current) {
                setStoredError(String(err));
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [dispatch, teamId, props.value]);

    useEffect(() => {
        if (props.value && selectedOption?.value !== props.value) {
            loadOptions('');
        } else if (!props.value) {
            ++requestIdRef.current;
            setSelectedOption(null);
            setLoading(false);
        }
    }, [props.value]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadOptions('');
    }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (selected: string | string[] | null) => {
        const value = typeof selected === 'string' ? selected : '';
        setSelectedOption(options.find((o) => o.value === value) ?? null);
        props.onChange(value);
    };

    const resolved = props.value && selectedOption?.value === props.value ? selectedOption : null;

    return (
        <>
            <Combobox
                id={props.inputId}
                label='Link event to channel (optional)'
                filter={false}
                clearable={true}
                loading={loading}
                value={props.value || null}
                options={options}
                selectedOptions={resolved ? [resolved] : []}
                onChange={handleChange}
                onInputChange={loadOptions}
                invalid={Boolean(storedError)}
                zIndex={Z_INDEX_MENU_PORTAL}
            />
            {storedError && <ErrorMessage message={storedError}/>}
        </>
    );
}
