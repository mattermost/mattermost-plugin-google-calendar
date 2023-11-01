import Plugin from 'mattermost-plugin-google-calendar/webapp/src/index.tsx';

import {id} from '@/manifest';

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void
    }
}

window.registerPlugin(id, new Plugin());
