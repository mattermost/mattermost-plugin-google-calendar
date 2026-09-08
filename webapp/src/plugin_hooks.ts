import {GlobalState} from '@mattermost/types/store';

import type {AppDispatch} from '@/hooks';

import {getConnected, openCreateEventModal, sendEphemeralPost} from './actions';
import {getProviderConfiguration, isUserConnected} from './selectors';

type ContextArgs = { channel_id: string };

const createEventCommand = 'event create';

interface Store {
    dispatch: AppDispatch;
    getState(): GlobalState;
}

export default class Hooks {
    private store: Store;

    constructor(store: Store) {
        this.store = store;
    }

    slashCommandWillBePostedHook = async (rawMessage: string, contextArgs: ContextArgs) => {
        const message = rawMessage ? rawMessage.trim() : '';

        if (!message) {
            return {message: rawMessage, args: contextArgs};
        }

        const providerConfiguration = getProviderConfiguration(this.store.getState());
        if (providerConfiguration) {
            const prefix = `/${providerConfiguration.CommandTrigger} ${createEventCommand}`;
            if (message === prefix || message.startsWith(prefix + ' ')) {
                return this.handleCreateEventSlashCommand(message, contextArgs);
            }
        }

        return {message: rawMessage, args: contextArgs};
    };

    handleCreateEventSlashCommand = async (_message: string, contextArgs: ContextArgs) => {
        if (!(await this.checkUserIsConnected())) {
            return {};
        }

        this.store.dispatch(openCreateEventModal(contextArgs.channel_id));
        return {};
    };

    checkUserIsConnected = async (): Promise<boolean> => {
        let connected = isUserConnected(this.store.getState());
        if (connected === null) {
            await this.store.dispatch(getConnected());
            connected = isUserConnected(this.store.getState());
        }

        if (!connected) {
            const providerConfiguration = getProviderConfiguration(this.store.getState());
            const displayName = providerConfiguration?.DisplayName || 'the calendar provider';
            const commandTrigger = providerConfiguration?.CommandTrigger || 'gcal';
            this.store.dispatch(sendEphemeralPost(`Your Mattermost account is not connected to ${displayName}. In order to create a calendar event please connect your account first using \`/${commandTrigger} connect\`.`));
            return false;
        }

        return true;
    };
}
