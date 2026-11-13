import {useCallback} from 'react';

import type {ButtonAsChildProps, ButtonProps} from '@mattermost/compass-ui/components/button';
import {EmptyState} from '@mattermost/compass-ui/components/empty-state';

import manifest from '@/manifest';
import {MattermostTheme} from '@/utils/calendar_theme';

import CalendarIconSVG from './calendar_icon_svg';

/** Detects the Mattermost desktop (Electron) app, which can't open OAuth popup windows. */
function isDesktopApp(): boolean {
    const userAgent = window.navigator.userAgent;
    return userAgent.indexOf('Mattermost') !== -1 && userAgent.indexOf('Electron') !== -1;
}

interface ConnectPromptProps {
    theme: MattermostTheme;
    pluginServerRoute: string;
    sendEphemeralPost: (message: string) => void;
}

/** Shown in the sidebar when the user hasn't connected their account; starts the OAuth flow. */
const ConnectPrompt = ({theme, pluginServerRoute, sendEphemeralPost}: ConnectPromptProps) => {
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
            illustration={{children: <CalendarIconSVG theme={theme}/>}}
            title={`Welcome to ${pluginName}`}
            description={'Connect your account to get started'}
            action={action as unknown as ButtonProps}
        />
    );
};

export default ConnectPrompt;
