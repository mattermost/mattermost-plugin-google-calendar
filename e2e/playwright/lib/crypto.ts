// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import crypto from 'crypto';

import vector from './crypto_vector.json';

const NONCE_BYTES = 12;

function cipherFor(key: string): crypto.CipherGCMTypes {
    const bits = Buffer.byteLength(key, 'utf8') * 8;
    if (bits !== 128 && bits !== 192 && bits !== 256) {
        throw new Error(`AES needs a 16, 24 or 32 byte key, got ${bits / 8} bytes`);
    }
    return `aes-${bits}-gcm` as crypto.CipherGCMTypes;
}

/**
 * Encrypts like the mscalendar engine's utils/kvstore/crypt.go encrypt: AES-GCM with the raw key
 * bytes (16, 24 or 32 bytes), output = base64url(nonce || ciphertext || tag) WITH padding (Go's
 * URLEncoding pads, Node's 'base64url' does not).
 *
 * `nonce` is only for the fixed test vector; leave it unset otherwise.
 */
export function encrypt(key: string, plaintext: string, nonce: Buffer = crypto.randomBytes(NONCE_BYTES)): string {
    const cipher = crypto.createCipheriv(cipherFor(key), Buffer.from(key, 'utf8'), nonce);
    const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return padBase64(Buffer.concat([nonce, sealed]).toString('base64url'));
}

export function decrypt(key: string, encoded: string): string {
    const raw = Buffer.from(encoded, 'base64url');
    const nonce = raw.subarray(0, NONCE_BYTES);
    const tag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(NONCE_BYTES, raw.length - 16);
    const decipher = crypto.createDecipheriv(cipherFor(key), Buffer.from(key, 'utf8'), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function padBase64(s: string): string {
    return s + '='.repeat((4 - (s.length % 4)) % 4);
}

/** The engine's hashed KV key (utils/kvstore/hashed_key.go hashKey): prefix + hex md5(key). */
export function hashedKey(prefix: string, key: string): string {
    return key === '' ? prefix : prefix + crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Fixed vector in crypto_vector.json, the single copy both checks read: `npm run check`
 * (script/verify_crypto_vector.ts) verifies this file still encrypts the plaintext to the ciphertext
 * and hashes the user key, and server/e2e_crypto_vector_test.go decrypts the same ciphertext through
 * the engine's own encrypted, hashed user store (kvstore.NewEncryptedKeyStore over
 * NewHashedKeyStore, as store.NewPluginStore builds it). If either side changes format, one of the
 * two checks fails before any e2e run.
 */
export const CRYPTO_TEST_VECTOR: {
    key: string;
    nonceHex: string;
    mattermostUserId: string;
    userKey: string;
    plaintext: string;
    ciphertext: string;
} = vector;
