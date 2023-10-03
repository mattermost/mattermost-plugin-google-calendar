// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSelector} from 'reselect';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {PluginId} from './plugin_id';

import {ProviderConfig, ReducerState} from './reducers';

const getPluginState = (state): ReducerState => state['plugins-' + PluginId] || {};

export const getPluginServerRoute = (state) => {
    const config = getConfig(state);

    let basePath = '';
    if (config && config.SiteURL) {
        basePath = new URL(config.SiteURL).pathname;

        if (basePath && basePath[basePath.length - 1] === '/') {
            basePath = basePath.substr(0, basePath.length - 1);
        }
    }

    return basePath + '/plugins/' + PluginId;
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

export const isCreateEventModalVisible = (state) => getPluginState(state).createEventModalVisible;

export const getCreateEventModal = (state) => getPluginState(state).createEventModal;

export const isUserConnected = (state) => getPluginState(state).userConnected;

export const getProviderConfiguration = (state): ProviderConfig => getPluginState(state).providerConfiguration;
