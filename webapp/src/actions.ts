import {Client4} from '@mattermost/client';
import {PostTypes} from 'mattermost-redux/action_types';
import {GlobalState} from '@mattermost/types/store';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {haveIChannelPermission} from 'mattermost-redux/selectors/entities/roles';
import Permissions from 'mattermost-redux/constants/permissions';
import {Channel} from '@mattermost/types/channels';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';

import ActionTypes from './action_types';
import {doFetch, doFetchWithResponse} from './client';
import {PluginId} from './plugin_id';
import {CreateEventPayload} from './types/calendar_api_types';

const client = new Client4();

export const openCreateEventModal = (channelId: string) => {
    return {
        type: ActionTypes.OPEN_CREATE_EVENT_MODAL,
        data: {
            channelId,
        },
    };
};

export const closeCreateEventModal = () => {
    return {
        type: ActionTypes.CLOSE_CREATE_EVENT_MODAL,
    };
};

export const getSiteURL = (state: GlobalState): string => {
    const config = getConfig(state);

    let basePath = '';
    if (config && config.SiteURL) {
        basePath = new URL(config.SiteURL).pathname;

        if (basePath && basePath[basePath.length - 1] === '/') {
            basePath = basePath.substring(0, basePath.length - 1);
        }
    }

    return basePath;
};

export const getPluginServerRoute = (state: GlobalState): string => {
    const siteURL = getSiteURL(state);
    return `${siteURL}/plugins/${PluginId}`;
};

type AutocompleteUser = {
    mm_id: string
    mm_username: string
    mm_display_name: string
}

export type AutocompleteConnectedUsersResponse = {data?: AutocompleteUser[]; error?: string};

export const autocompleteConnectedUsers = (input: string) => async (dispatch, getState): Promise<AutocompleteConnectedUsersResponse> => {
    const state = getState();
    const pluginServerRoute = getPluginServerRoute(state);

    return doFetchWithResponse(`${pluginServerRoute}/autocomplete/users?search=${input}`).
        then((response) => {
            return {data: response.data};
        }).
        catch((response) => {
            const error = response.message?.error || 'An error occurred while searching for users.';
            return {data: [], error};
        });
};

export type AutocompleteChannelsResponse = {data?: Channel[]; error?: string};

export const autocompleteUserChannels = (input: string, teamId: string) => async (dispatch, getState): Promise<AutocompleteChannelsResponse> => {
    const state = getState();
    const siteURL = getSiteURL(state);
    client.setUrl(siteURL);

    try {
        const channels = await client.autocompleteChannels(teamId, input);
        const channelsCanWriteTo = channels.filter((c) => haveIChannelPermission(state, {channel: c.id, permission: Permissions.CREATE_POST}));
        return {data: channelsCanWriteTo};
    } catch (e) {
        const error = response.message?.error || 'An error occurred while searching for channels.';
        return {data: [], error};
    }
};

export type CreateCalendarEventResponse = {data?: any; error?: string};

export const createCalendarEvent = (payload: CreateEventPayload) => async (dispatch, getState): Promise<CreateCalendarEventResponse> => {
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
            const error = response.message?.error || 'An error occurred while creating the event.';
            return {error};
        });
};

export function getConnected() {
    return async (dispatch, getState) => {
        let data;
        const baseUrl = getPluginServerRoute(getState());
        try {
            data = await doFetch(`${baseUrl}/api/v1/me`, {
                method: 'get',
            });
        } catch (error) {
            return {error};
        }

        dispatch({
            type: ActionTypes.RECEIVED_CONNECTED,
            data,
        });

        return {data};
    };
}

export function sendEphemeralPost(message: string, channelId?: string) {
    return (dispatch, getState) => {
        const timestamp = Date.now();
        const post = {
            id: 'gcalplugin_' + Date.now(),
            user_id: getState().entities.users.currentUserId,
            channel_id: channelId || getCurrentChannelId(getState()),
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
            channelId,
        });
    };
}

export function handleConnectChange() {
    return (dispatch, getState) => {
        return (msg) => {
            if (!msg.data) {
                return;
            }

            let dispatchType = ActionTypes.RECEIVED_CONNECTED;
            if (msg.data.event === 'disconnected') {
                dispatchType = ActionTypes.RECEIVED_DISCONNECTED;
            }

            dispatch({
                type: dispatchType,
                data: msg.data,
            });
        };
    };
}

export function getProviderConfiguration() {
    return async (dispatch, getState): Promise<ProviderConfig | null> => {
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
        } catch (error) {
            return {error};
        }

        return data;
    };
}
