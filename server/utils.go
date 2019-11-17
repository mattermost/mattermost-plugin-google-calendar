package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mattermost/mattermost-server/mlog"
	"github.com/mattermost/mattermost-server/model"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
)

const (
	layoutISO = "2006-01-02"
	layoutUS  = "January 2, 2006"
	RFC850    = "Monday, 02-Jan-06 15:04:05 MST"
)

func (p *Plugin) CalendarConfig() *oauth2.Config {
	config := p.API.GetConfig()
	clientID := p.getConfiguration().CalendarClientId
	clientSecret := p.getConfiguration().CalendarClientSecret

	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  fmt.Sprintf("%s/plugins/calendar/oauth/complete", *config.ServiceSettings.SiteURL),
		Scopes: []string{
			"https://www.googleapis.com/auth/calendar",
		},
	}
}

// Retrieve a token, saves the token, then returns the generated client.
func (p *Plugin) getCalendarService(userID string) (*calendar.Service, string) {
	var unmarshalToken oauth2.Token
	token, err := p.API.KVGet(userID + "calendarToken")
	json.Unmarshal(token, &unmarshalToken)
	if err != nil {
		return nil, err.DetailedError
	}
	config := p.CalendarConfig()
	ctx := context.Background()
	tokenSource := config.TokenSource(ctx, &unmarshalToken)
	client := oauth2.NewClient(ctx, tokenSource)
	calendarService, srvErr := calendar.New(client)
	if srvErr != nil {
		return nil, srvErr.Error()
	}
	return calendarService, ""
}

func (p *Plugin) CreateBotDMPost(userID, message string) *model.AppError {
	channel, err := p.API.GetDirectChannel(userID, p.botId)
	if err != nil {
		mlog.Error("Couldn't get bot's DM channel", mlog.String("user_id", userID))
		return err
	}

	post := &model.Post{
		UserId:    p.botId,
		ChannelId: channel.Id,
		Message:   message,
	}

	if _, err := p.API.CreatePost(post); err != nil {
		mlog.Error(err.Error())
		return err
	}

	return nil
}
