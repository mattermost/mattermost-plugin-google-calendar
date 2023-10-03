// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"context"

	"github.com/pkg/errors"

	"google.golang.org/api/option"
	"google.golang.org/api/people/v1"

	"github.com/mattermost/mattermost-plugin-mscalendar/server/remote"
)

const personFields = "names,emailAddresses"

func (c *client) GetMe() (*remote.User, error) {
	service, err := people.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetMe, error creating service")
	}

	req := service.People.Get("people/me")
	req.PersonFields(personFields)
	user, err := req.Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal GetMe, error performing request")
	}

	name := "No name"
	principalName := ""
	email := "No email"

	if len(user.Names) > 0 {
		name = user.Names[0].DisplayName
	}

	if len(user.EmailAddresses) > 0 {
		// for some reason this is always blank
		email = user.EmailAddresses[0].Value
	}

	remoteUser := &remote.User{
		ID:                user.ResourceName,
		DisplayName:       name,
		UserPrincipalName: principalName,
		Mail:              email,
	}

	return remoteUser, nil
}
