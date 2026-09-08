import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import ReactSelect, {ActionMeta, GroupBase, Props as ReactSelectBaseProps} from 'react-select';
import AsyncSelect from 'react-select/async';
import CreatableSelect from 'react-select/creatable';

import {Theme} from 'mattermost-redux/selectors/entities/preferences';

import Setting from '@/components/setting';

import {getStyleForReactSelect} from '@/utils/styles';

type ReactSelectOption = {
    label: string;
    value: string;
}

const MAX_NUM_OPTIONS = 100;

type OmitKeys<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type Props = OmitKeys<ReactSelectBaseProps<ReactSelectOption, boolean, GroupBase<ReactSelectOption>>, 'theme' | 'onChange'> & {
    theme: Theme;
    label?: React.ReactNode;
    onChange?: (name: string | undefined, value: string | string[] | null) => void;
    addValidate?: (isValid: () => boolean) => void;
    removeValidate?: (isValid: () => boolean) => void;
    allowUserDefinedValue?: boolean;
    limitOptions?: boolean;
    resetInvalidOnChange?: boolean;
};

function getComparableValue(v: Props['value']): string | null {
    if (!v) {
        return null;
    }
    if (Array.isArray(v)) {
        return (v as ReactSelectOption[]).map((o) => o.value).sort().join(',');
    }
    return (v as ReactSelectOption).value;
}

function ReactSelectSetting(props: Props) {
    const {
        theme,
        label,
        addValidate,
        removeValidate,
        allowUserDefinedValue,
        limitOptions,
        resetInvalidOnChange,
        onChange,
        ...selectProps
    } = props;

    const [invalid, setInvalid] = useState(false);
    const prevValueRef = useRef(getComparableValue(props.value));
    const valueRef = useRef(props.value);
    const requiredRef = useRef(props.required);
    valueRef.current = props.value;
    requiredRef.current = props.required;

    const isValid = useCallback(() => {
        if (!requiredRef.current) {
            return true;
        }

        let valid = Boolean(valueRef.current);
        if (valueRef.current && Array.isArray(valueRef.current)) {
            valid = Boolean(valueRef.current.length);
        }

        setInvalid(!valid);
        return valid;
    }, []);

    useEffect(() => {
        addValidate?.(isValid);
        return () => {
            removeValidate?.(isValid);
        };
    }, [addValidate, removeValidate, isValid]);

    useEffect(() => {
        const current = getComparableValue(props.value);
        if (invalid && current !== prevValueRef.current) {
            let valueIsValid = Boolean(props.value);
            if (props.value && Array.isArray(props.value)) {
                valueIsValid = Boolean(props.value.length);
            }
            if (valueIsValid) {
                setInvalid(false);
            }
        }
        prevValueRef.current = current;
    }, [props.value, invalid]);

    const handleChange = useCallback((value: readonly ReactSelectOption[] | ReactSelectOption | null, _action: ActionMeta<ReactSelectOption>) => {
        if (onChange) {
            if (Array.isArray(value)) {
                onChange(props.name, (value as ReactSelectOption[]).map((x) => x.value));
            } else {
                const single = value as ReactSelectOption | null;
                onChange(props.name, single ? single.value : null);
            }
        }
        if (resetInvalidOnChange) {
            setInvalid(false);
        }
    }, [onChange, props.name, resetInvalidOnChange]);

    const filterOptions = useCallback((input: string) => {
        const raw = props.options ?? [];

        const limitResults = (entries: readonly (ReactSelectOption | GroupBase<ReactSelectOption>)[]) => {
            const result: (ReactSelectOption | GroupBase<ReactSelectOption>)[] = [];
            let count = 0;
            for (const entry of entries) {
                if (count >= MAX_NUM_OPTIONS) {
                    break;
                }
                if ('options' in entry) {
                    const remaining = MAX_NUM_OPTIONS - count;
                    const children = entry.options.slice(0, remaining);
                    result.push({...entry, options: children});
                    count += children.length;
                } else {
                    result.push(entry);
                    count += 1;
                }
            }
            return result;
        };

        if (!input) {
            return Promise.resolve(limitResults(raw));
        }
        const term = input.toUpperCase();
        const filtered: (ReactSelectOption | GroupBase<ReactSelectOption>)[] = [];
        for (const entry of raw) {
            if ('options' in entry) {
                const children = entry.options.filter((child) => child.label?.toUpperCase().includes(term));
                if (children.length) {
                    filtered.push({...entry, options: children});
                }
            } else if (entry.label?.toUpperCase().includes(term)) {
                filtered.push(entry);
            }
        }
        return Promise.resolve(limitResults(filtered));
    }, [props.options]);

    const requiredMsg = 'This field is required.';
    let validationError = null;

    if (props.required && invalid) {
        validationError = (
            <p className='help-text error-text'>
                <span>{requiredMsg}</span>
            </p>
        );
    }

    const inputId = selectProps.inputId || props.name;

    let selectComponent = null;
    if (limitOptions && (selectProps.options?.length ?? 0) > MAX_NUM_OPTIONS) {
        selectComponent = (
            <AsyncSelect
                {...selectProps}
                inputId={inputId}
                loadOptions={filterOptions}
                defaultOptions={true}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                styles={getStyleForReactSelect(theme)}
            />
        );
    } else if (allowUserDefinedValue) {
        selectComponent = (
            <CreatableSelect
                {...selectProps}
                inputId={inputId}
                noOptionsMessage={() => 'Start typing...'}
                formatCreateLabel={(value) => `Add "${value}"`}
                placeholder=''
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                styles={getStyleForReactSelect(theme)}
            />
        );
    } else {
        selectComponent = (
            <ReactSelect
                {...selectProps}
                inputId={inputId}
                menuPortalTarget={document.body}
                menuPlacement='auto'
                onChange={handleChange}
                styles={getStyleForReactSelect(theme)}
            />
        );
    }

    return (
        <Setting
            inputId={inputId}
            label={props.label}
            required={props.required}
        >
            {selectComponent}
            {validationError}
        </Setting>
    );
}

export default memo(ReactSelectSetting);
