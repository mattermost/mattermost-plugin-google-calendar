import {useCallback} from 'react';

import manifest from '@/manifest';
import {MattermostTheme} from '@/utils/calendar_theme';

import CalendarIconSVG from './calendar_icon_svg';

function isDesktopApp(): boolean {
    const userAgent = window.navigator.userAgent;
    return userAgent.indexOf('Mattermost') !== -1 && userAgent.indexOf('Electron') !== -1;
}

interface ConnectPromptProps {
    theme: MattermostTheme;
    pluginServerRoute: string;
    sendEphemeralPost: (message: string) => void;
}

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

    return (
        <div className='gcal-sidebar__connect'>
            <div className='gcal-sidebar__connect-welcome'>
                {`Welcome to ${pluginName}`}
            </div>
            <div className='gcal-sidebar__connect-icon'>
                <CalendarIconSVG theme={theme}/>
            </div>
            <div className='gcal-sidebar__connect-prompt'>
                {'Connect your account'}
                <br/>
                {'to get started'}
            </div>
            <a
                className='gcal-sidebar__connect-btn'
                href={`${pluginServerRoute}/oauth2/connect`}
                onClick={handleConnect}
                style={{
                    backgroundColor: theme.buttonBg,
                    color: theme.buttonColor,
                }}
            >
                {'Connect account'}
            </a>
        </div>
    );
};

export default ConnectPrompt;
