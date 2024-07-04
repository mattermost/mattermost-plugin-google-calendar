package gcal

import (
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

func (c *client) GetSchedule(_ []*remote.ScheduleUserInfo, _, _ *remote.DateTime, _ int) ([]*remote.ScheduleInformation, error) {
	return nil, remote.ErrNotImplemented
}
