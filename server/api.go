package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"
)

// ServeHTTP allows the plugin to implement the http.Handler interface. Requests destined for the
// /plugins/{id} path will be routed to the plugin.
//
// The Mattermost-User-Id header will be present if (and only if) the request is by an
// authenticated user.
//
// This demo implementation sends back whether or not the plugin hooks are currently enabled. It
// is used by the web app to recover from a network reconnection and synchronize the state of the
// plugin's hooks.
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch path := r.URL.Path; path {
	case "/oauth/connect":
		p.connectCalendar(w, r)
	case "/oauth/complete":
		p.completeCalendar(w, r)
	case "/delete":
		p.deleteEvent(w, r)
	case "/handleresponse":
		p.handleEventResponse(w, r)
	case "/watch":
		p.watchCalendar(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (p *Plugin) connectCalendar(w http.ResponseWriter, r *http.Request) {
	autheduserId := r.Header.Get("Mattermost-User-ID")

	if autheduserId == "" {
		http.Error(w, "Not authorized", http.StatusUnauthorized)
		return
	}

	state := fmt.Sprintf("%v_%v", model.NewId()[10], autheduserId)

	if err := p.API.KVSet(state, []byte(state)); err != nil {
		http.Error(w, "Failed to save state", http.StatusBadRequest)
		return
	}

	calendarConfig := p.CalendarConfig()

	url := calendarConfig.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)

	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (p *Plugin) completeCalendar(w http.ResponseWriter, r *http.Request) {
	html := `
	<!DOCTYPE html>
	<html>
		<head>
			<script>
				window.close();
			</script>
		</head>
		<body>
			<p>Completed connecting to Google Calendar. Please close this window.</p>
		</body>
	</html>
	`
	autheduserId := r.Header.Get("Mattermost-User-ID")
	state := r.FormValue("state")
	code := r.FormValue("code")
	userId := strings.Split(state, "_")[1]
	config := p.CalendarConfig()
	if autheduserId == "" || userId != autheduserId {
		http.Error(w, "Not authorized", http.StatusUnauthorized)
		return
	}

	storedState, apiErr := p.API.KVGet(state)
	if apiErr != nil {
		http.Error(w, "Missing stored state", http.StatusBadRequest)
		return
	}

	if string(storedState) != state {
		http.Error(w, "Invalid state", http.StatusBadRequest)
		return
	}

	if err := p.API.KVDelete(state); err != nil {
		http.Error(w, "Error deleting state", http.StatusBadRequest)
		return
	}

	token, err := config.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, "Error setting up Config Exchange", http.StatusBadRequest)
		return
	}

	tokenJSON, err := json.Marshal(token)
	if err != nil {
		http.Error(w, "Invalid token marshal in completeCalendar", http.StatusBadRequest)
		return
	}

	p.API.KVSet(userId+"calendarToken", tokenJSON)

	err = p.CalendarSync(userId)
	if err != nil {
		p.API.LogWarn("failed sync fresh calender", "error", err.Error())
		http.Error(w, "failed sync fresh calender", http.StatusInternalServerError)
		return
	}

	if err = p.setupCalendarWatch(userId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Save array of users to service in the notification cron job
	storedUsers, apiErr := p.API.KVGet("NotificationCronJobUsers")

	if apiErr != nil {
		http.Error(w, "Missing NotificationCronJobUsers", http.StatusBadRequest)
		return
	}

	storedUsersString := userId
	if len(storedUsers) > 0 {
		storedUsersString = fmt.Sprintf("%s,%s", string(storedUsers), userId)
	}
	p.API.KVSet("NotificationCronJobUsers", []byte(storedUsersString))

	// Post intro post
	message := "#### Welcome to the Mattermost Google Calendar Plugin!\n" +
		"You've successfully connected your Mattermost account to your Google Calendar.\n" +
		"Please type **/calendar help** to understand how to user this plugin. "

	p.CreateBotDMPost(userId, message)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

func (p *Plugin) deleteEvent(w http.ResponseWriter, r *http.Request) {
	html := `
	<!DOCTYPE html>
	<html>
		<head>
			<script>
				window.close();
			</script>
		</head>
	</html>
	`
	userId := r.Header.Get("Mattermost-User-ID")
	eventID := r.URL.Query().Get("evtid")
	calendarID := p.getPrimaryCalendarID(userId)
	srv, err := p.getCalendarService(userId)
	if err != nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Unable to delete event. Error: %s", err))
		return
	}

	eventToBeDeleted, _ := srv.Events.Get(calendarID, eventID).Do()
	err = srv.Events.Delete(calendarID, eventID).Do()
	if err != nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Unable to delete event. Error: %s", err.Error()))
		return
	}

	p.CreateBotDMPost(userId, fmt.Sprintf("Success! Event _%s_ has been deleted.", eventToBeDeleted.Summary))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

func (p *Plugin) handleEventResponse(w http.ResponseWriter, r *http.Request) {
	html := `
	<!DOCTYPE html>
	<html>
		<head>
			<script>
				window.close();
			</script>
		</head>
	</html>
	`

	userId := r.Header.Get("Mattermost-User-ID")
	response := r.URL.Query().Get("response")
	eventID := r.URL.Query().Get("evtid")
	calendarID := p.getPrimaryCalendarID(userId)
	srv, _ := p.getCalendarService(userId)

	eventToBeUpdated, err := srv.Events.Get(calendarID, eventID).Do()
	if err != nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Error! Failed to update the response of _%s_ event.", eventToBeUpdated.Summary))
		return
	}

	for idx, attendee := range eventToBeUpdated.Attendees {
		if attendee.Self {
			eventToBeUpdated.Attendees[idx].ResponseStatus = response
		}
	}

	event, err := srv.Events.Update(calendarID, eventID, eventToBeUpdated).Do()
	if err != nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Error! Failed to update the response of _%s_ event.", event.Summary))
	} else {
		p.CreateBotDMPost(userId, fmt.Sprintf("Success! Event _%s_ response has been updated.", event.Summary))
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

func (p *Plugin) watchCalendar(w http.ResponseWriter, r *http.Request) {
	userId := r.URL.Query().Get("userId")
	channelID := r.Header.Get("X-Goog-Channel-ID")
	resourceID := r.Header.Get("X-Goog-Resource-ID")
	state := r.Header.Get("X-Goog-Resource-State")

	watchToken, _ := p.API.KVGet(userId + "watchToken")
	channelByte, _ := p.API.KVGet(userId + "watchChannel")
	var channel calendar.Channel
	json.Unmarshal(channelByte, &channel)
	if string(watchToken) == channelID && state == "exists" {
		p.CalendarSync(userId)
	} else {
		srv, _ := p.getCalendarService(userId)
		srv.Channels.Stop(&calendar.Channel{
			Id:         channelID,
			ResourceId: resourceID,
		})
	}
}
