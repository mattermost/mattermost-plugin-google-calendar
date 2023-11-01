import {Store, Action} from 'redux';

import {GlobalState} from '@mattermost/types/lib/store';

import {id} from '@/manifest';

import {PluginRegistry} from '@/types/mattermost-webapp';

import Plugin from 'mattermost-plugin-google-calendar/webapp/src/index.tsx';

// export default class Plugin {
//     // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
//     public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
//         // @see https://developers.mattermost.com/extend/plugins/webapp/reference/
//     }
// }

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void
    }
}

window.registerPlugin(id, new Plugin());
