// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"context"

	"github.com/pkg/errors"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

func (c *client) GetMailboxSettings(remoteUserID string) (*remote.MailboxSettings, error) {
	// REVIEW: Implemented timezone but need to verify if it is correct

	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetMailboxSettings, error creating service")
	}

	setting, err := service.Settings.Get("timezone").Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetMailboxSettings, error getting timezone setting")
	}

	// probably should get rid of `MailBoxSettings` and just return the timezone as a string. or fill out the rest of the struct, which is not necessarily possible or useful. "WorkingHours" is the only other field in the struct
	out := &remote.MailboxSettings{
		TimeZone: setting.Value,
	}
	return out, nil
}
