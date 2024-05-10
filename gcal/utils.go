package gcal

import (
	"crypto/rand"
	"encoding/base64"
)

// newRandomString generates a random string used for subscription ID and token
func newRandomString() string {
	b := make([]byte, 96)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
