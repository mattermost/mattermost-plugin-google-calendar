// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"context"
	"fmt"

	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/people/v1"

	"golang.org/x/oauth2/google"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/config"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
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

// MakeUserClient creates a new client for user-delegated permissions.
func (r *impl) MakeUserClient(ctx context.Context, oauthToken *oauth2.Token, mattermostUserID string, poster bot.Poster, userTokenHelpers remote.UserTokenHelpers) remote.Client {
	config := r.NewOAuth2Config()

	token, err := userTokenHelpers.RefreshAndStoreToken(oauthToken, config, mattermostUserID)
	if err != nil {
		r.logger.Warnf("Not able to refresh or store the token for user %s: %s", mattermostUserID, err.Error())
		return &client{}
	}

	httpClient := config.Client(ctx, token)
	c := &client{
		conf:       r.conf,
		ctx:        ctx,
		httpClient: httpClient,
		Logger:     r.logger,
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
