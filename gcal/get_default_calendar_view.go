// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils"
)

const (
	RemoteEventBusy = "busy"
	RemoteEventFree = "free"

	GoogleEventBusy = "opaque"
	GoogleEventFree = "transparent"

	GoogleResponseStatusYes   = "accepted"
	GoogleResponseStatusMaybe = "tentative"
	GoogleResponseStatusNo    = "declined"
	GoogleResponseStatusNone  = "needsAction"
)

var responseStatusConversion = map[string]string{
	GoogleResponseStatusYes:   remote.EventResponseStatusAccepted,
	GoogleResponseStatusMaybe: remote.EventResponseStatusTentative,
	GoogleResponseStatusNo:    remote.EventResponseStatusDeclined,
	GoogleResponseStatusNone:  remote.EventResponseStatusNotAnswered,
}

func (c *client) GetDefaultCalendarView(_ string, start, end time.Time) ([]*remote.Event, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetDefaultCalendarView, error creating service")
	}

	req := service.Events.
		List(defaultCalendarName).
		TimeMin(start.Format(time.RFC3339)).
		TimeMax(end.Format(time.RFC3339)).
		SingleEvents(true).
		ShowDeleted(false).
		ShowHiddenInvitations(false).
		OrderBy("startTime").
		Context(context.TODO())

	result, err := req.Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetDefaultCalendarView, error performing request")
	}

	if len(result.Items) == 0 {
		return []*remote.Event{}, nil
	}

	events := []*remote.Event{}
	for _, event := range result.Items {
		if event.ICalUID != "" {
			events = append(events, convertGCalEventToRemoteEvent(event))
		}
	}

	return events, nil
}

func convertGCalEventDateTimeToRemoteDateTime(dt *calendar.EventDateTime) *remote.DateTime {
	t, _ := time.Parse(time.RFC3339, dt.DateTime)
	return remote.NewDateTime(t.UTC(), "UTC")
}

func convertGCalEventToRemoteEvent(event *calendar.Event) *remote.Event {
	showAs := RemoteEventBusy
	if event.Transparency == GoogleEventFree {
		showAs = RemoteEventFree
	}

	start := convertGCalEventDateTimeToRemoteDateTime(event.Start)
	end := convertGCalEventDateTimeToRemoteDateTime(event.End)

	var conference *remote.Conference
	var location *remote.Location

	if event.ConferenceData != nil && len(event.ConferenceData.EntryPoints) > 0 {
		conference = &remote.Conference{
			URL: event.ConferenceData.EntryPoints[0].Uri,
		}
		if event.ConferenceData.ConferenceSolution != nil {
			conference.Application = event.ConferenceData.ConferenceSolution.Name
		}
	} else if utils.IsURL(event.Location) {
		conference = &remote.Conference{
			URL: event.Location,
		}
	}

	if !utils.IsURL(event.Location) {
		location = &remote.Location{
			DisplayName: event.Location,
		}
	}

	organizer := &remote.Attendee{
		EmailAddress: &remote.EmailAddress{
			Name:    event.Organizer.Email,
			Address: event.Organizer.Email,
		},
	}

	responseStatus := &remote.EventResponseStatus{
		Response: remote.EventResponseStatusNotAnswered,
	}
	responseRequested := false
	isOrganizer := false

	attendees := []*remote.Attendee{}
	for _, attendee := range event.Attendees {
		attendees = append(attendees, &remote.Attendee{
			Status: &remote.EventResponseStatus{
				Response: attendee.ResponseStatus,
			},
			EmailAddress: &remote.EmailAddress{
				Name:    attendee.Email,
				Address: attendee.Email,
			},
		})

		if attendee.Self {
			if attendee.ResponseStatus == GoogleResponseStatusNone {
				responseRequested = true
			}

			response := responseStatusConversion[attendee.ResponseStatus]
			responseStatus.Response = response

			isOrganizer = attendee.Organizer
		}
	}

	isAllDay := len(event.Start.Date) > 0 // if Date field is present, it is all-day. as opposed to DateTime field

	return &remote.Event{
		ID:                event.Id,
		ICalUID:           event.ICalUID,
		Subject:           event.Summary,
		Body:              &remote.ItemBody{Content: event.Description},
		BodyPreview:       event.Description, // GCAL TODO no body preview available?
		IsAllDay:          isAllDay,
		ShowAs:            showAs,
		Weblink:           event.HtmlLink,
		Start:             start,
		End:               end,
		Location:          location,
		Conference:        conference,
		Organizer:         organizer,
		Attendees:         attendees,
		ResponseStatus:    responseStatus,
		IsCancelled:       event.Status == "cancelled",
		IsOrganizer:       isOrganizer,
		ResponseRequested: responseRequested,
		// 	Importance                 string
		// 	ReminderMinutesBeforeStart int
	}
}

func (c *client) DoBatchViewCalendarRequests(_ []*remote.ViewCalendarParams) ([]*remote.ViewCalendarResponse, error) {
	return nil, remote.ErrNotImplemented
}
