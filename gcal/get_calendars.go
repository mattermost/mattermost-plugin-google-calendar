// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"
	"net/http"

	"github.com/pkg/errors"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
)

func (c *client) GetCalendars(remoteUserID string) ([]*remote.Calendar, error) {
	if true {
		return nil, errors.New("gcal GetCalendars not implemented")
	}

	var v struct {
		Value []*remote.Calendar `json:"value"`
	}
	req := c.rbuilder.Users().ID(remoteUserID).Calendars().Request()
	req.Expand("children")
	err := req.JSONRequest(c.ctx, http.MethodGet, "", nil, &v)
	if err != nil {
		return nil, errors.Wrap(err, "msgraph GetCalendars")
	}
	c.Logger.With(bot.LogContext{
		"UserID": remoteUserID,
		"v":      v.Value,
	}).Infof("gcal: GetUserCalendars returned `%d` calendars.", len(v.Value))
	return v.Value, nil
}

func (c *client) GetDefaultCalendar() (*remote.Calendar, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error creating service")
	}

	req := service.Calendars.Get(defaultCalendarName)
	googleCal, err := req.Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetDefaultCalendar, error getting calendar")
	}

	remoteCal := convertGoogleCalendarToRemoteCalendar(googleCal)

	return remoteCal, nil
}

func convertGoogleCalendarToRemoteCalendar(cal *calendar.Calendar) *remote.Calendar {
	return &remote.Calendar{
		ID:           cal.Id,
		Name:         cal.Summary,
		Events:       []remote.Event{},
		CalendarView: []remote.Event{},
		Owner:        nil,
	}
}
