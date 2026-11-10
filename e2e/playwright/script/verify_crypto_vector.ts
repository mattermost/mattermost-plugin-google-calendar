// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Checks that e2e/playwright/lib/crypto.ts still produces the vector that the engine's user store decrypts
// (server/e2e_crypto_vector_test.go). Run by `npm run check`.

import {CRYPTO_TEST_VECTOR, decrypt, encrypt, hashedKey} from '../lib/crypto';

const {key, nonceHex, plaintext, ciphertext, mattermostUserId, userKey} = CRYPTO_TEST_VECTOR;
const produced = encrypt(key, plaintext, Buffer.from(nonceHex, 'hex'));

if (produced !== ciphertext) {
    console.error(`crypto vector mismatch:\n  expected ${ciphertext}\n  produced ${produced}`);
    process.exit(1);
}
if (decrypt(key, ciphertext) !== plaintext) {
    console.error('crypto vector does not round-trip');
    process.exit(1);
}
if (hashedKey('user_', mattermostUserId) !== userKey) {
    console.error(`hashed user key mismatch: expected ${userKey}, produced ${hashedKey('user_', mattermostUserId)}`);
    process.exit(1);
}
console.log('crypto vector OK');
