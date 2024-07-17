// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"

	"github.com/pkg/errors"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

// CreateCalendar creates a calendar
func (c *client) CreateCalendar(remoteUserID string, calIn *remote.Calendar) (*remote.Calendar, error) {
	return nil, errors.New("gcal CreateCalendar not implemented")
}

// DeleteCalendar deletes a calendar
func (c *client) DeleteCalendar(remoteUserID string, calID string) error {
	return errors.New("gcal DeleteCalendar not implemented")
}

// GetCalendars returns a list of calendars
func (c *client) GetCalendars(remoteUserID string) ([]*remote.Calendar, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error creating service")
	}

	res, err := service.CalendarList.List().Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error getting list of calendars")
	}

	calendarList := []*remote.Calendar{}
	for _, calendar := range res.Items {
		calendarList = append(calendarList, &remote.Calendar{
			ID:   calendar.Id,
			Name: calendar.Summary,
		})
	}

	return calendarList, nil
}

// GetDefaultCalendar returns the default calendar for the user
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

// convertGoogleCalendarToRemoteCalendar converts a google calendar to a local representation calendar
func convertGoogleCalendarToRemoteCalendar(cal *calendar.Calendar) *remote.Calendar {
	return &remote.Calendar{
		ID:           cal.Id,
		Name:         cal.Summary,
		Events:       []remote.Event{},
		CalendarView: []remote.Event{},
		Owner:        nil,
	}
}
