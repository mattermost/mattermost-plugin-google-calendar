import {PluginId} from '../plugin_id';

const ActionTypes = {
    CLOSE_CREATE_EVENT_MODAL: `${PluginId}_close_create_modal`,
    OPEN_CREATE_EVENT_MODAL: `${PluginId}_open_create_modal`,

    RECEIVED_CONNECTED: `${PluginId}_connected`,
    RECEIVED_DISCONNECTED: `${PluginId}_disconnected`,
    RECEIVED_PLUGIN_SETTINGS: `${PluginId}_plugin_settings`,
    RECEIVED_PROVIDER_CONFIGURATION: `${PluginId}_provider_settings`,

    FETCH_EVENTS_REQUEST: `${PluginId}_fetch_events_request`,
    RECEIVED_EVENTS: `${PluginId}_received_events`,
    RECEIVED_CACHED_EVENTS: `${PluginId}_received_cached_events`,
    FETCH_EVENTS_ERROR: `${PluginId}_fetch_events_error`,
    RECEIVED_FRESH_EVENTS: `${PluginId}_received_fresh_events`,
} as const;

export default ActionTypes;
