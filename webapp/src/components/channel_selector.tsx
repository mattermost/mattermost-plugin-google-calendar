import {useCallback, useEffect, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import AsyncSelect from 'react-select/async';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import {useAppDispatch} from '@/hooks';
import {getStyleForReactSelect} from '@/utils/styles';
import {autocompleteUserChannels} from '@/actions';

type SelectOption = {
    label: string;
    value: string;
}

type Props = {
    inputId?: string;
    onChange: (selected: string) => void;
    value: string | null;
};

export default function ChannelSelector(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [selectedOption, setSelectedOption] = useState<SelectOption | null>(null);
    const [resolving, setResolving] = useState(Boolean(props.value));
    const requestIdRef = useRef(0);

    const theme = useSelector(getTheme);
    const teamId = useSelector(getCurrentTeamId);

    const dispatch = useAppDispatch();

    const loadOptions = useCallback(async (input: string): Promise<SelectOption[]> => {
        const requestId = ++requestIdRef.current;

        try {
            const response = await dispatch(autocompleteUserChannels(input, teamId));

            if (requestId !== requestIdRef.current) {
                return [];
            }

            if (response.error) {
                setStoredError(response.error);
                return [];
            }

            setStoredError('');

            const options = (response.data ?? []).map((c) => ({
                label: c.display_name,
                value: c.id,
            }));

            if (props.value) {
                const match = options.find((o) => o.value === props.value);
                if (match) {
                    setSelectedOption(match);
                }
            }

            return options;
        } catch (err) {
            if (requestId === requestIdRef.current) {
                setStoredError(String(err));
            }
            return [];
        } finally {
            if (requestId === requestIdRef.current) {
                setResolving(false);
            }
        }
    }, [dispatch, teamId, props.value]);

    useEffect(() => {
        if (props.value && selectedOption?.value !== props.value) {
            setResolving(true);
            loadOptions('');
        } else if (!props.value) {
            ++requestIdRef.current;
            setSelectedOption(null);
            setResolving(false);
        }
    }, [props.value]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (selected: SelectOption | null) => {
        setSelectedOption(selected);
        props.onChange(selected ? selected.value : '');
    };

    const displayValue: SelectOption | null =
        (props.value && selectedOption?.value === props.value) ? selectedOption : null;

    return (
        <>
            <AsyncSelect<SelectOption, false>
                inputId={props.inputId}
                value={displayValue}
                loadOptions={loadOptions}
                defaultOptions={true}
                isLoading={resolving}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                styles={getStyleForReactSelect(theme)}
                isMulti={false}
                isClearable={true}
            />
            {storedError && (
                <div role='alert'>
                    <span className='error-text'>{storedError}</span>
                </div>
            )}
        </>
    );
}
