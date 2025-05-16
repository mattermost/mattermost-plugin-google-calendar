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

func (c *client) GetNotificationData(orig *remote.Notification) (*remote.Notification, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error creating service")
	}

	n := *orig
	wh := n.Webhook.(*webhook)

	cal, err := c.GetDefaultCalendar()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error getting default calendar")
	}

	reqBody := service.Events.Get(cal.ID, wh.Resource)
	googleEvent, err := reqBody.Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetNotificationData, error fetching event data")
	}

	event := convertGCalEventToRemoteEvent(googleEvent)

	n.Event = event
	n.IsBare = false

	return &n, nil
}
