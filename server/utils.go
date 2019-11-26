package main

import (
	"context"
	"encoding/json"
	"errors"
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

// Create a post as google calendar bot to the user directly
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

// CalendarConfig will return a oauth2 Config with the field set
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

// getCalendarService retrieve token stored in database and then generates a google calendar service
func (p *Plugin) getCalendarService(userID string) (*calendar.Service, error) {
	var token oauth2.Token

	tokenInByte, appErr := p.API.KVGet(userID + "calendarToken")
	if appErr != nil {
		return nil, errors.New(appErr.DetailedError)
	}

	json.Unmarshal(tokenInByte, &token)
	config := p.CalendarConfig()
	ctx := context.Background()
	tokenSource := config.TokenSource(ctx, &token)
	client := oauth2.NewClient(ctx, tokenSource)

	srv, err := calendar.New(client)
	if err != nil {
		return nil, err
	}

	return srv, nil
}

// CalendarSync either does a full sync or a incremental sync. Taken from googles sample code
// To better understand whats going on here, you can read https://developers.google.com/calendar/v3/sync
func (p *Plugin) CalendarSync(userID string) error {
	srv, err := p.getCalendarService(userID)

	if err != nil {
		return err
	}

	request := srv.Events.List("primary")

	isIncrementalSync := false
	syncTokenByte, KVGetErr := p.API.KVGet(userID + "syncToken")
	syncToken := string(syncTokenByte)
	if KVGetErr != nil || syncToken == "" {
		// Perform a Full Sync
		sixMonthsFromNow := time.Now().AddDate(0, 6, 0).Format(time.RFC3339)
		request.TimeMin(time.Now().Format(time.RFC3339)).TimeMax(sixMonthsFromNow).SingleEvents(true)
	} else {
		// Performing a Incremental Sync
		request.SyncToken(syncToken).ShowDeleted(true)
		isIncrementalSync = true
	}

	var pageToken string
	var events *calendar.Events
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
		allEventsJSON, _ := json.Marshal(allEvents)
		p.API.KVSet(userID+"events", allEventsJSON)
	} else {
		p.updateEventsInDatabase(userID, allEvents)
	}

	return nil
}

func (p *Plugin) updateEventsInDatabase(userID string, changedEvents []*calendar.Event) {
	eventsJSON, _ := p.API.KVGet(userID + "events")
	var events []*calendar.Event
	json.Unmarshal(eventsJSON, &events)

	var textToPost string
	shouldPostMessage := true
	for _, changedEvent := range changedEvents {
		for idx, oldEvent := range events {
			// If this is a event we created, we don't want to make notifications
			if changedEvent.Creator.Self {
				shouldPostMessage = false
			}

			// If a current event in our database matches a event that has changed
			if oldEvent.Id == changedEvent.Id {
				textToPost = fmt.Sprintf("**_Event Updated:_**\n")

				// If the events title has changed, we want to show the difference from the old one
				if oldEvent.Summary != changedEvent.Summary {
					textToPost += fmt.Sprintf("\n**~~[%v](%s)~~** ⟶ **[%v](%s)**\n", oldEvent.Summary, oldEvent.HtmlLink, changedEvent.Summary, changedEvent.HtmlLink)
				} else {
					textToPost += fmt.Sprintf("\n**[%v](%s)**\n", changedEvent.Summary, changedEvent.HtmlLink)
				}

				oldStartTime, _ := time.Parse(time.RFC3339, oldEvent.Start.DateTime)
				oldEndTime, _ := time.Parse(time.RFC3339, oldEvent.End.DateTime)

				changedStartTime, _ := time.Parse(time.RFC3339, changedEvent.Start.DateTime)
				changedEndTime, _ := time.Parse(time.RFC3339, changedEvent.End.DateTime)

				if oldStartTime != changedStartTime || oldEndTime != changedEndTime {
					textToPost += fmt.Sprintf("**When**: ~~%s @ %s to %s~~ ⟶ %s @ %s to %s\n", oldStartTime.Format(dateFormat), oldStartTime.Format(timeFormat),
						oldEndTime.Format(timeFormat), changedStartTime.Format(dateFormat), changedStartTime.Format(timeFormat), changedEndTime.Format(timeFormat))
				} else {
					textToPost += fmt.Sprintf("**When**: %s @ %s to %s\n",
						changedStartTime.Format(dateFormat), changedStartTime.Format(timeFormat), changedEndTime.Format(timeFormat))
				}

				if oldEvent.Location != changedEvent.Location {
					textToPost += fmt.Sprintf("**Where**: ~~%s~~ ⟶ %s\n", oldEvent.Location, changedEvent.Location)
				} else if changedEvent.Location != "" {
					textToPost += fmt.Sprintf("**Where**: %s\n", changedEvent.Location)
				}

				if len(oldEvent.Attendees) != len(changedEvent.Attendees) {
					textToPost += fmt.Sprintf("**Guests**: ~~%+v (Organizer) & %v more~~ ⟶ %+v (Organizer) & %v more\n",
						oldEvent.Organizer.Email, len(oldEvent.Attendees)-1, changedEvent.Organizer.Email, len(changedEvent.Attendees)-1)
				} else if changedEvent.Attendees != nil {
					textToPost += fmt.Sprintf("**Guests**: %+v (Organizer) & %v more\n",
						changedEvent.Organizer.Email, len(changedEvent.Attendees)-1)
				}

				if oldEvent.Status != changedEvent.Status {
					textToPost += fmt.Sprintf("**Status of Event**: ~~%s~~ ⟶ %s\n", strings.Title(oldEvent.Status), strings.Title(changedEvent.Status))
				} else {
					textToPost += fmt.Sprintf("**Status of Event**: %s\n", strings.Title(changedEvent.Status))
				}

				self := p.retrieveMyselfForEvent(changedEvent)
				if self != nil && changedEvent.Status != "cancelled" {
					if self.ResponseStatus == "needsAction" {
						config := p.API.GetConfig()
						url := fmt.Sprintf("%s/plugins/calendar/handleresponse?evtid=%s&",
							*config.ServiceSettings.SiteURL, changedEvent.Id)
						textToPost += fmt.Sprintf("**Going?**: [Yes](%s) | [No](%s) | [Maybe](%s)\n\n",
							url+"response=accepted", url+"response=declined", url+"response=tentative")
					} else if self.ResponseStatus == "declined" {
						textToPost += fmt.Sprintf("**Going?**: No\n\n")
					} else if self.ResponseStatus == "tentative" {
						textToPost += fmt.Sprintf("**Going?**: Maybe\n\n")
					} else {
						textToPost += fmt.Sprintf("**Going?**: Yes\n\n")
					}
				}

				// If the event was deleted, we want to remove it from our events slice in our database
				if changedEvent.Status == "cancelled" {
					events = append(events[:idx], events[idx+1:]...)
				} else {
					// Otherwise we want to replace the old event with the updated event
					events[idx] = changedEvent
				}

				break
			}

			// If we couldn't find the event in the database, it must be a new event so we append it
			// and post a your invited to a users channel
			if idx == len(events)-1 {
				if changedEvent.Status != "cancelled" {
					events = p.insertSort(events, changedEvent)
					textToPost = fmt.Sprintf("**_You've been invited:_**\n")
					textToPost += p.printEventSummary(userID, changedEvent)
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

func (p *Plugin) getPrimaryCalendarID(userID string) string {
	srv, _ := p.getCalendarService(userID)
	primaryCalendar, _ := srv.Calendars.Get("primary").Do()
	return primaryCalendar.Id
}

func (p *Plugin) getPrimaryCalendarLocation(userID string) *time.Location {
	srv, _ := p.getCalendarService(userID)
	primaryCalendar, _ := srv.Calendars.Get("primary").Do()
	timezone := primaryCalendar.TimeZone
	location, _ := time.LoadLocation(timezone)
	return location
}

func (p *Plugin) startCronJob(userID string) {
	cron := cron.New()
	cron.AddFunc("@every 1m", func() {
		p.remindUser(userID)
		p.userInEvent(userID)
	})
	cron.Start()
}

func (p *Plugin) setupCalendarWatch(userID string) error {
	srv, _ := p.getCalendarService(userID)
	// config := p.API.GetConfig()
	uuid := uuid.New().String()
	webSocketURL := "https://faa36686.ngrok.io" //*config.ServiceSettings.SiteURL
	channel, err := srv.Events.Watch("primary", &calendar.Channel{
		Address: fmt.Sprintf("%s/plugins/calendar/watch?userId=%s", webSocketURL, userID),
		Id:      uuid,
		Type:    "web_hook",
	}).Do()

	if err != nil {
		return err
	}

	watchChannelJSON, _ := channel.MarshalJSON()
	p.API.KVSet(userID+"watchToken", []byte(uuid))
	p.API.KVSet(userID+"watchChannel", watchChannelJSON)
	return nil
}

func (p *Plugin) remindUser(userID string) {
	eventsByte, _ := p.API.KVGet(userID + "events")
	userLocation := p.getPrimaryCalendarLocation(userID)
	var events []*calendar.Event
	json.Unmarshal(eventsByte, &events)
	for _, event := range events {
		if p.eventIsOld(userID, event) {
			continue
		}
		self := p.retrieveMyselfForEvent(event)
		iAmAttendingEvent := (p.iAmAttendingEvent(self) || event.Creator.Self)
		if !p.eventIsDeleted(event) && iAmAttendingEvent {
			t := time.Now().In(userLocation).Add(10 * time.Minute)
			tenMinutesLater := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), 0, 0, userLocation).Format(time.RFC3339)
			if tenMinutesLater == event.Start.DateTime {
				eventFormatted := p.printEventSummary(userID, event)
				p.CreateBotDMPost(userID, fmt.Sprintf("**_10 minutes until this event:_**\n\n%s", eventFormatted))
			}
		}
	}
}

func (p *Plugin) userInEvent(userID string) {
	eventsByte, _ := p.API.KVGet(userID + "events")
	userLocation := p.getPrimaryCalendarLocation(userID)
	var events []*calendar.Event
	json.Unmarshal(eventsByte, &events)
	for _, event := range events {
		if p.eventIsOld(userID, event) {
			continue
		}
		self := p.retrieveMyselfForEvent(event)
		iAmAttendingEvent := (p.iAmAttendingEvent(self) || event.Creator.Self)
		if !p.eventIsDeleted(event) && iAmAttendingEvent {
			now := time.Now().In(userLocation)
			tStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
			tEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
			if now.After(tStart) && now.Before(tEnd) {
				p.API.UpdateUserStatus(userID, "dnd")
			}
		}
	}
}

func (p *Plugin) printEventSummary(userID string, item *calendar.Event) string {
	var text string
	config := p.API.GetConfig()
	location := p.getPrimaryCalendarLocation(userID)
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

	attendee := p.retrieveMyselfForEvent(item)
	if attendee != nil {
		if attendee.ResponseStatus == "needsAction" {
			config := p.API.GetConfig()
			url := fmt.Sprintf("%s/plugins/calendar/handleresponse?evtid=%s&",
				*config.ServiceSettings.SiteURL, item.Id)
			text += fmt.Sprintf("**Going?**: [Yes](%s) | [No](%s) | [Maybe](%s)\n",
				url+"response=accepted", url+"response=declined", url+"response=tentative")
		} else if attendee.ResponseStatus == "declined" {
			text += fmt.Sprintf("**Going?**: No\n")
		} else if attendee.ResponseStatus == "tentative" {
			text += fmt.Sprintf("**Going?**: Maybe\n")
		} else {
			text += fmt.Sprintf("**Going?**: Yes\n")
		}
	}

	text += fmt.Sprintf("[Delete Event](%s/plugins/calendar/delete?evtid=%s)\n",
		*config.ServiceSettings.SiteURL, item.Id)

	return text
}

func (p *Plugin) insertSort(data []*calendar.Event, el *calendar.Event) []*calendar.Event {
	index := sort.Search(len(data), func(i int) bool { return data[i].Start.DateTime > el.Start.DateTime })
	data = append(data, &calendar.Event{})
	copy(data[index+1:], data[index:])
	data[index] = el
	return data
}

func (p *Plugin) iAmAttendingEvent(self *calendar.EventAttendee) bool {
	if self != nil {
		if self.ResponseStatus == "declined" || self.ResponseStatus == "needsAction" {
			return false
		}
	}

	return true
}

func (p *Plugin) retrieveMyselfForEvent(event *calendar.Event) *calendar.EventAttendee {
	for _, attendee := range event.Attendees {
		if attendee.Self {
			return attendee
		}
	}
	return nil
}

func (p *Plugin) eventIsDeleted(event *calendar.Event) bool {
	return event.Status == "cancelled"
}

func (p *Plugin) eventIsOld(userID string, event *calendar.Event) bool {
	userLocation := p.getPrimaryCalendarLocation(userID)
	now := time.Now().In(userLocation)
	tEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
	return now.After(tEnd)
}
