import {combineReducers} from 'redux';

import ActionTypes from '../constants';
import {RemoteEvent} from '../types/calendar';

type PluginAction = {
    type: string;
    data?: Record<string, unknown>;
    key?: string;
    from?: string;
    to?: string;
    error?: {message?: string};
};

function userConnected(state: boolean | null = null, action: PluginAction) {
    switch (action.type) {
    case ActionTypes.RECEIVED_CONNECTED:
        return true;
    case ActionTypes.RECEIVED_DISCONNECTED:
        return false;
    default:
        return state;
    }
}

const createEventModalVisible = (state = false, action: PluginAction) => {
    switch (action.type) {
    case ActionTypes.OPEN_CREATE_EVENT_MODAL:
        return true;
    case ActionTypes.CLOSE_CREATE_EVENT_MODAL:
        return false;
    default:
        return state;
    }
};

const createEventModal = (state = {}, action: PluginAction) => {
    switch (action.type) {
    case ActionTypes.OPEN_CREATE_EVENT_MODAL:
        return {
            postId: action.data?.postId,
            description: action.data?.description,
            channelId: action.data?.channelId,
            date: action.data?.date,
            startTime: action.data?.startTime,
            endTime: action.data?.endTime,
        };
    case ActionTypes.CLOSE_CREATE_EVENT_MODAL:
        return {};
    default:
        return state;
    }
};

function providerConfiguration(state = null, action: PluginAction) {
    switch (action.type) {
    case ActionTypes.RECEIVED_PROVIDER_CONFIGURATION:
        return action.data;
    default:
        return state;
    }
}

interface EventsState {
    cache: Record<string, RemoteEvent[]>;
    activeKey: string | null;
    activeFrom: string | null;
    activeTo: string | null;
    loading: boolean;
    error: string | null;
}

const eventsInitialState: EventsState = {
    cache: {},
    activeKey: null,
    activeFrom: null,
    activeTo: null,
    loading: false,
    error: null,
};

const MAX_CACHE_ENTRIES = 10;

function evictStaleCache(cache: Record<string, RemoteEvent[]>, keepKey?: string): Record<string, RemoteEvent[]> {
    const keys = Object.keys(cache);
    if (keys.length <= MAX_CACHE_ENTRIES) {
        return cache;
    }
    const evicted = {...cache};
    const toRemove = keys.filter((k) => k !== keepKey).slice(0, keys.length - MAX_CACHE_ENTRIES);
    for (const k of toRemove) {
        delete evicted[k];
    }
    return evicted;
}

function events(state: EventsState = eventsInitialState, action: {type: string; data?: RemoteEvent[]; key?: string; from?: string; to?: string; error?: any}): EventsState {
    switch (action.type) {
    case ActionTypes.FETCH_EVENTS_REQUEST:
        return {
            ...state,
            activeKey: action.key || state.activeKey,
            activeFrom: action.from || state.activeFrom,
            activeTo: action.to || state.activeTo,
            loading: true,
            error: null,
        };
    case ActionTypes.RECEIVED_EVENTS: {
        const key = action.key || state.activeKey || '';
        const newCache = evictStaleCache({...state.cache, [key]: action.data || []}, key);
        if (key !== state.activeKey) {
            return {...state, cache: newCache};
        }
        return {
            ...state,
            cache: newCache,
            activeFrom: action.from || state.activeFrom,
            activeTo: action.to || state.activeTo,
            loading: false,
            error: null,
        };
    }
    case ActionTypes.RECEIVED_CACHED_EVENTS: {
        return {
            ...state,
            activeKey: action.key || state.activeKey,
            activeFrom: action.from || state.activeFrom,
            activeTo: action.to || state.activeTo,
            loading: false,
            error: null,
        };
    }
    case ActionTypes.RECEIVED_FRESH_EVENTS: {
        const freshKey = action.key || state.activeKey || '';
        if (freshKey !== state.activeKey) {
            return state;
        }
        return {
            ...state,
            cache: evictStaleCache({...state.cache, [freshKey]: action.data || []}, freshKey),
            activeKey: freshKey,
            activeFrom: action.from || state.activeFrom,
            activeTo: action.to || state.activeTo,
            loading: false,
            error: null,
        };
    }
    case ActionTypes.FETCH_EVENTS_ERROR: {
        const errorKey = action.key || state.activeKey;
        if (errorKey !== state.activeKey) {
            return state;
        }
        return {...state, loading: false, error: action.error?.message || 'Failed to fetch events'};
    }
    default:
        return state;
    }
}

export default combineReducers({
    userConnected,
    providerConfiguration,
    createEventModalVisible,
    createEventModal,
    events,
});

export type ProviderFeatures = {
    EncryptedStore: boolean;
    EventNotifications: boolean;
    EnableExperimentalUI: boolean;
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
    userConnected: boolean | null;
    createEventModalVisible: boolean;
    createEventModal: {
        channelId?: string;
        postId?: string;
        description?: string;
        date?: string;
        startTime?: string;
        endTime?: string;
    };
    providerConfiguration: ProviderConfig | null;
    events: {
        cache: Record<string, RemoteEvent[]>;
        activeKey: string | null;
        activeFrom: string | null;
        activeTo: string | null;
        loading: boolean;
        error: string | null;
    };
}
