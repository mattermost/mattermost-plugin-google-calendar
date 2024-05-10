// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"net/http"

	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
)

// CreateCalendar creates a calendar
func (c *client) CreateCalendar(remoteUserID string, calIn *remote.Calendar) (*remote.Calendar, error) {
	if true {
		return nil, errors.New("gcal CreateCalendar not implemented")
	}

	var calOut = remote.Calendar{}
	err := c.rbuilder.Users().ID(remoteUserID).Calendars().Request().JSONRequest(c.ctx, http.MethodPost, "", &calIn, &calOut)
	if err != nil {
		return nil, errors.Wrap(err, "msgraph CreateCalendar")
	}
	c.Logger.With(bot.LogContext{
		"v": calOut,
	}).Infof("gcal: CreateCalendar created the following calendar.")
	return &calOut, nil
}
