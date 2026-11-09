// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import type {Client4} from '@mattermost/client';
import {expect} from '@playwright/test';

import manifest from '../../plugin.json';

import {assertServerAlive} from './server';

export const PLUGIN_ID = manifest.id;

/** Slash command trigger and bot username (gcal/gcal.go GetGcalProviderConfig). */
export const COMMAND_TRIGGER = 'gcal';
export const BOT_USERNAME = 'gcal';
export const PROVIDER_DISPLAY_NAME = 'Google Calendar';

/** Mattermost's plugin states (model.PluginStateRunning etc.). */
export const PLUGIN_STATE = {notRunning: 0, starting: 1, running: 2, failedToStart: 3} as const;

// Fixed 32-byte key: AES-256 in the engine's utils/kvstore/crypt.go. Seeded tokens are encrypted
// with it, and changing it makes the plugin re-encrypt or drop every connected user.
export const TEST_ENCRYPTION_KEY = 'e2e-test-encryption-key-32-chars';

/** Plugin settings from plugin.json settings_schema. Mattermost stores the keys lowercased. */
export type GcalPluginSettings = {
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    encryptionKey?: string;
    adminUserIds?: string;
    enableExperimentalUI?: boolean;
};

/** The configured Google OAuth client: the fake's, or the real one from .env.local (lib/google/auth.ts). */
export function googleOAuthSettings(): GcalPluginSettings {
    const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!id || !secret) {
        throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET are not set: global setup fills them from the fake, or set them in e2e/.env.local for E2E_GOOGLE=real.');
    }
    return {oauth2ClientId: id, oauth2ClientSecret: secret};
}

/** Returns the single plugin bundle in ../dist, failing with a fix-it message otherwise. */
export function findPluginBundle(): string {
    const distDir = path.join(__dirname, '..', '..', 'dist');
    const bundles = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => f.endsWith('.tar.gz')) : [];
    if (bundles.length !== 1) {
        throw new Error(
            `Expected exactly one plugin bundle in ${distDir}, found ${bundles.length}. ` +
                "Run 'make dist' from the repository root (on macOS, with GNU tar on PATH).",
        );
    }

    const bundle = path.join(distDir, bundles[0]);
    assertSingleRootBundle(bundle);
    return bundle;
}

/**
 * Mattermost only finds plugin.json when the archive has exactly one top-level directory.
 * macOS bsdtar adds AppleDouble `._*` entries (hidden by macOS `tar -t`), which breaks that and
 * makes the upload fail with "unable to find manifest".
 */
function assertSingleRootBundle(bundle: string) {
    const tar = zlib.gunzipSync(fs.readFileSync(bundle));
    const roots = new Set<string>();
    const appleDouble: string[] = [];

    for (let offset = 0; offset + 512 <= tar.length; ) {
        const header = tar.subarray(offset, offset + 512);
        const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
        if (!name) {
            break;
        }
        const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
        const fullName = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '');
        const typeFlag = String.fromCharCode(header[156]);
        const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);

        // Skip pax/GNU metadata records; they describe the next entry rather than being one.
        if (!['x', 'g', 'L', 'K'].includes(typeFlag)) {
            roots.add(fullName.split('/')[0]);
            if (path.basename(fullName).startsWith('._')) {
                appleDouble.push(fullName);
            }
        }
        offset += 512 + Math.ceil(size / 512) * 512;
    }

    if (appleDouble.length > 0 || roots.size !== 1) {
        throw new Error(
            `Plugin bundle ${path.basename(bundle)} is not a single-directory archive ` +
                `(top-level entries: ${[...roots].join(', ')}; AppleDouble entries: ${appleDouble.length}). ` +
                "Mattermost will reject it with 'unable to find manifest'. On macOS rebuild with GNU tar, " +
                'e.g. `PATH="$(brew --prefix gnu-tar)/libexec/gnubin:$PATH" make dist`.',
        );
    }
}

/** Uploads the plugin bundle (replacing any existing version). Does not enable it. */
export async function uploadPlugin(adminClient: Client4, bundlePath: string) {
    const file = new File([fs.readFileSync(bundlePath)], path.basename(bundlePath), {type: 'application/gzip'});
    await adminClient.uploadPlugin(file, true);
}

async function pluginState(adminClient: Client4): Promise<number | undefined> {
    const statuses = await adminClient.getPluginStatuses();
    return statuses.find((s) => s.plugin_id === PLUGIN_ID)?.state;
}

/**
 * Writes the plugin settings, SiteURL and the plugin's enabled state in one config patch, so the
 * plugin activates with them.
 *
 * Call it after pw.initSetup(): initSetup() replaces the whole server config, which wipes plugin
 * settings and plugin enable states.
 */
export async function configureGcalPlugin(adminClient: Client4, settings: GcalPluginSettings, siteURL = process.env.PW_BASE_URL as string) {
    await assertServerAlive(process.env.PW_BASE_URL as string);

    // Disable first, so a settings change always goes through OnActivate (as an admin saving the
    // System Console and re-enabling the plugin would) and the state poll below sees this config.
    // Use the API: only DisablePlugin unregisters the plugin's slash commands. A config change
    // (including the one pw.initSetup() makes) deactivates the plugin but leaves /gcal registered,
    // and Mattermost then answers it with "An error occurred while trying to execute this command".
    await adminClient.disablePlugin(PLUGIN_ID);
    await expect.poll(() => pluginState(adminClient), {timeout: 30_000}).not.toBe(PLUGIN_STATE.running);

    await adminClient.patchConfig({
        ServiceSettings: {SiteURL: siteURL},
        PluginSettings: {
            PluginStates: {[PLUGIN_ID]: {Enable: true}},
            Plugins: {
                [PLUGIN_ID]: {
                    oauth2clientid: settings.oauth2ClientId,
                    oauth2clientsecret: settings.oauth2ClientSecret,
                    encryptionkey: settings.encryptionKey ?? TEST_ENCRYPTION_KEY,
                    adminuserids: settings.adminUserIds ?? '',
                    enableexperimentalui: settings.enableExperimentalUI ?? false,
                },
            },
        },
    } as any);
}

/** Configures and enables the plugin and waits until it runs. */
export async function ensureGcalPlugin(adminClient: Client4, settings: GcalPluginSettings = googleOAuthSettings()) {
    await configureGcalPlugin(adminClient, settings);
    await expect
        .poll(() => pluginState(adminClient), {message: `plugin ${PLUGIN_ID} should be running`, timeout: 30_000})
        .toBe(PLUGIN_STATE.running);
}

/** The plugin's state once Mattermost has finished trying to start it. */
export async function settledPluginState(adminClient: Client4): Promise<number | undefined> {
    let state: number | undefined;
    await expect
        .poll(async () => {
            state = await pluginState(adminClient);
            return state === PLUGIN_STATE.starting || state === undefined;
        }, {timeout: 30_000})
        .toBe(false);
    return state;
}

/** Version of the installed bundle (the repo's plugin.json has none; the build stamps it). */
export async function installedPluginVersion(adminClient: Client4): Promise<string> {
    const plugins = await adminClient.getPlugins();
    const found = [...plugins.active, ...plugins.inactive].find((p) => p.id === PLUGIN_ID);
    if (!found) {
        throw new Error(`${PLUGIN_ID} is not installed`);
    }
    return found.version;
}
