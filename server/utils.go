package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/mlog"
	"github.com/mattermost/mattermost-server/model"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
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

func (p *Plugin) CalendarSync(userID string) {
	srv, _ := p.getCalendarService(userID)
	request := srv.Events.List("primary")

	isIncrementalSync := false
	syncToken, kvGetErr := p.API.KVGet(userID + "syncToken")
	syncTokenToString := string(syncToken)
	if kvGetErr != nil || syncTokenToString == "" {
		// Perform a Full Sync
		sixMonthsFromNow := time.Now().AddDate(0, 0, 7).Format(time.RFC3339)
		request.TimeMin(time.Now().Format(time.RFC3339)).TimeMax(sixMonthsFromNow).SingleEvents(true)
	} else {
		// Performing a Incremental Sync
		request.SyncToken(syncTokenToString).ShowDeleted(true)
		isIncrementalSync = true
	}

	pageToken := ""
	var events *calendar.Events
	var err error
	var allEvents []*calendar.Event
	for ok := true; ok; ok = pageToken != "" {
		request.PageToken(pageToken)
		events, err = request.Do()
		if err != nil {
			p.API.KVDelete(userID + "syncToken")
			p.API.KVDelete(userID + "events")
			p.CalendarSync(userID)
		}
		if len(events.Items) != 0 {
			for _, item := range events.Items {
				allEvents = append(allEvents, item)
			}
		}
		pageToken = events.NextPageToken
	}

	p.API.KVSet(userID+"syncToken", []byte(events.NextSyncToken))
	if !isIncrementalSync {
		allEventsJson, _ := json.Marshal(allEvents)
		p.API.KVSet(userID+"events", allEventsJson)
	} else {
		p.updateEventsInDatabase(userID, allEvents)
	}
}

func (p *Plugin) updateEventsInDatabase(userID string, changedEvents []*calendar.Event) {
	channel, _ := p.API.GetDirectChannel(userID, p.botId)
	eventsJson, _ := p.API.KVGet(userID + "events")
	var events []*calendar.Event
	json.Unmarshal(eventsJson, &events)

	var textToPost string
	var updateDatabase bool = true
	for _, changedEvent := range changedEvents {
		for idx, oldEvent := range events {
			if oldEvent.Id == changedEvent.Id {
				textToPost = fmt.Sprintf("#### EVENT UPDATED!!!!\n")

				if oldEvent.Summary != changedEvent.Summary {
					textToPost += fmt.Sprintf("**~~[%v](%s)~~** ⟶ **[%v](%s)**\n", oldEvent.Summary, oldEvent.HtmlLink, changedEvent.Summary, changedEvent.HtmlLink)
				} else {
					textToPost += fmt.Sprintf("**[%v](%s)**\n", oldEvent.Summary, oldEvent.HtmlLink)
				}

				oldStartTime, _ := time.Parse(time.RFC3339, oldEvent.Start.DateTime)
				oldEndTime, _ := time.Parse(time.RFC3339, oldEvent.End.DateTime)

				changedStartTime, _ := time.Parse(time.RFC3339, changedEvent.Start.DateTime)
				changedEndTime, _ := time.Parse(time.RFC3339, changedEvent.End.DateTime)

				if oldStartTime != changedStartTime || oldEndTime != changedEndTime {
					textToPost += fmt.Sprintf("**When**: ~~%s @ %s to %s~~ ⟶ %s @ %s to %s\n", oldStartTime.Format(dateFormat), oldStartTime.Format(timeFormat),
						oldEndTime.Format(timeFormat), changedStartTime.Format(dateFormat), changedStartTime.Format(timeFormat), changedEndTime.Format(timeFormat))
				} else {
					textToPost += fmt.Sprintf("**When**: %s @ %s to %s\n", oldStartTime.Format(dateFormat), oldStartTime.Format(timeFormat), oldEndTime.Format(timeFormat))
				}

				if oldEvent.Location != changedEvent.Location && changedEvent.Location != "" {
					textToPost += fmt.Sprintf("**Where**: ~~%s~~ ⟶ %s\n", oldEvent.Location, changedEvent.Location)
				} else if oldEvent.Location != "" {
					textToPost += fmt.Sprintf("**Where**: %s\n", oldEvent.Location)
				}

				if len(oldEvent.Attendees) != len(changedEvent.Attendees) {
					textToPost += fmt.Sprintf("**Guests**: ~~%+v (Organizer) & %v more~~ ⟶ %+v (Organizer) & %v more\n",
						oldEvent.Organizer.Email, len(oldEvent.Attendees)-1, changedEvent.Organizer.Email, len(changedEvent.Attendees)-1)
				} else if oldEvent.Attendees != nil {
					textToPost += fmt.Sprintf("**Guests**: %+v (Organizer) & %v more\n",
						oldEvent.Organizer.Email, len(oldEvent.Attendees)-1)
				}

				if oldEvent.Status != changedEvent.Status {
					textToPost += fmt.Sprintf("**Status of Event**: ~~%s~~ ⟶ %s\n\n", strings.Title(oldEvent.Status), strings.Title(changedEvent.Status))
				} else {
					textToPost += fmt.Sprintf("**Status of Event**: %s\n\n", strings.Title(oldEvent.Status))
				}

				if changedEvent.Status == "cancelled" {
					events = append(events[:idx], events[idx+1:]...)
				}
				break
			}

			if idx == len(events)-1 && !changedEvent.Creator.Self {
				p.API.KVDelete(userID + "syncToken")
				p.API.KVDelete(userID + "events")
				p.CalendarSync(userID)
				textToPost = fmt.Sprintf("**NEW EVENT W00T W00T LETS GET IT LETS GO!**")
				updateDatabase = false
			}
			// p.CreateBotDMPost(userID, textToPost)
		}
	}

	if updateDatabase {
		newEvents, _ := json.Marshal(events)
		p.API.KVSet(userID+"events", newEvents)
	}

	if textToPost != "" {
		post := &model.Post{
			UserId:    p.botId,
			ChannelId: channel.Id,
			Message:   textToPost,
		}
		p.API.SendEphemeralPost(userID, post)
	}
}

func (p *Plugin) printAllEventsInDatabase(userID string) {
	channel, _ := p.API.GetDirectChannel(userID, p.botId)

	eventsJson, _ := p.API.KVGet(userID + "events")
	var events []*calendar.Event
	json.Unmarshal(eventsJson, &events)

	for _, event := range events {
		post := &model.Post{
			UserId:    p.botId,
			ChannelId: channel.Id,
			Message:   event.Summary,
		}
		p.API.SendEphemeralPost(userID, post)
	}
}
