import {createSelector} from 'reselect';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {GlobalState} from '@mattermost/types/store';

import {PluginId} from '../plugin_id';

import {ProviderConfig, ReducerState} from '../reducers';
import {RemoteEvent} from '../types/calendar';

/** Returns this plugin's slice of the Redux store. */
const getPluginState = (state: GlobalState): ReducerState =>
    (state as unknown as Record<string, ReducerState>)['plugins-' + PluginId] || ({} as ReducerState);

/** Returns the server's configured site URL (no trailing slash), falling back to the current origin. */
export const getSiteURL = (state: GlobalState): string => {
    const config = getConfig(state);
    if (config?.SiteURL) {
        return config.SiteURL.replace(/\/+$/, '');
    }
    return window.location.origin;
};

/** Returns the absolute base URL for this plugin's server-side API routes. */
export const getPluginServerRoute = (state: GlobalState): string => {
    return getSiteURL(state) + '/plugins/' + PluginId;
};

/** Returns the current user's locale, defaulting to 'en' when unset. */
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

/** Returns whether the create-event modal is currently open. */
export const isCreateEventModalVisible = (state: GlobalState) => getPluginState(state).createEventModalVisible;

/** Returns the pre-fill data for the create-event modal. */
export const getCreateEventModal = (state: GlobalState) => getPluginState(state).createEventModal;

/** Returns whether the current user has connected their calendar account, or null if unknown. */
export const isUserConnected = (state: GlobalState): boolean | null => getPluginState(state).userConnected;

/** Returns the active calendar provider's configuration, or null if not yet loaded. */
export const getProviderConfiguration = (state: GlobalState): ProviderConfig | null => getPluginState(state).providerConfiguration;

/** Returns the events cached for the currently active calendar view range. */
export function getCalendarEvents(state: GlobalState): RemoteEvent[] {
    const eventsState = getPluginState(state).events;
    if (!eventsState?.activeKey) {
        return [];
    }
    return eventsState.cache?.[eventsState.activeKey] || [];
}

/** Returns whether the active calendar view's events are currently loading. */
export function getCalendarEventsLoading(state: GlobalState): boolean {
    return getPluginState(state).events?.loading || false;
}

/** Returns the error message for the active calendar view's last fetch, if any. */
export function getCalendarEventsError(state: GlobalState): string | null {
    return getPluginState(state).events?.error || null;
}
