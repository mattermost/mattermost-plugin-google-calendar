// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/api/calendar/v3"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

func createMinimalCalendarEvent() calendar.Event {
	return calendar.Event{
		Summary: "test summary",
		Start: &calendar.EventDateTime{
			DateTime: "2023-08-01T00:05:00Z",
			TimeZone: "UTC",
		},
		End: &calendar.EventDateTime{
			DateTime: "2023-08-01T00:10:00Z",
			TimeZone: "UTC",
		},
		Organizer: &calendar.EventOrganizer{
			Email: "gcal-plugin@mattermost.com",
		},
	}
}

func TestConvertGCalEventToRemoteEvent(t *testing.T) {
	for _, tc := range []struct {
		Name  string
		In    func() calendar.Event
		Check func(t *testing.T, event *remote.Event)
	}{
		{
			Name: "minimal fields are correctly converted",
			In:   createMinimalCalendarEvent,
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "test summary", event.Subject)
				require.Equal(t, "2023-08-01T00:05:00", event.Start.DateTime)
				require.Equal(t, "2023-08-01T00:10:00", event.End.DateTime)
				require.Equal(t, "gcal-plugin@mattermost.com", event.Organizer.EmailAddress.Address)
			},
		},
		{
			Name: "conference data is extracted",
			In: func() calendar.Event {
				evt := createMinimalCalendarEvent()
				evt.ConferenceData = &calendar.ConferenceData{
					ConferenceSolution: &calendar.ConferenceSolution{
						Name: "example",
					},
					EntryPoints: []*calendar.EntryPoint{{
						Uri: "https://example.com/meeting",
					}},
				}
				return evt
			},
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "https://example.com/meeting", event.Conference.URL)
				require.Equal(t, "example", event.Conference.Application)
				require.Empty(t, event.Location)
			},
		},
		{
			Name: "location is extracted",
			In: func() calendar.Event {
				evt := createMinimalCalendarEvent()
				evt.Location = "location"
				return evt
			},
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "location", event.Location.DisplayName)
			},
		},
		{
			Name: "location and conference data are extracted",
			In: func() calendar.Event {
				evt := createMinimalCalendarEvent()
				evt.Location = "location"
				evt.ConferenceData = &calendar.ConferenceData{
					ConferenceSolution: &calendar.ConferenceSolution{
						Name: "example",
					},
					EntryPoints: []*calendar.EntryPoint{{
						Uri: "https://example.com/meeting",
					}},
				}
				return evt
			},
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "https://example.com/meeting", event.Conference.URL)
				require.Equal(t, "example", event.Conference.Application)
				require.Equal(t, "location", event.Location.DisplayName)
			},
		},
		{
			Name: "conference data takes priority over location url",
			In: func() calendar.Event {
				evt := createMinimalCalendarEvent()
				evt.Location = "https://example.com"
				evt.ConferenceData = &calendar.ConferenceData{
					ConferenceSolution: &calendar.ConferenceSolution{
						Name: "example",
					},
					EntryPoints: []*calendar.EntryPoint{{
						Uri: "https://example.com/meeting",
					}},
				}
				return evt
			},
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "https://example.com/meeting", event.Conference.URL)
				require.Equal(t, "example", event.Conference.Application)
				require.Empty(t, event.Location)
			},
		},
		{
			Name: "location url used as conference if no conference data is present",
			In: func() calendar.Event {
				evt := createMinimalCalendarEvent()
				evt.Location = "https://example.com"
				return evt
			},
			Check: func(t *testing.T, event *remote.Event) {
				require.Equal(t, "https://example.com", event.Conference.URL)
				require.Empty(t, event.Conference.Application)
				require.Empty(t, event.Location)
			},
		},
	} {
		t.Run(tc.Name, func(t *testing.T) {
			event := tc.In()
			result := convertGCalEventToRemoteEvent(&event)
			tc.Check(t, result)
		})
	}
}
