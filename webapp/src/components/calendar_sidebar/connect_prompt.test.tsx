import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';

import manifest from '@/manifest';
import {mockTheme} from '@/testutils/theme';

import ConnectPrompt from './connect_prompt';

describe('ConnectPrompt', () => {
    const baseProps = {
        theme: mockTheme,
        pluginServerRoute: '/plugins/com.mattermost.gcal',
        sendEphemeralPost: jest.fn(),
    };

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('renders welcome text', () => {
        render(<ConnectPrompt {...baseProps}/>);
        expect(screen.getByText(`Welcome to ${manifest.name}`)).toBeInTheDocument();
    });

    it('renders the connect prompt text', () => {
        render(<ConnectPrompt {...baseProps}/>);
        expect(screen.getByText(/Connect your account/)).toBeInTheDocument();
        expect(screen.getByText(/to get started/)).toBeInTheDocument();
    });

    it('renders Connect account button', () => {
        render(<ConnectPrompt {...baseProps}/>);
        const btn = screen.getByText('Connect account');
        expect(btn).toBeInTheDocument();
        expect(btn.tagName).toBe('A');
    });

    it('sets the correct OAuth href', () => {
        render(<ConnectPrompt {...baseProps}/>);
        const link = screen.getByText('Connect account');
        expect(link).toHaveAttribute('href', '/plugins/com.mattermost.gcal/oauth2/connect');
    });

    it('applies theme colors to the connect button', () => {
        render(<ConnectPrompt {...baseProps}/>);
        const btn = screen.getByText('Connect account');
        expect(btn).toHaveStyle({
            backgroundColor: mockTheme.buttonBg,
            color: mockTheme.buttonColor,
        });
    });

    it('opens a popup window on click (non-desktop)', () => {
        const windowOpenSpy = jest.spyOn(window, 'open').mockReturnValue(null);
        render(<ConnectPrompt {...baseProps}/>);
        fireEvent.click(screen.getByText('Connect account'));
        expect(windowOpenSpy).toHaveBeenCalledWith(
            '/plugins/com.mattermost.gcal/oauth2/connect',
            `Connect Mattermost to ${manifest.name}`,
            'height=570,width=520,noopener,noreferrer',
        );
        expect(baseProps.sendEphemeralPost).not.toHaveBeenCalled();
    });

    it('sends ephemeral post on click when running in desktop app', () => {
        const originalUA = navigator.userAgent;
        try {
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 Mattermost/5.0 Electron/22.0',
                configurable: true,
            });

            const windowOpenSpy = jest.spyOn(window, 'open').mockReturnValue(null);
            render(<ConnectPrompt {...baseProps}/>);
            fireEvent.click(screen.getByText('Connect account'));

            expect(baseProps.sendEphemeralPost).toHaveBeenCalledTimes(1);
            expect(baseProps.sendEphemeralPost).toHaveBeenCalledWith(
                expect.stringContaining('web browser'),
            );
            expect(windowOpenSpy).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(navigator, 'userAgent', {
                value: originalUA,
                configurable: true,
            });
        }
    });
});
