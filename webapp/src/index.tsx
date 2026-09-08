import React, {useCallback, useEffect, useRef, useState} from 'react';

import {Action, Store} from 'redux';

import {GlobalState} from '@mattermost/types/store';

import type {AppDispatch} from '@/hooks';

import {PluginRegistry} from '@/types/mattermost-webapp';

import {PluginId} from './plugin_id';

import Hooks from './plugin_hooks';
import reducer from './reducers';

import CalendarSidebar from './components/calendar_sidebar';
import ChannelHeaderIcon from './components/channel_header_icon/channel_header_icon';
import CreateEventModal from './components/modals/create_event_modal';
import {getProviderConfiguration, handleConnect, handleDisconnect, openCreateEventModal, resetInflightControllers} from './actions';
import {getProviderConfiguration as getProviderConfigSelector} from './selectors';

export default class Plugin {
    private setupComplete = false;

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        this.setupComplete = false;
        resetInflightControllers();

        registry.registerReducer(reducer);

        const hooks = new Hooks(store);
        registry.registerSlashCommandWillBePostedHook(hooks.slashCommandWillBePostedHook);

        const thunkDispatch = store.dispatch as AppDispatch;

        registry.registerChannelHeaderMenuAction(
            <span>{'Create calendar event'}</span>,
            async (channelID) => {
                if (await hooks.checkUserIsConnected()) {
                    thunkDispatch(openCreateEventModal(channelID));
                }
            },
        );

        registry.registerRootComponent(CreateEventModal);

        registry.registerWebSocketEventHandler(`custom_${PluginId}_connected`, handleConnect(store));
        registry.registerWebSocketEventHandler(`custom_${PluginId}_disconnected`, handleDisconnect(store));

        const setup = async () => {
            await thunkDispatch(getProviderConfiguration());

            const providerConfig = getProviderConfigSelector(store.getState());
            if (!providerConfig) {
                throw new Error('Failed to load provider configuration');
            }

            if (providerConfig.Features?.EnableExperimentalUI) {
                const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
                    CalendarSidebar,
                    'Calendar',
                );

                registry.registerChannelHeaderButtonAction(
                    <ChannelHeaderIcon/>,
                    () => store.dispatch(toggleRHSPlugin),
                    'Calendar',
                    'Toggle calendar sidebar',
                );
            }
        };

        const setupStatus = {
            isComplete: () => this.setupComplete,
            markComplete: () => {
                this.setupComplete = true;
            },
        };

        registry.registerRootComponent(() => (
            <SetupUI
                setup={setup}
                setupStatus={setupStatus}
            />
        ));
    }

    public uninitialize() {
        this.setupComplete = false;
        resetInflightControllers();
    }
}

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;

interface SetupStatus {
    isComplete: () => boolean;
    markComplete: () => void;
}

interface SetupUIProps {
    setup: () => Promise<void>;
    setupStatus: SetupStatus;
}

const SetupUI = ({setup, setupStatus}: SetupUIProps) => {
    const [retryCount, setRetryCount] = useState(0);
    const runningRef = useRef(false);

    const attemptSetup = useCallback(async () => {
        if (setupStatus.isComplete() || runningRef.current) {
            return;
        }
        runningRef.current = true;
        try {
            await setup();
            setupStatus.markComplete();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Plugin setup failed:', error);
            runningRef.current = false;

            if (retryCount < MAX_RETRIES) {
                const scheduleRetry = () => setRetryCount((c) => c + 1);
                setTimeout(scheduleRetry, RETRY_DELAY_MS);
            }
        }
    }, [setup, setupStatus, retryCount]);

    useEffect(() => {
        attemptSetup();
    }, [attemptSetup]);

    return null;
};

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(PluginId, new Plugin());
