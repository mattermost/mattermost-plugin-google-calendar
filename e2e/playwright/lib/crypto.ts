// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import crypto from 'crypto';

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
 * Fixed vector shared with server/e2e_crypto_vector_test.go, which loads it through the engine's
 * own encrypted, hashed user store (kvstore.NewEncryptedKeyStore over NewHashedKeyStore, as
 * store.NewPluginStore builds it). `npm run check` verifies this file still produces it. If either
 * side changes format, one of the two checks fails before any e2e run.
 */
export const CRYPTO_TEST_VECTOR = {
    key: 'e2e-test-encryption-key-32-chars',
    nonceHex: '000102030405060708090a0b',
    mattermostUserId: 'e2etestmattermostuserid000',
    userKey: 'user_a36e0a2b6e2bef799764f069e49e0c18',
    plaintext: '{"Remote":{"id":"people/100000000000000000001","displayName":"Calendar Owner","mail":"owner@fake-google.test"},"OAuth2Token":{"access_token":"e2e-access","token_type":"Bearer","refresh_token":"e2e-refresh","expiry":"2030-01-01T00:00:00Z"},"MattermostUserID":"e2etestmattermostuserid000"}',
    ciphertext:
        'AAECAwQFBgcICQoLncb5ysVJ3LIEJsedodU-x_dUlgbHCRYny_rI1XocNBl3mD7ySVeJXCdRPa7R8WzB-N2833S0X51hycpPMyE-y73wAkWB1H5_yOAGqDlMxCrROqlpp98sMN0UVPymFagFeKhh863WNhGpVX-Al9JJdA12fUIiCzdGmYCTVuLveiZwcNV7T-6wRXLM4o3xS2mM6DLVsbkTV43G1443uA63RsQsNx0fEayVExSjlSGlcdn-N9OdjSnvXQIeu8T10VPSOdZThM1YLAErWaLysphkpfd4wYwAjI1zHkC3kqzKgaS-9vhGTc2UraxTFLeHWw1KOyz8n9IOmxCvmwyWNuC1J9s2j6YmWGo2p6srWK8tHiL-GXqICZyAABeRoRueHxSrri2mrTRQcrz3yarb_ZJu',
};
