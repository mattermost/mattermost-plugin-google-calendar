import {Client4, ClientError} from '@mattermost/client';
import {PostTypes} from 'mattermost-redux/action_types';
import {GlobalState} from '@mattermost/types/store';
import {haveIChannelPermission} from 'mattermost-redux/selectors/entities/roles';
import Permissions from 'mattermost-redux/constants/permissions';
import {Channel} from '@mattermost/types/channels';
import {AnyAction, Store} from 'redux';
import {ThunkAction} from 'redux-thunk';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';

import type {AppDispatch} from '@/hooks';

import ActionTypes from '../constants';
import {doFetch, doFetchWithResponse} from '../client';
import {PluginId} from '../plugin_id';
import {CreateEventPayload} from '../types/calendar_api_types';
import {RemoteEvent} from '../types/calendar';
import {getPluginServerRoute, getSiteURL} from '../selectors';
import type {ProviderConfig} from '../reducers';

type AppThunk<R = void> = ThunkAction<R, GlobalState, undefined, AnyAction>;

const client = new Client4();

export interface CreateEventPreFill {
    channelId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
}

export const openCreateEventModal = (channelIdOrPreFill: string | CreateEventPreFill) => {
    const data = typeof channelIdOrPreFill === 'string' ?
        {channelId: channelIdOrPreFill} :
        channelIdOrPreFill;

    return {
        type: ActionTypes.OPEN_CREATE_EVENT_MODAL,
        data,
    };
};

export const closeCreateEventModal = () => {
    return {
        type: ActionTypes.CLOSE_CREATE_EVENT_MODAL,
    };
};

type AutocompleteUser = {
    mm_id: string
    mm_username: string
    mm_display_name: string
}

export type AutocompleteConnectedUsersResponse = {data?: AutocompleteUser[]; error?: string};

export const autocompleteConnectedUsers = (input: string): AppThunk<Promise<AutocompleteConnectedUsersResponse>> => async (_, getState) => {
    const state = getState();
    const pluginServerRoute = getPluginServerRoute(state);

    return doFetchWithResponse(`${pluginServerRoute}/autocomplete/users?search=${encodeURIComponent(input)}`).
        then((response) => {
            return {data: response.data};
        }).
        catch((response) => {
            const error = response.message || 'An error occurred while searching for users.';
            return {data: [], error};
        });
};

export type AutocompleteChannelsResponse = {data?: Channel[]; error?: string};

export const autocompleteUserChannels = (input: string, teamId: string): AppThunk<Promise<AutocompleteChannelsResponse>> => async (_, getState) => {
    const state = getState();
    const siteURL = getSiteURL(state);
    client.setUrl(siteURL);

    try {
        const channels = await client.autocompleteChannels(teamId, input);
        const channelsCanWriteTo = channels.filter((c) => haveIChannelPermission(state, teamId, c.id, Permissions.CREATE_POST));
        return {data: channelsCanWriteTo};
    } catch (e: any) {
        const error = e.message || 'An error occurred while searching for channels.';
        return {data: [], error};
    }
};

export type CreateCalendarEventResponse = {data?: any; error?: string};

export const createCalendarEvent = (payload: CreateEventPayload): AppThunk<Promise<CreateCalendarEventResponse>> => async (_, getState) => {
    const state = getState();
    const pluginServerRoute = getPluginServerRoute(state);

    return doFetchWithResponse(`${pluginServerRoute}/api/v1/events/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    }).
        then((data) => {
            return {data};
        }).
        catch((response) => {
            const error = response.message || 'An error occurred while creating the event.';
            return {error};
        });
};

export function getConnected(): AppThunk<Promise<{data?: unknown; error?: unknown}>> {
    return async (dispatch, getState) => {
        let data;
        const baseUrl = getPluginServerRoute(getState());
        try {
            data = await doFetch(`${baseUrl}/api/v1/me`, {
                method: 'get',
            });
        } catch (error) {
            dispatch({type: ActionTypes.RECEIVED_DISCONNECTED});
            return {error};
        }

        dispatch({
            type: ActionTypes.RECEIVED_CONNECTED,
            data,
        });

        return {data};
    };
}

export function sendEphemeralPost(message: string, channelId?: string): AppThunk {
    return (dispatch, getState) => {
        const resolvedChannelId = channelId || getCurrentChannelId(getState());
        const timestamp = Date.now();
        const post = {
            id: 'gcalplugin_' + Date.now(),
            user_id: getState().entities.users.currentUserId,
            channel_id: resolvedChannelId,
            message,
            type: 'system_ephemeral',
            create_at: timestamp,
            update_at: timestamp,
            root_id: '',
            parent_id: '',
            props: {},
        };

        dispatch({
            type: PostTypes.RECEIVED_NEW_POST,
            data: post,
            channelId: resolvedChannelId,
        });
    };
}

export function handleConnect(store: Store<GlobalState>) {
    return (msg: {data: any}) => {
        store.dispatch({
            type: ActionTypes.RECEIVED_CONNECTED,
            data: msg.data,
        });
    };
}

export function handleDisconnect(store: Store<GlobalState>) {
    return (msg: {data: any}) => {
        store.dispatch({
            type: ActionTypes.RECEIVED_DISCONNECTED,
            data: msg.data,
        });
    };
}

export function getProviderConfiguration(): AppThunk<Promise<ProviderConfig | {error?: string}>> {
    return async (dispatch, getState) => {
        let data;
        const baseUrl = getPluginServerRoute(getState());
        try {
            data = await doFetch(`${baseUrl}/api/v1/provider`, {
                method: 'get',
            });

            dispatch({
                type: ActionTypes.RECEIVED_PROVIDER_CONFIGURATION,
                data,
            });
        } catch (error: any) {
            return {error: error.message};
        }

        return data;
    };
}

function makeEventsCacheKey(from: string, to: string): string {
    return `${from}|${to}`;
}

type FetchEventsResult = {data: RemoteEvent[] | null; error: unknown};

const inflightControllers = new Map<string, AbortController>();

export function resetInflightControllers() {
    inflightControllers.forEach((controller) => controller.abort());
    inflightControllers.clear();
}

function fetchEventsRange(
    from: string,
    to: string,
    key: string,
    successType: string,
    dispatch: AppDispatch,
    getState: () => GlobalState,
): Promise<FetchEventsResult> {
    const previous = inflightControllers.get(key);
    if (previous) {
        previous.abort();
    }
    const controller = new AbortController();
    inflightControllers.set(key, controller);

    const pluginServerRoute = getPluginServerRoute(getState());
    const params = new URLSearchParams({from, to});

    const cleanupController = () => {
        if (inflightControllers.get(key) === controller) {
            inflightControllers.delete(key);
        }
    };

    return doFetch(`${pluginServerRoute}/api/v1/events/view?${params.toString()}`, {
        method: 'get',
        signal: controller.signal,
    }).then((events: RemoteEvent[]) => {
        cleanupController();
        dispatch({type: successType, data: events, key, from, to});
        return {data: events, error: null} as FetchEventsResult;
    }).catch((error: unknown) => {
        cleanupController();
        if (error instanceof DOMException && error.name === 'AbortError') {
            return {data: null, error: null} as FetchEventsResult;
        }
        dispatch({type: ActionTypes.FETCH_EVENTS_ERROR, error, key});
        return {data: null, error} as FetchEventsResult;
    });
}

export const refreshCalendarEvents = (from: string, to: string): AppThunk<Promise<FetchEventsResult>> => async (dispatch, getState) => {
    const key = makeEventsCacheKey(from, to);
    dispatch({type: ActionTypes.FETCH_EVENTS_REQUEST, key, from, to});
    return fetchEventsRange(from, to, key, ActionTypes.RECEIVED_FRESH_EVENTS, dispatch as AppDispatch, getState);
};

export const refreshActiveCalendarView = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState() as Record<string, any>;
    const pluginState = state['plugins-' + PluginId];
    const from = pluginState?.events?.activeFrom;
    const to = pluginState?.events?.activeTo;
    if (!from || !to) {
        return;
    }

    await (dispatch as AppDispatch)(refreshCalendarEvents(from, to));
};

export const fetchCalendarEvents = (from: string, to: string): AppThunk<Promise<FetchEventsResult>> => async (dispatch, getState) => {
    const key = makeEventsCacheKey(from, to);
    const state = getState() as Record<string, any>;
    const pluginState = state['plugins-' + PluginId];
    const cached = pluginState?.events?.cache?.[key];

    if (cached) {
        dispatch({type: ActionTypes.RECEIVED_CACHED_EVENTS, key, from, to});
        return {data: cached, error: null};
    }

    dispatch({type: ActionTypes.FETCH_EVENTS_REQUEST, key, from, to});
    return fetchEventsRange(from, to, key, ActionTypes.RECEIVED_EVENTS, dispatch as AppDispatch, getState);
};
