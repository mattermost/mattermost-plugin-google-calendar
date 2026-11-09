package main

import (
	"encoding/json"
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

// TestDecryptE2ECryptoVector pins the user-record format the Playwright e2e suite relies on to
// seed connected users directly into the plugin KV store (e2e/lib/kv.ts). The row is produced by
// e2e/lib/crypto.ts (CRYPTO_TEST_VECTOR) and read here through the same store composition the
// engine builds for encrypted providers (store.NewPluginStore: encrypted over hashed "user_"
// keys). Keep the two in sync.
func TestDecryptE2ECryptoVector(t *testing.T) {
	const (
		key              = "e2e-test-encryption-key-32-chars"
		mattermostUserID = "e2etestmattermostuserid000"
		userKey          = "user_a36e0a2b6e2bef799764f069e49e0c18"
		ciphertext       = "AAECAwQFBgcICQoLncb5ysVJ3LIEJsedodU-x_dUlgbHCRYny_rI1XocNBl3mD7ySVeJXCdRPa7R8WzB-N2833S0X51hycpPMyE-y73wAkWB1H5_yOAGqDlMxCrROqlpp98sMN0UVPymFagFeKhh863WNhGpVX-Al9JJdA12fUIiCzdGmYCTVuLveiZwcNV7T-6wRXLM4o3xS2mM6DLVsbkTV43G1443uA63RsQsNx0fEayVExSjlSGlcdn-N9OdjSnvXQIeu8T10VPSOdZThM1YLAErWaLysphkpfd4wYwAjI1zHkC3kqzKgaS-9vhGTc2UraxTFLeHWw1KOyz8n9IOmxCvmwyWNuC1J9s2j6YmWGo2p6srWK8tHiL-GXqICZyAABeRoRueHxSrri2mrTRQcrz3yarb_ZJu"
	)

	raw := memoryKV{userKey: []byte(ciphertext)}
	users := kvstore.NewEncryptedKeyStore(kvstore.NewHashedKeyStore(raw, store.UserKeyPrefix), []byte(key))

	data, err := users.Load(mattermostUserID)
	require.NoError(t, err)

	var user store.User
	require.NoError(t, json.Unmarshal(data, &user))
	require.Equal(t, mattermostUserID, user.MattermostUserID)
	require.Equal(t, "people/100000000000000000001", user.Remote.ID)
	require.Equal(t, "owner@fake-google.test", user.Remote.Mail)
	require.Equal(t, "e2e-access", user.OAuth2Token.AccessToken)
	require.Equal(t, "e2e-refresh", user.OAuth2Token.RefreshToken)
	require.Equal(t, 2030, user.OAuth2Token.Expiry.Year())
}
