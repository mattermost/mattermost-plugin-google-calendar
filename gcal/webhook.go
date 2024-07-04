// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

package gcal

import (
	"net/http"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/remote"
)

type webhook struct {
	ChangeType                     string `json:"changeType"`
	ClientState                    string `json:"clientState,omitempty"`
	Resource                       string `json:"resource,omitempty"`
	SubscriptionExpirationDateTime string `json:"subscriptionExpirationDateTime,omitempty"`
	SubscriptionID                 string `json:"subscriptionId"`
	ResourceData                   struct {
		DataType string `json:"@odata.type"`
	} `json:"resourceData"`
}

const (
	resourceStateSync      = "sync"
	resourceStateExists    = "exists"
	resourceStateNotExists = "not_exists"
)

func (r *impl) HandleWebhook(w http.ResponseWriter, req *http.Request) []*remote.Notification {
	resourceState := req.Header.Get("X-Goog-Resource-State")
	if resourceState == resourceStateSync {
		w.WriteHeader(http.StatusAccepted)
		return []*remote.Notification{}
	}

	notificationChannelID := req.Header.Get("X-Goog-Channel-Id")
	resourceID := req.Header.Get("X-Goog-Resource-Id")
	token := req.Header.Get("X-Goog-Channel-Token")

	wh := &webhook{
		SubscriptionID: notificationChannelID,
		ClientState:    token,
		Resource:       resourceID,
	}

	n := &remote.Notification{
		SubscriptionID: notificationChannelID,
		// ChangeType:     wh.ChangeType, // not needed
		ClientState: wh.ClientState,
		IsBare:      true,
		// WebhookRawData: rawData,
		Webhook: wh,
	}

	w.WriteHeader(http.StatusAccepted)

	notifications := []*remote.Notification{n}
	return notifications
}
