// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PluginId} from './plugin_id';

export default {
    CLOSE_CREATE_EVENT_MODAL: `${PluginId}_close_create_modal`,
    OPEN_CREATE_EVENT_MODAL: `${PluginId}_open_create_modal`,
    OPEN_CREATE_EVENT_MODAL_WITHOUT_POST: `${PluginId}_open_create_modal_without_post`,

    RECEIVED_CONNECTED: `${PluginId}_connected`,
    RECEIVED_DISCONNECTED: `${PluginId}_disconnected`,
    RECEIVED_PLUGIN_SETTINGS: `${PluginId}_plugin_settings`,
    RECEIVED_PROVIDER_CONFIGURATION: `${PluginId}_provider_settings`,
};
