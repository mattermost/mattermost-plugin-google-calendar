// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-mscalendar/server/utils/bot"
)

func (c *client) DeleteCalendar(remoteUserID string, calID string) error {
	if true {
		return errors.New("gcal DeleteCalendar not implemented")
	}

	err := c.rbuilder.Users().ID(remoteUserID).Calendars().ID(calID).Request().Delete(c.ctx)
	if err != nil {
		return errors.Wrap(err, "msgraph DeleteCalendar")
	}
	c.Logger.With(bot.LogContext{}).Infof("msgraph: DeleteCalendar deleted calendar `%v`.", calID)
	return nil
}
