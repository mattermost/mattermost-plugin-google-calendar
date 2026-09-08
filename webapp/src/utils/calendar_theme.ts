import type {CSSProperties} from 'react';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

export interface MattermostTheme {
    centerChannelBg: string;
    centerChannelColor: string;
    sidebarBg: string;
    sidebarText: string;
    sidebarTextActiveBorder: string;
    buttonBg: string;
    buttonColor: string;
    linkColor: string;
    onlineIndicator: string;
    awayIndicator: string;
    dndIndicator: string;
    mentionBg: string;
    mentionColor: string;
    mentionJewelBg: string;
    [key: string]: string;
}

export function getCalendarCSSVars(theme: MattermostTheme): Record<string, string> {
    return {
        '--fc-page-bg-color': theme.centerChannelBg,
        '--fc-neutral-bg-color': changeOpacity(theme.centerChannelColor, 0.06),
        '--fc-neutral-text-color': changeOpacity(theme.centerChannelColor, 0.6),
        '--fc-border-color': changeOpacity(theme.centerChannelColor, 0.12),
        '--fc-event-bg-color': theme.buttonBg,
        '--fc-event-border-color': theme.buttonBg,
        '--fc-event-text-color': theme.buttonColor,
        '--fc-today-bg-color': changeOpacity(theme.buttonBg, 0.08),
        '--fc-now-indicator-color': theme.mentionJewelBg || theme.linkColor,
        '--fc-button-text-color': theme.buttonColor,
        '--fc-button-bg-color': theme.buttonBg,
        '--fc-button-border-color': theme.buttonBg,
        '--fc-button-hover-bg-color': changeOpacity(theme.buttonBg, 0.85),
        '--fc-button-hover-border-color': changeOpacity(theme.buttonBg, 0.85),
        '--fc-button-active-bg-color': changeOpacity(theme.buttonBg, 0.75),
        '--fc-button-active-border-color': changeOpacity(theme.buttonBg, 0.75),
        '--fc-small-font-size': '0.85em',
    };
}

export function getShowAsColor(showAs: string | undefined, theme: MattermostTheme): string {
    switch (showAs) {
    case 'free':
        return changeOpacity(theme.centerChannelColor, 0.2);
    case 'tentative':
        return theme.awayIndicator || changeOpacity(theme.buttonBg, 0.5);
    case 'oof':
        return theme.dndIndicator || '#D24B4E';
    case 'busy':
    default:
        return theme.buttonBg;
    }
}

export interface EventStyle {
    backgroundColor: string;
    borderColor: string;
    borderStyle: string;
    borderWidth: string;
    textColor: string;
    classNames: string[];
}

export function getEventStyle(event: {showAs?: string; responseStatus?: {response?: string}}, theme: MattermostTheme): EventStyle {
    const baseColor = theme.buttonBg;
    const response = event.responseStatus?.response;

    switch (response) {
    case 'accepted':
        return {
            backgroundColor: changeOpacity(baseColor, 0.8),
            borderColor: baseColor,
            borderStyle: 'solid',
            borderWidth: '0px',
            textColor: theme.buttonColor,
            classNames: [],
        };
    case 'tentative':
    case 'tentativelyAccepted':
        return {
            backgroundColor: changeOpacity(baseColor, 0.3),
            borderColor: baseColor,
            borderStyle: 'dashed',
            borderWidth: '1px',
            textColor: theme.centerChannelColor,
            classNames: ['gcal-event--tentative'],
        };
    case 'declined':
        return {
            backgroundColor: 'transparent',
            borderColor: changeOpacity(theme.centerChannelColor, 0.32),
            borderStyle: 'solid',
            borderWidth: '1px',
            textColor: changeOpacity(theme.centerChannelColor, 0.56),
            classNames: ['gcal-event--declined'],
        };
    case 'needsAction':
    case 'not_answered':
    case 'notResponded':
        return {
            backgroundColor: 'transparent',
            borderColor: baseColor,
            borderStyle: 'solid',
            borderWidth: '1px 1px 1px 1px',
            textColor: theme.centerChannelColor,
            classNames: ['gcal-event--pending'],
        };
    default: {
        const fallback = getShowAsColor(event.showAs, theme);
        return {
            backgroundColor: fallback,
            borderColor: fallback,
            borderStyle: 'solid',
            borderWidth: '1px',
            textColor: theme.buttonColor,
            classNames: [],
        };
    }
    }
}

export function getContainerStyle(theme: MattermostTheme): CSSProperties {
    return {
        color: theme.centerChannelColor,
        backgroundColor: theme.centerChannelBg,
        height: '100%',
        ...getCalendarCSSVars(theme),
    } as CSSProperties;
}
