// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"context"
	"fmt"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
)

const subscribeTTL = 7 * 24 * time.Hour // 7 days

const defaultCalendarName = "primary"
const googleSubscriptionType = "webhook"
const subscriptionSuffix = "_calendar_event_notifications_"

// CreateMySubscription creates a subscription for the user's calendar
func (c *client) CreateMySubscription(notificationURL, remoteUserID string) (*remote.Subscription, error) {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return nil, errors.Wrap(err, "gcal CreateMySubscription, error creating service")
	}

	reqBody := &calendar.Channel{
		Id:      remoteUserID + subscriptionSuffix + newRandomString(),
		Token:   newRandomString(),
		Type:    googleSubscriptionType,
		Address: notificationURL,
		Params: map[string]string{
			"ttl": fmt.Sprintf("%d", int64(subscribeTTL.Seconds())),
		},
	}

	createSubscriptionRequest := service.Events.Watch(defaultCalendarName, reqBody).EventTypes("default")
	googleSubscription, err := createSubscriptionRequest.Do()
	if err != nil {
		return nil, errors.Wrap(err, "gcal CreateMySubscription, error creating subscription")
	}

	sub := &remote.Subscription{
		ID:         googleSubscription.Id,
		ResourceID: googleSubscription.ResourceId,
		Resource:   defaultCalendarName,
		// ChangeType:         "created,updated,deleted",
		NotificationURL:    notificationURL,
		ExpirationDateTime: time.Now().Add(time.Second * time.Duration(googleSubscription.Expiration)).Format(time.RFC3339),
		ClientState:        reqBody.Token,
		CreatorID:          remoteUserID,
	}

	c.Logger.With(bot.LogContext{
		"subscriptionID": sub.ID,
		"resource":       sub.Resource,
		// "changeType":         sub.ChangeType,
		"expirationDateTime": sub.ExpirationDateTime,
	}).Debugf("gcal: created subscription.")

	return sub, nil
}

// DeleteSubscription deletes a subscription
func (c *client) DeleteSubscription(sub *remote.Subscription) error {
	service, err := calendar.NewService(context.Background(), option.WithHTTPClient(c.httpClient))
	if err != nil {
		return errors.Wrap(err, "gcal DeleteSubscription, error creating service")
	}

	stopRequest := service.Channels.Stop(&calendar.Channel{
		Id:         sub.ID,
		ResourceId: sub.ResourceID,
	})
	err = stopRequest.Do()

	if err != nil {
		return errors.Wrap(err, "gcal DeleteSubscription, error from google response")
	}

	c.Logger.With(bot.LogContext{
		"subscriptionID": sub.ID,
	}).Debugf("gcal: deleted subscription.")

	return nil
}

// RenewSubscription deletes the old subscription and creates a new one in order to "renew" it
func (c *client) RenewSubscription(notificationURL, remoteUserID string, oldSub *remote.Subscription) (*remote.Subscription, error) {
	err := c.DeleteSubscription(oldSub)
	if err != nil {
		return nil, errors.Wrap(err, "gcal RenewSubscription, error deleting subscription")
	}

	sub, err := c.CreateMySubscription(notificationURL, remoteUserID)
	if err != nil {
		return nil, errors.Wrap(err, "gcal RenewSubscription, error deleting subscription")
	}

	c.Logger.Debugf("gcal: renewed subscription.")

	return sub, nil
}

// ListSubscriptions lists all subscriptions
func (c *client) ListSubscriptions() ([]*remote.Subscription, error) {
	return nil, errors.New("gcal ListSubscriptions not implemented. only used for debug command")
}
