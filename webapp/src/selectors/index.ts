import {createSelector} from 'reselect';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {GlobalState} from '@mattermost/types/store';

import {PluginId} from '../plugin_id';

import {ProviderConfig, ReducerState} from '../reducers';
import {RemoteEvent} from '../types/calendar';

const getPluginState = (state: GlobalState): ReducerState =>
    (state as unknown as Record<string, ReducerState>)['plugins-' + PluginId] || ({} as ReducerState);

export const getSiteURL = (state: GlobalState): string => {
    const config = getConfig(state);
    if (config?.SiteURL) {
        return config.SiteURL.replace(/\/+$/, '');
    }
    return window.location.origin;
};

export const getPluginServerRoute = (state: GlobalState): string => {
    return getSiteURL(state) + '/plugins/' + PluginId;
};

export const getCurrentUserLocale = createSelector(
    getCurrentUser,
    (user) => {
        let locale = 'en';
        if (user && user.locale) {
            locale = user.locale;
        }

        return locale;
    },
);

export const isCreateEventModalVisible = (state: GlobalState) => getPluginState(state).createEventModalVisible;

export const getCreateEventModal = (state: GlobalState) => getPluginState(state).createEventModal;

export const isUserConnected = (state: GlobalState): boolean | null => getPluginState(state).userConnected;

export const getProviderConfiguration = (state: GlobalState): ProviderConfig | null => getPluginState(state).providerConfiguration;

export function getCalendarEvents(state: GlobalState): RemoteEvent[] {
    const eventsState = getPluginState(state).events;
    if (!eventsState?.activeKey) {
        return [];
    }
    return eventsState.cache?.[eventsState.activeKey] || [];
}

export function getCalendarEventsLoading(state: GlobalState): boolean {
    return getPluginState(state).events?.loading || false;
}

export function getCalendarEventsError(state: GlobalState): string | null {
    return getPluginState(state).events?.error || null;
}
