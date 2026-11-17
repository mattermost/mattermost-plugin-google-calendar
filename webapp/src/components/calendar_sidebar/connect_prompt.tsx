import {useCallback} from 'react';

import type {ButtonAsChildProps, ButtonProps} from '@mattermost/compass-ui/components/button';
import {EmptyState} from '@mattermost/compass-ui/components/empty-state';

import {GOOGLE_CALENDAR_ICON_DATA_URI} from '@/components/channel_header_icon/google_calendar_icon_data';
import manifest from '@/manifest';

/** Detects the Mattermost desktop (Electron) app, which can't open OAuth popup windows. */
function isDesktopApp(): boolean {
    const userAgent = window.navigator.userAgent;
    return userAgent.indexOf('Mattermost') !== -1 && userAgent.indexOf('Electron') !== -1;
}

interface ConnectPromptProps {
    pluginServerRoute: string;
    sendEphemeralPost: (message: string) => void;
}

/** Shown in the sidebar when the user hasn't connected their account; starts the OAuth flow. */
const ConnectPrompt = ({pluginServerRoute, sendEphemeralPost}: ConnectPromptProps) => {
    const pluginName = manifest.name;

    const handleConnect = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        if (isDesktopApp()) {
            sendEphemeralPost(`Please connect your ${pluginName} account using your web browser. The desktop app cannot open the OAuth window directly.`);
            return;
        }
        window.open(
            `${pluginServerRoute}/oauth2/connect`,
            `Connect Mattermost to ${pluginName}`,
            'height=570,width=520,noopener,noreferrer',
        );
    }, [pluginServerRoute, sendEphemeralPost, pluginName]);

    const connectUrl = `${pluginServerRoute}/oauth2/connect`;

    // EmptyState spreads `action` onto Button, which supports asChild, but its type only accepts plain button props.
    const action: ButtonAsChildProps = {
        asChild: true,
        children: (
            <a
                href={connectUrl}
                onClick={handleConnect}
            >
                {'Connect account'}
            </a>
        ),
    };

    return (
        <EmptyState
            illustration={{
                children: (
                    <img
                        src={GOOGLE_CALENDAR_ICON_DATA_URI}
                        alt=''
                        width='80'
                        height='80'
                    />
                ),
            }}
            title={`Welcome to ${pluginName}`}
            description={'Connect your account to get started'}
            action={action as unknown as ButtonProps}
        />
    );
};

export default ConnectPrompt;
