// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"github.com/mattermost/mattermost-plugin-mscalendar/server/remote"
)

func (c *client) GetSuperuserToken() (string, error) {
	return "", remote.ErrNotImplemented
}
