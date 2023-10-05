// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {combineReducers} from 'redux';

import ActionTypes from './action_types';

function userConnected(state = false, action) {
    switch (action.type) {
    case ActionTypes.RECEIVED_CONNECTED:
        return true;
    case ActionTypes.RECEIVED_DISCONNECTED:
        return false;
    default:
        return state;
    }
}

const createEventModalVisible = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.OPEN_CREATE_EVENT_MODAL:
    case ActionTypes.OPEN_CREATE_EVENT_MODAL_WITHOUT_POST:
        return true;
    case ActionTypes.CLOSE_CREATE_EVENT_MODAL:
        return false;
    default:
        return state;
    }
};

const createEventModal = (state = '', action) => {
    switch (action.type) {
    case ActionTypes.OPEN_CREATE_EVENT_MODAL:
    case ActionTypes.OPEN_CREATE_EVENT_MODAL_WITHOUT_POST:
        return {
            ...state,
            postId: action.data.postId,
            description: action.data.description,
            channelId: action.data.channelId,
        };
    case ActionTypes.CLOSE_CREATE_EVENT_MODAL:
        return {};
    default:
        return state;
    }
};

function providerConfiguration(state = null, action) {
    switch (action.type) {
    case ActionTypes.RECEIVED_PROVIDER_CONFIGURATION:
        return action.data;
    default:
        return state;
    }
}

export default combineReducers({
    userConnected,
    providerConfiguration,
    createEventModalVisible,
    createEventModal,
});

export type ProviderFeatures = {
    EncryptedStore: boolean;
    EventNotifications: boolean;
}

export type ProviderConfig = {
    Name: string;
    DisplayName: string;
    Repository: string;
    CommandTrigger: string;
    TelemetryShortName: string;
    BotUsername: string;
    BotDisplayName: string;
    Features: ProviderFeatures;
}

export type ReducerState = {
    userConnected: boolean;
    createEventModalVisible: boolean;
    createEventModal: {
        channelId: string;
        postId?: string;
        description?: string;
    } | null;
    providerConfiguration: ProviderConfig;
}
