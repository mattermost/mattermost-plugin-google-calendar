// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

// FindMeetingTimes finds meeting time suggestions for a calendar event
func (c *client) FindMeetingTimes(remoteUserID string, params *remote.FindMeetingTimesParameters) (*remote.MeetingTimeSuggestionResults, error) {
	return nil, errors.New("gcal FindMeetingTimes not implemented")
}
