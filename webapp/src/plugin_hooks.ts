// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getConnected, openCreateEventModal, sendEphemeralPost} from './actions';
import {getProviderConfiguration, isUserConnected} from './selectors';

type ContextArgs = {channel_id: string};

const createEventCommand = 'event create';

interface Store {
    dispatch(action: {type: string}): void;
    getState(): object;
}

export default class Hooks {
    private store: Store;

    constructor(store: Store) {
        this.store = store;
    }

    slashCommandWillBePostedHook = async (rawMessage: string, contextArgs: ContextArgs) => {
        let message;
        if (rawMessage) {
            message = rawMessage.trim();
        }

        if (!message) {
            return Promise.resolve({message, args: contextArgs});
        }

        const providerConfiguration = getProviderConfiguration(this.store.getState());
        if (message.startsWith(`/${providerConfiguration.CommandTrigger} ` + createEventCommand)) {
            return this.handleCreateEventSlashCommand(message, contextArgs);
        }

        return Promise.resolve({message, args: contextArgs});
    };

    handleCreateEventSlashCommand = async (message: string, contextArgs: ContextArgs) => {
        if (!(await this.checkUserIsConnected())) {
            return Promise.resolve({});
        }

        this.store.dispatch(openCreateEventModal(contextArgs.channel_id));
        return Promise.resolve({});
    };

    checkUserIsConnected = async (): Promise<boolean> => {
        if (!isUserConnected(this.store.getState())) {
            await this.store.dispatch(getConnected());
            if (!isUserConnected(this.store.getState())) {
                const providerConfiguration = await getProviderConfiguration(this.store.getState());
                this.store.dispatch(sendEphemeralPost(`Your Mattermost account is not connected to ${providerConfiguration.DisplayName}. In order to create a calendar event please connect your account first using \`/${providerConfiguration.CommandTrigger} connect\`.`));
                return false;
            }
        }

        return true;
    };
}
