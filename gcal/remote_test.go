// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/config"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/store"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
)

// tokenHelpers refreshes against a test token endpoint, like the engine's store does against
// Google's, and records the error MakeUserClient hands to DisconnectUserFromStoreIfNecessary.
type tokenHelpers struct {
	tokenURL      string
	disconnectErr error
}

func (h *tokenHelpers) CheckUserConnected(string) bool { return true }

func (h *tokenHelpers) DisconnectUserFromStoreIfNecessary(err error, _ string) {
	h.disconnectErr = err
}

func (h *tokenHelpers) RefreshAndStoreToken(token *oauth2.Token, oconf *oauth2.Config, _ string) (*oauth2.Token, error) {
	conf := *oconf
	conf.Endpoint = oauth2.Endpoint{TokenURL: h.tokenURL, AuthStyle: oauth2.AuthStyleInParams}
	return conf.TokenSource(context.Background(), token).Token()
}

func TestMakeUserClientRefreshFailure(t *testing.T) {
	for _, tc := range []struct {
		name              string
		status            int
		body              string
		expectUserInvalid bool
	}{
		{
			name:              "revoked or expired refresh token marks the user inactive",
			status:            http.StatusBadRequest,
			body:              `{"error": "invalid_grant", "error_description": "Token has been expired or revoked."}`,
			expectUserInvalid: true,
		},
		{
			name:   "invalid client keeps the user connected",
			status: http.StatusUnauthorized,
			body:   `{"error": "invalid_client", "error_description": "The OAuth client was not found."}`,
		},
		{
			name:   "Google outage keeps the user connected",
			status: http.StatusServiceUnavailable,
			body:   `{"error": "temporarily_unavailable"}`,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer tokenServer.Close()

			helpers := &tokenHelpers{tokenURL: tokenServer.URL}
			r := NewRemote(&config.Config{}, &bot.NilLogger{})
			expired := &oauth2.Token{AccessToken: "access", RefreshToken: "refresh", Expiry: time.Now().Add(-time.Minute)}

			client, err := r.MakeUserClient(context.Background(), expired, "mattermostUserID", nil, helpers)

			require.Error(t, err)
			assert.Nil(t, client)
			require.Error(t, helpers.disconnectErr)

			// The engine's store and slash commands match these messages (calendar/store/user_store.go
			// DisconnectUserFromStoreIfNecessary, calendar/command/daily_summary.go).
			if tc.expectUserInvalid {
				assert.ErrorContains(t, helpers.disconnectErr, store.ErrorRefreshTokenExpired)
				assert.ErrorContains(t, err, store.ErrorUserInactive)
			} else {
				assert.NotContains(t, helpers.disconnectErr.Error(), store.ErrorRefreshTokenExpired)
				assert.NotContains(t, helpers.disconnectErr.Error(), store.ErrorRefreshTokenNotSet)
				assert.NotContains(t, err.Error(), store.ErrorUserInactive)
			}

			var retrieveErr *oauth2.RetrieveError
			assert.ErrorAs(t, err, &retrieveErr, "the error from Google stays inspectable")
		})
	}
}
