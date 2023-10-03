// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"
	"fmt"

	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/people/v1"

	// msgraph "github.com/yaegashi/msgraph.go/v1.0"
	"golang.org/x/oauth2/google"

	"github.com/mattermost/mattermost-plugin-mscalendar/server/config"
	"github.com/mattermost/mattermost-plugin-mscalendar/server/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/server/utils/bot"
)

const Kind = "gcal"

type impl struct {
	conf   *config.Config
	logger bot.Logger
}

func init() {
	remote.Makers[Kind] = NewRemote
}

func NewRemote(conf *config.Config, logger bot.Logger) remote.Remote {
	return &impl{
		conf:   conf,
		logger: logger,
	}
}

// MakeClient creates a new client for user-delegated permissions.
func (r *impl) MakeClient(ctx context.Context, token *oauth2.Token) remote.Client {
	httpClient := r.NewOAuth2Config().Client(ctx, token)
	c := &client{
		conf:       r.conf,
		ctx:        ctx,
		httpClient: httpClient,
		Logger:     r.logger,
		rbuilder:   nil,
	}
	return c
}

// MakeSuperuserClient creates a new client used for app-only permissions.
// Super user tokens are not available on google calendar, so we instantiate a normal client
func (r *impl) MakeSuperuserClient(_ context.Context) (remote.Client, error) {
	return nil, remote.ErrSuperUserClientNotSupported
}

func (r *impl) NewOAuth2Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     r.conf.OAuth2ClientID,
		ClientSecret: r.conf.OAuth2ClientSecret,
		RedirectURL:  r.conf.PluginURL + config.FullPathOAuth2Redirect,
		Scopes: []string{
			calendar.CalendarScope,                 // Read and create events and calendar
			calendar.CalendarSettingsReadonlyScope, // Read the user timezone
			people.UserinfoEmailScope,              // Get the user email address
			people.UserinfoProfileScope,            // Get user ID and display name
		},
		Endpoint: google.Endpoint,
	}
}

func (r *impl) CheckConfiguration(cfg config.StoredConfig) error {
	if cfg.OAuth2ClientID == "" || cfg.OAuth2ClientSecret == "" {
		return fmt.Errorf("OAuth2 credentials to be set in the config")
	}

	if cfg.EncryptionKey == "" {
		return fmt.Errorf("encryption key cannot be empty")
	}

	return nil
}
