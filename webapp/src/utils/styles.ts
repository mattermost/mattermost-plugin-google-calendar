// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Theme} from 'mattermost-redux/selectors/entities/preferences';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

export const getBaseStyles = (theme: Theme) => {
    return {
        codeBlock: ({
            padding: '10px 12px',
            background: changeOpacity(theme.centerChannelColor, 0.08),
            borderRadius: '4px',
            marginTop: '8px',
            marginBottom: '8px',
            fontSize: '13px',
        }),
    };
};

export const getModalStyles = (theme: Theme) => ({
    modalBody: {
        padding: '2em 2em 3em',
        color: theme.centerChannelColor,
        backgroundColor: theme.centerChannelBg,
    },
    modalFooter: {
        padding: '2rem 15px',
    },
    descriptionArea: {
        height: 'auto',
        width: '100%',
        color: '#000',
    },
});

export const getStyleForReactSelect = (theme: Theme) => {
    if (!theme) {
        return {};
    }

    return {
        menuPortal: (provided) => ({
            ...provided,
            zIndex: 9999,
        }),
        control: (provided, state) => ({
            ...provided,
            color: theme.centerChannelColor,
            background: theme.centerChannelBg,

            // Overwrittes the different states of border
            borderColor: state.isFocused ? changeOpacity(theme.centerChannelColor, 0.25) : changeOpacity(theme.centerChannelColor, 0.2),
            padding: '2px 4px 2px 6px',

            // Removes weird border around container
            boxShadow: 'inset 0 1px 1px ' + changeOpacity(theme.centerChannelColor, 0.075),
            borderRadius: '4px',

            '&:hover': {
                borderColor: changeOpacity(theme.centerChannelColor, 0.25),
            },
        }),
        option: (provided, state) => ({
            ...provided,
            background: state.isFocused ? changeOpacity(theme.centerChannelColor, 0.12) : theme.centerChannelBg,
            color: theme.centerChannelColor,
            '&:hover': {
                background: changeOpacity(theme.centerChannelColor, 0.12),
            },
        }),
        clearIndicator: (provided) => ({
            ...provided,
            width: '34px',
            color: changeOpacity(theme.centerChannelColor, 0.4),
            transform: 'scaleX(1.15)',
            marginRight: '-10px',
            '&:hover': {
                color: theme.centerChannelColor,
            },
        }),
        multiValue: (provided) => ({
            ...provided,
            background: changeOpacity(theme.centerChannelColor, 0.15),
        }),
        multiValueLabel: (provided) => ({
            ...provided,
            color: theme.centerChannelColor,
            paddingBottom: '4px',
            paddingLeft: '8px',
            fontSize: '90%',
        }),
        multiValueRemove: (provided) => ({
            ...provided,
            transform: 'translateX(-2px) scaleX(1.15)',
            color: changeOpacity(theme.centerChannelColor, 0.4),
            '&:hover': {
                background: 'transparent',
            },
        }),
        menu: (provided) => ({
            ...provided,
            color: theme.centerChannelColor,
            background: theme.centerChannelBg,
            border: '1px solid ' + changeOpacity(theme.centerChannelColor, 0.2),
            borderRadius: '0 0 2px 2px',
            boxShadow: changeOpacity(theme.centerChannelColor, 0.2) + ' 1px 3px 12px',
            marginTop: '4px',
        }),
        input: (provided) => ({
            ...provided,
            color: theme.centerChannelColor,
        }),
        placeholder: (provided) => ({
            ...provided,
            color: theme.centerChannelColor,
        }),
        dropdownIndicator: (provided) => ({
            ...provided,

            '&:hover': {
                color: theme.centerChannelColor,
            },
        }),
        singleValue: (provided) => ({
            ...provided,
            color: theme.centerChannelColor,
        }),
        indicatorSeparator: (provided) => ({
            ...provided,
            display: 'none',
        }),
    };
};

// Calendar icon SVG from Mattermost Compass Icons (icon-calendar-outline) as a data URI for use with CSS mask
const calendarIconSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'%3E%3Cpath d='M791.7 125H750V41.7H666.7V125H333.3V41.7H250V125H208.3C162.1 125 125 162.5 125 208.3V791.7C125 837.5 162.1 875 208.3 875H791.7C837.5 875 875 837.5 875 791.7V208.3C875 162.5 837.5 125 791.7 125ZM791.7 791.7H208.3V375H791.7V791.7ZM791.7 291.7H208.3V208.3H791.7V291.7ZM291.7 458.3H500V666.7H291.7Z'/%3E%3C/svg%3E";

export const getStyleForDateInput = (theme: Theme): React.CSSProperties => {
    if (!theme) {
        return {};
    }

    return {
        '--date-picker-icon-color': changeOpacity(theme.centerChannelColor, 0.6),
        '--date-picker-icon-color-hover': theme.centerChannelColor,
        '--date-picker-icon': `url("${calendarIconSvg}")`,
        '--date-picker-icon-size': '22px',
        '--date-picker-clickable-size': '28px',
    } as React.CSSProperties;
};
