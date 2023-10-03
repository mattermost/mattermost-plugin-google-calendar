// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"net/http"

	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-mscalendar/server/remote"
)

// FindMeetingTimes finds meeting time suggestions for a calendar event
func (c *client) FindMeetingTimes(remoteUserID string, params *remote.FindMeetingTimesParameters) (*remote.MeetingTimeSuggestionResults, error) {
	if true {
		return nil, errors.New("gcal FindMeetingTimes not implemented")
	}

	meetingsOut := &remote.MeetingTimeSuggestionResults{}
	req := c.rbuilder.Users().ID(remoteUserID).FindMeetingTimes(nil).Request()
	err := req.JSONRequest(c.ctx, http.MethodPost, "", &params, &meetingsOut)
	if err != nil {
		return nil, errors.Wrap(err, "msgraph FindMeetingTimes")
	}
	return meetingsOut, nil
}
