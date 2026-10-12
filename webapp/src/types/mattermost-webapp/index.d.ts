import type React from 'react';

export interface PluginRegistry {
    registerPostTypeComponent(typeName: string, component: React.ElementType): void;
    registerRightHandSidebarComponent(
        component: React.ElementType,
        title: string,
    ): { id: string; toggleRHSPlugin: any };
    registerChannelHeaderButtonAction(
        icon: React.ReactElement,
        action: (channel: any) => void,
        dropdownText: string,
        tooltipText: string,
    ): void;
    registerReducer(reducer: any): void;
    registerRootComponent(component: React.ElementType): void;
    registerSlashCommandWillBePostedHook(hook: any): void;
    registerChannelHeaderMenuAction(
        component: React.ReactElement,
        action: (channelId: string) => void,
    ): void;
    registerWebSocketEventHandler(
        event: string,
        handler: (msg: any) => void,
    ): void;
}
