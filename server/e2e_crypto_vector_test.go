// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/store"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/kvstore"
)

// memoryKV is a raw plugin KV store holding the rows the e2e suite writes into Postgres.
type memoryKV map[string][]byte

func (m memoryKV) Load(key string) ([]byte, error) {
	value, ok := m[key]
	if !ok {
		return nil, kvstore.ErrNotFound
	}
	return value, nil
}

func (m memoryKV) Store(key string, data []byte) error { m[key] = data; return nil }

func (m memoryKV) StoreTTL(key string, data []byte, _ int64) error {
	m[key] = data
	return nil
}

func (m memoryKV) StoreWithOptions(key string, data []byte, _ model.PluginKVSetOptions) (bool, error) {
	m[key] = data
	return true, nil
}

func (m memoryKV) Delete(key string) error         { delete(m, key); return nil }
func (m memoryKV) List(_, _ int) ([]string, error) { return nil, nil }

// e2eCryptoVector is e2e/playwright/lib/crypto_vector.json, the vector the Playwright suite's
// e2e/playwright/lib/crypto.ts encrypts (checked there by `npm run check`).
type e2eCryptoVector struct {
	Key              string `json:"key"`
	MattermostUserID string `json:"mattermostUserId"`
	UserKey          string `json:"userKey"`
	Plaintext        string `json:"plaintext"`
	Ciphertext       string `json:"ciphertext"`
}

// TestDecryptE2ECryptoVector pins the user-record format the Playwright e2e suite relies on to
// seed connected users directly into the plugin KV store (e2e/playwright/lib/kv.ts). It reads the
// same vector file as the suite and decrypts the row through the store composition the engine
// builds for encrypted providers (store.NewPluginStore: encrypted over hashed "user_" keys).
func TestDecryptE2ECryptoVector(t *testing.T) {
	file, err := os.ReadFile("../e2e/playwright/lib/crypto_vector.json")
	require.NoError(t, err)
	var vector e2eCryptoVector
	require.NoError(t, json.Unmarshal(file, &vector))

	raw := memoryKV{vector.UserKey: []byte(vector.Ciphertext)}
	users := kvstore.NewEncryptedKeyStore(kvstore.NewHashedKeyStore(raw, store.UserKeyPrefix), []byte(vector.Key))

	data, err := users.Load(vector.MattermostUserID)
	require.NoError(t, err)
	require.Equal(t, vector.Plaintext, string(data))

	var user store.User
	require.NoError(t, json.Unmarshal(data, &user))
	require.Equal(t, vector.MattermostUserID, user.MattermostUserID)
	require.Equal(t, "people/100000000000000000001", user.Remote.ID)
	require.Equal(t, "owner@fake-google.test", user.Remote.Mail)
	require.Equal(t, "e2e-access", user.OAuth2Token.AccessToken)
	require.Equal(t, "e2e-refresh", user.OAuth2Token.RefreshToken)
	require.Equal(t, 2030, user.OAuth2Token.Expiry.Year())
}
