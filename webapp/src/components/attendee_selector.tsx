import React, {useCallback, useEffect, useRef, useState} from 'react';

import {Combobox, type ComboboxOption} from '@mattermost/compass-ui/components/combobox';
import {ErrorMessage} from '@mattermost/compass-ui/components/error-message';

import {useAppDispatch} from '@/hooks';
import {Z_INDEX_MENU_PORTAL} from '@/utils/styles';
import {autocompleteConnectedUsers} from '@/actions';

type Props = {
    inputId?: string;
    onChange: (selected: string[]) => void;
    value: string[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Multi-select input for event attendees: autocompletes connected Mattermost
 * users and also accepts freeform, validated email addresses.
 */
export default function AttendeeSelector(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [labelMap, setLabelMap] = useState<Record<string, string>>({});
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const dispatch = useAppDispatch();

    const loadOptions = useCallback(async (input: string) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        const response = await dispatch(autocompleteConnectedUsers(input));

        if (requestId !== requestIdRef.current) {
            return;
        }
        setLoading(false);

        if (response.error) {
            setStoredError(response.error);
            setOptions([]);
            return;
        }

        setStoredError('');

        const loaded = (response.data ?? []).map((u) => ({
            label: u.mm_display_name,
            value: u.mm_id,
        }));

        setLabelMap((prev) => {
            const next = {...prev};
            for (const opt of loaded) {
                next[opt.value] = opt.label;
            }
            return next;
        });
        setOptions(loaded);
    }, [dispatch]);

    useEffect(() => {
        loadOptions('');
    }, [loadOptions]);

    const selectedOptions: ComboboxOption[] = props.value.map((v) => ({
        label: labelMap[v] || v,
        value: v,
    }));

    // Re-selecting a committed value toggles it off in Combobox, so hide them from the list.
    const selectable = options.filter((o) => !props.value.includes(o.value));

    const handleCreate = (input: string) => {
        const trimmed = input.trim();
        const lower = trimmed.toLowerCase();
        if (!EMAIL_PATTERN.test(lower) || props.value.some((v) => v.trim().toLowerCase() === lower)) {
            return;
        }
        props.onChange([...props.value, trimmed]);
    };

    const handleChange = (selected: string | string[] | null) => {
        const values = Array.isArray(selected) ? selected : [];
        props.onChange(values.map((v) => v.trim()));
    };

    return (
        <>
            <Combobox
                id={props.inputId}
                label='Guests (optional)'
                multiple={true}
                creatable={true}
                filter={false}
                loading={loading}
                value={props.value}
                options={selectable}
                selectedOptions={selectedOptions}
                onChange={handleChange}
                onInputChange={loadOptions}
                onCreateOption={handleCreate}
                invalid={Boolean(storedError)}
                zIndex={Z_INDEX_MENU_PORTAL}
            />
            {storedError && <ErrorMessage message={storedError}/>}
        </>
    );
}
