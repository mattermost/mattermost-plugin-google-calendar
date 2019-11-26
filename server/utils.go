package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"

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
		sort.Slice(allEvents, func(i, j int) bool {
			return allEvents[i].Start.DateTime < allEvents[j].Start.DateTime
		})
		allEventsJson, _ := json.Marshal(allEvents)
		p.API.KVSet(userID+"events", allEventsJson)
	} else {
		p.updateEventsInDatabase(userID, allEvents)
	}
}

func (p *Plugin) updateEventsInDatabase(userID string, changedEvents []*calendar.Event) {
	eventsJson, _ := p.API.KVGet(userID + "events")
	var events []*calendar.Event
	json.Unmarshal(eventsJson, &events)

	var textToPost string
	shouldPostMessage := true
	for _, changedEvent := range changedEvents {
		for idx, oldEvent := range events {
			if oldEvent.Id == changedEvent.Id {
				textToPost = fmt.Sprintf("**_Event Updated:_**\n")

				if oldEvent.Summary != changedEvent.Summary {
					textToPost += fmt.Sprintf("\n**~~[%v](%s)~~** ⟶ **[%v](%s)**\n", oldEvent.Summary, oldEvent.HtmlLink, changedEvent.Summary, changedEvent.HtmlLink)
				} else {
					textToPost += fmt.Sprintf("\n**[%v](%s)**\n", oldEvent.Summary, oldEvent.HtmlLink)
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
					textToPost += fmt.Sprintf("**Status of Event**: ~~%s~~ ⟶ %s\n", strings.Title(oldEvent.Status), strings.Title(changedEvent.Status))
				} else {
					textToPost += fmt.Sprintf("**Status of Event**: %s\n", strings.Title(oldEvent.Status))
				}

				for _, attendee := range changedEvent.Attendees {
					if attendee.Self && changedEvent.Status != "cancelled" {
						if attendee.ResponseStatus == "needsAction" {
							config := p.API.GetConfig()
							url := fmt.Sprintf("%s/plugins/calendar/handleresponse?evtid=%s&",
								*config.ServiceSettings.SiteURL, changedEvent.Id)
							textToPost += fmt.Sprintf("**Going?**: [Yes](%s) [No](%s) [Maybe](%s)\n",
								url+"response=accepted", url+"response=declined", url+"response=tentative")
						} else if attendee.ResponseStatus == "declined" {
							textToPost += fmt.Sprintf("**Going?**: No")
						} else if attendee.ResponseStatus == "tentative" {
							textToPost += fmt.Sprintf("**Going?**: Maybe")
						} else {
							textToPost += fmt.Sprintf("**Going?**: Yes")
						}
					}
				}

				if changedEvent.Status == "cancelled" {
					events = append(events[:idx], events[idx+1:]...)
				} else {
					events[idx] = changedEvent
				}

				if oldEvent.Creator.Self {
					shouldPostMessage = false
				}

				break
			}

			if idx == len(events)-1 {
				events = p.insertSort(events, changedEvent)
				textToPost = fmt.Sprintf("**_You've been invited:_**\n")
				textToPost += p.PrintEventSummary(userID, changedEvent)
				// fmt.Sprintf("\n\n**[%v](%s)**\n", changedEvent.Summary, changedEvent.HtmlLink)

				// startTime, _ := time.Parse(time.RFC3339, changedEvent.Start.DateTime)
				// endTime, _ := time.Parse(time.RFC3339, changedEvent.End.DateTime)

				// dateToDisplay := startTime.Format(dateFormat)
				// timeToDisplay := fmt.Sprintf("%v to %v", startTime.Format(timeFormat), endTime.Format(timeFormat))
				// if startTime.Format(timeFormat) == "12:00 AM UTC" && endTime.Format(timeFormat) == "12:00 AM UTC" {
				// 	timeToDisplay = "All-day"
				// }
				// textToPost += fmt.Sprintf("**When**: %s @ %s\n", dateToDisplay, timeToDisplay)

				// if changedEvent.Location != "" {
				// 	textToPost += fmt.Sprintf("**Where**: %s\n", changedEvent.Location)
				// }

				// if changedEvent.Attendees != nil {
				// 	textToPost += fmt.Sprintf("**Guests**: %+v (Organizer) & %v more\n", changedEvent.Organizer.Email, len(changedEvent.Attendees)-1)
				// }
				// textToPost += fmt.Sprintf("**Status of Event**: %s\n", strings.Title(changedEvent.Status))

				// for _, attendee := range changedEvent.Attendees {
				// 	if attendee.Self {
				// 		if attendee.ResponseStatus == "needsAction" {
				// 			config := p.API.GetConfig()
				// 			url := fmt.Sprintf("%s/plugins/calendar/handleresponse?evtid=%s&",
				// 				*config.ServiceSettings.SiteURL, changedEvent.Id)
				// 			textToPost += fmt.Sprintf("**Going?**: [Yes](%s) [No](%s) [Maybe](%s)\n\n",
				// 				url+"response=accepted", url+"response=declined", url+"response=tentative")
				// 		} else if attendee.ResponseStatus == "declined" {
				// 			textToPost += fmt.Sprintf("**Going?**: No\n\n")
				// 		} else if attendee.ResponseStatus == "tentative" {
				// 			textToPost += fmt.Sprintf("**Going?**: Maybe\n\n")
				// 		} else {
				// 			textToPost += fmt.Sprintf("**Going?**: Yes\n\n")
				// 		}
				// 	}
				// }

				if changedEvent.Creator.Self {
					shouldPostMessage = false
				}
			}
		}
	}

	newEvents, _ := json.Marshal(events)
	p.API.KVSet(userID+"events", newEvents)

	if textToPost != "" && shouldPostMessage {
		p.CreateBotDMPost(userID, textToPost)
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

func (p *Plugin) getPrimaryCalendarId(userID string) string {
	srv, _ := p.getCalendarService(userID)
	primaryCalendar, _ := srv.Calendars.Get("primary").Do()
	return primaryCalendar.Id
}

func (p *Plugin) GetPrimaryCalendarLocation(userID string) *time.Location {
	srv, _ := p.getCalendarService(userID)
	primaryCalendar, _ := srv.Calendars.Get("primary").Do()
	timezone := primaryCalendar.TimeZone
	location, _ := time.LoadLocation(timezone)
	return location
}

func (p *Plugin) StartCronJob(userId string) {
	cron := cron.New(cron.WithSeconds())
	p.CreateBotDMPost(userId, "start cron job")
	cron.AddFunc("@every 1m", func() {
		p.RemindUser(userId)
		p.UserInEvent(userId)
	})
	cron.Start()
}

func (p *Plugin) SetupCalendarWatch(userID string) error {
	srv, _ := p.getCalendarService(userID)
	// config := p.API.GetConfig()
	uuid := uuid.New().String()
	webSocketURL := "https://960b59fb.ngrok.io" //*config.ServiceSettings.SiteURL
	channel, err := srv.Events.Watch("primary", &calendar.Channel{
		Address: fmt.Sprintf("%s/plugins/calendar/watch?userId=%s", webSocketURL, userID),
		Id:      uuid,
		Type:    "web_hook",
	}).Do()

	if err != nil {
		return err
	}

	watchChannelJson, _ := channel.MarshalJSON()
	p.API.KVSet(userID+"watchToken", []byte(uuid))
	p.API.KVSet(userID+"watchChannel", watchChannelJson)
	return nil
}

func (p *Plugin) RemindUser(userId string) {
	eventsByte, _ := p.API.KVGet(userId + "events")
	userLocation := p.GetPrimaryCalendarLocation(userId)
	var events []*calendar.Event
	json.Unmarshal(eventsByte, &events)
	for _, event := range events {
		attendEvent := p.IAmAttendingEvent(event)
		if event.Status != "cancelled" && attendEvent {
			t := time.Now().In(userLocation).Add(10 * time.Minute)
			tenMinutesLater := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), 0, 0, userLocation).Format(time.RFC3339)
			if tenMinutesLater == event.Start.DateTime {
				eventFormatted := p.PrintEventSummary(userId, event)
				p.CreateBotDMPost(userId, fmt.Sprintf("**_10 minutes until this event:_**\n\n%s", eventFormatted))
			}
		}
	}
}

func (p *Plugin) UserInEvent(userId string) {
	eventsByte, _ := p.API.KVGet(userId + "events")
	userLocation := p.GetPrimaryCalendarLocation(userId)
	var events []*calendar.Event
	json.Unmarshal(eventsByte, &events)
	for _, event := range events {
		attendEvent := p.IAmAttendingEvent(event)
		if event.Status != "cancelled" && attendEvent {
			now := time.Now().In(userLocation)
			tStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
			tEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
			if now.After(tStart) && now.Before(tEnd) {
				p.API.UpdateUserStatus(userId, "dnd")
			}
		}
	}
}

func (p *Plugin) PrintEventSummary(userId string, item *calendar.Event) string {
	var text string
	location := p.GetPrimaryCalendarLocation(userId)
	date := time.Now().In(location).Format(dateFormat)
	startTime, _ := time.Parse(time.RFC3339, item.Start.DateTime)
	endTime, _ := time.Parse(time.RFC3339, item.End.DateTime)
	currentTime := time.Now().In(location).Format(dateFormat)
	tomorrowTime := time.Now().AddDate(0, 0, 1).In(location).Format(dateFormat)
	dateToDisplay := date
	if date == currentTime {
		dateToDisplay = "Today"
	} else if date == tomorrowTime {
		dateToDisplay = "Tomorrow"
	}

	text += fmt.Sprintf("\n**[%v](%s)**\n", item.Summary, item.HtmlLink)

	timeToDisplay := fmt.Sprintf("%v to %v", startTime.Format(timeFormat), endTime.Format(timeFormat))
	if startTime.Format(timeFormat) == "12:00 AM UTC" && endTime.Format(timeFormat) == "12:00 AM UTC" {
		timeToDisplay = "All-day"
	}
	text += fmt.Sprintf("**When**: %s @ %s\n", dateToDisplay, timeToDisplay)

	if item.Location != "" {
		text += fmt.Sprintf("**Where**: %s\n", item.Location)
	}

	if item.Attendees != nil {
		text += fmt.Sprintf("**Guests**: %+v (Organizer) & %v more\n", item.Organizer.Email, len(item.Attendees)-1)
	}
	text += fmt.Sprintf("**Status of Event**: %s\n", strings.Title(item.Status))

	for _, attendee := range item.Attendees {
		if attendee.Self {
			if attendee.ResponseStatus == "needsAction" {
				config := p.API.GetConfig()
				url := fmt.Sprintf("%s/plugins/calendar/handleresponse?evtid=%s&",
					*config.ServiceSettings.SiteURL, item.Id)
				text += fmt.Sprintf("**Going?**: [Yes](%s) [No](%s) [Maybe](%s)\n",
					url+"response=accepted", url+"response=declined", url+"response=tentative")
			} else if attendee.ResponseStatus == "declined" {
				text += fmt.Sprintf("**Going?**: No\n")
			} else if attendee.ResponseStatus == "tentative" {
				text += fmt.Sprintf("**Going?**: Maybe\n")
			} else {
				text += fmt.Sprintf("**Going?**: Yes\n")
			}
		}
	}

	return text
}

func (p *Plugin) insertSort(data []*calendar.Event, el *calendar.Event) []*calendar.Event {
	index := sort.Search(len(data), func(i int) bool { return data[i].Start.DateTime > el.Start.DateTime })
	data = append(data, &calendar.Event{})
	copy(data[index+1:], data[index:])
	data[index] = el
	return data
}

func (p *Plugin) IAmAttendingEvent(el *calendar.Event) bool {
	for _, attendee := range el.Attendees {
		if attendee.Self {
			if attendee.ResponseStatus == "declined" {
				return false
			}
		}
	}

	return true
}
