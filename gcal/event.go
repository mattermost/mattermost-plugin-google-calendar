// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"
	"net/http"
	"time"

	"github.com/pkg/errors"
	msgraph "github.com/yaegashi/msgraph.go/v1.0"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

func (c *client) GetEvent(remoteUserID, eventID string) (*remote.Event, error) {
	if true {
		return nil, errors.New("gcal GetEvent not implemented")
	}

	e := &remote.Event{}

	err := c.rbuilder.Users().ID(remoteUserID).Events().ID(eventID).Request().JSONRequest(
		c.ctx, http.MethodGet, "", nil, &e)
	if err != nil {
		return nil, errors.Wrap(err, "msgraph GetEvent")
	}
	return e, nil
}

// CreateEvent creates a calendar event
func (c *client) CreateEvent(_ string, in *remote.Event) (*remote.Event, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal CreateEvent, error creating service")
	}

	evt := convertRemoteEventToGcalEvent(in)

	resultEvent, err := service.Events.
		Insert(defaultCalendarName, evt).
		SendUpdates("all"). // Send notifications to all attendees.
		Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal CreateEvent")
	}

	return convertGCalEventToRemoteEvent(resultEvent), nil
}

func (c *client) AcceptEvent(remoteUserID, eventID string) error {
	if true {
		return errors.New("gcal AcceptEvent not implemented")
	}

	dummy := &msgraph.EventAcceptRequestParameter{}
	err := c.rbuilder.Users().ID(remoteUserID).Events().ID(eventID).Accept(dummy).Request().Post(c.ctx)
	if err != nil {
		return errors.Wrap(err, "msgraph Accept Event")
	}
	return nil
}

func (c *client) DeclineEvent(remoteUserID, eventID string) error {
	if true {
		return errors.New("gcal DeclineEvent not implemented")
	}

	dummy := &msgraph.EventDeclineRequestParameter{}
	err := c.rbuilder.Users().ID(remoteUserID).Events().ID(eventID).Decline(dummy).Request().Post(c.ctx)
	if err != nil {
		return errors.Wrap(err, "msgraph DeclineEvent")
	}
	return nil
}

func (c *client) TentativelyAcceptEvent(remoteUserID, eventID string) error {
	if true {
		return errors.New("gcal TentativelyAcceptEvent not implemented")
	}

	dummy := &msgraph.EventTentativelyAcceptRequestParameter{}
	err := c.rbuilder.Users().ID(remoteUserID).Events().ID(eventID).TentativelyAccept(dummy).Request().Post(c.ctx)
	if err != nil {
		return errors.Wrap(err, "msgraph TentativelyAcceptEvent")
	}
	return nil
}

func (c *client) GetEventsBetweenDates(_ string, start, end time.Time) (events []*remote.Event, err error) {
	ctx := context.Background()
	service, err := calendar.NewService(ctx, option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal CreateEvent, error creating service")
	}

	result, err := service.Events.
		List(defaultCalendarName).
		TimeMin(start.Format(time.RFC3339)).
		TimeMax(end.Format(time.RFC3339)).
		OrderBy("startTime").
		SingleEvents(true).
		ShowDeleted(false).
		ShowHiddenInvitations(false).
		Context(ctx).
		Do()
	if err != nil {
		return nil, errors.Wrap(err, "error getting list of events")
	}

	for _, evt := range result.Items {
		events = append(events, convertGCalEventToRemoteEvent(evt))
	}

	return events, nil
}

func convertRemoteEventToGcalEvent(in *remote.Event) *calendar.Event {
	out := &calendar.Event{}
	out.Summary = in.Subject
	out.Start = convertRemoteDateTimeToGcalEventDateTime(in.Start)
	out.End = convertRemoteDateTimeToGcalEventDateTime(in.End)
	if in.Body != nil {
		out.Description = in.Body.Content
	}

	if in.Location != nil {
		out.Location = in.Location.DisplayName
	}

	for _, attendee := range in.Attendees {
		outAttendee := &calendar.EventAttendee{
			Id: attendee.RemoteID,
		}
		if attendee.EmailAddress != nil {
			outAttendee.Email = attendee.EmailAddress.Address
		}
		out.Attendees = append(out.Attendees, outAttendee)
	}

	return out
}

func convertRemoteDateTimeToGcalEventDateTime(in *remote.DateTime) *calendar.EventDateTime {
	out := &calendar.EventDateTime{}
	dt := in.String()

	// Avoid setting non RFC3339 strings
	if dt != remote.UndefinedDatetime {
		out.DateTime = dt
	}

	out.TimeZone = in.TimeZone

	return out
}
