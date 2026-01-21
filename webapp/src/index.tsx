import React, {useEffect} from 'react';

import {Store, Action} from 'redux';

import {GlobalState} from '@mattermost/types/lib/store';

import {PluginRegistry} from '@/types/mattermost-webapp';

import {PluginId} from './plugin_id';

import Hooks from './plugin_hooks';
import reducer from './reducers';

import CreateEventModal from './components/modals/create_event_modal';
import {getProviderConfiguration, handleConnectChange, openCreateEventModal} from './actions';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export default class Plugin {
    private haveSetupUI = false;

    private finishedSetupUI = () => {
        this.haveSetupUI = true;
    };

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        this.haveSetupUI = false;

        registry.registerReducer(reducer);

        const hooks = new Hooks(store);
        registry.registerSlashCommandWillBePostedHook(hooks.slashCommandWillBePostedHook);

        const setup = async () => {
            // Retrieve provider configuration so we can access names and other options in messages to use in the frontend.
            await store.dispatch(getProviderConfiguration());

            registry.registerChannelHeaderMenuAction(
                <span>{'Create calendar event'}</span>,
                async (channelID) => {
                    if (await hooks.checkUserIsConnected()) {
                        store.dispatch(openCreateEventModal(channelID));
                    }
                },
            );

            registry.registerRootComponent(CreateEventModal);

            registry.registerWebSocketEventHandler(`custom_${PluginId}_connected`, handleConnectChange(store));
            registry.registerWebSocketEventHandler(`custom_${PluginId}_disconnected`, handleConnectChange(store));
        };

        registry.registerRootComponent(() => (
            <SetupUI
                setup={setup}
                haveSetupUI={this.haveSetupUI}
                finishedSetupUI={this.finishedSetupUI}
            />
        ));

        // reminder to set up site url for any API calls
        // and i18n
    }
}

interface SetupUIProps {
    setup: () => Promise<void>;
    haveSetupUI: boolean;
    finishedSetupUI: () => void;
}

const SetupUI = ({setup, haveSetupUI, finishedSetupUI}: SetupUIProps) => {
    useEffect(() => {
        if (!haveSetupUI) {
            setup().then(() => {
                finishedSetupUI();
            });
        }
    }, []);

    return null;
};

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void
    }
}

window.registerPlugin(PluginId, new Plugin());
