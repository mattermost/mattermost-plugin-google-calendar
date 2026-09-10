// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

func TestConvertRemoteEventToGcalEvent(t *testing.T) {
	const timeZone = "America/Los_Angeles"

	t.Run("timed events keep their date times", func(t *testing.T) {
		result := convertRemoteEventToGcalEvent(&remote.Event{
			Subject: "test summary",
			Start:   &remote.DateTime{DateTime: "2026-09-10T09:00:00", TimeZone: timeZone},
			End:     &remote.DateTime{DateTime: "2026-09-10T09:30:00", TimeZone: timeZone},
		})

		require.Equal(t, "2026-09-10T09:00:00-07:00", result.Start.DateTime)
		require.Equal(t, "2026-09-10T09:30:00-07:00", result.End.DateTime)
		require.Equal(t, timeZone, result.Start.TimeZone)
		require.Empty(t, result.Start.Date)
		require.Empty(t, result.End.Date)
	})

	t.Run("all-day events use date-only fields with an exclusive end date", func(t *testing.T) {
		result := convertRemoteEventToGcalEvent(&remote.Event{
			Subject:  "test summary",
			IsAllDay: true,
			Start:    &remote.DateTime{DateTime: "2026-09-10T00:00:00", TimeZone: timeZone},
			End:      &remote.DateTime{DateTime: "2026-09-10T23:59:59", TimeZone: timeZone},
		})

		require.Equal(t, "2026-09-10", result.Start.Date)
		require.Equal(t, "2026-09-11", result.End.Date)
		require.Empty(t, result.Start.DateTime)
		require.Empty(t, result.End.DateTime)
	})

	t.Run("all-day events spanning several days keep their last day", func(t *testing.T) {
		result := convertRemoteEventToGcalEvent(&remote.Event{
			Subject:  "test summary",
			IsAllDay: true,
			Start:    &remote.DateTime{DateTime: "2026-09-10T00:00:00", TimeZone: timeZone},
			End:      &remote.DateTime{DateTime: "2026-09-12T23:59:59", TimeZone: timeZone},
		})

		require.Equal(t, "2026-09-10", result.Start.Date)
		require.Equal(t, "2026-09-13", result.End.Date)
	})

	t.Run("all-day events without an end span a single day", func(t *testing.T) {
		result := convertRemoteEventToGcalEvent(&remote.Event{
			Subject:  "test summary",
			IsAllDay: true,
			Start:    &remote.DateTime{DateTime: "2026-09-10T00:00:00", TimeZone: timeZone},
		})

		require.Equal(t, "2026-09-10", result.Start.Date)
		require.Equal(t, "2026-09-11", result.End.Date)
	})
}
