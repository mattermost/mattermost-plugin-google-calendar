package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/mattermost/mattermost-server/model"
	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"

	"github.com/mattermost/mattermost-server/plugin"
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
	authedUserId := r.Header.Get("Mattermost-User-ID")

	if authedUserId == "" {
		http.Error(w, "Not authorized", http.StatusUnauthorized)
		return
	}

	state := fmt.Sprintf("%v_%v", model.NewId()[10], authedUserId)

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
	authedUserId := r.Header.Get("Mattermost-User-ID")
	state := r.FormValue("state")
	code := r.FormValue("code")
	userId := strings.Split(state, "_")[1]
	config := p.CalendarConfig()
	if authedUserId == "" || userId != authedUserId {
		http.Error(w, "Not authorized", http.StatusUnauthorized)
		return
	}

	if storedState, err := p.API.KVGet(state); err != nil {
		http.Error(w, "Missing stored state", http.StatusBadRequest)
		return
	} else if string(storedState) != state {
		http.Error(w, "Invalid state", http.StatusBadRequest)
		return
	}

	if err := p.API.KVDelete(state); err != nil {
		http.Error(w, "Error deleting state", http.StatusBadRequest)
		return
	}

	token, err := config.Exchange(context.Background(), string(code))
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
	p.CalendarSync(userId)

	if err = p.setupCalendarWatch(userId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	p.startCronJob(authedUserId)

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
	userID := r.Header.Get("Mattermost-User-ID")
	eventID := r.URL.Query().Get("evtid")
	calendarID := p.getPrimaryCalendarID(userID)
	srv, err := p.getCalendarService(userID)
	if err != nil {
		p.CreateBotDMPost(userID, fmt.Sprintf("Unable to delete event. Error: %s", err))
		return
	}

	eventToBeDeleted, _ := srv.Events.Get(calendarID, eventID).Do()
	err = srv.Events.Delete(calendarID, eventID).Do()
	if err != nil {
		p.CreateBotDMPost(userID, fmt.Sprintf("Unable to delete event. Error: %s", err.Error()))
		return
	}

	p.CreateBotDMPost(userID, fmt.Sprintf("Success! Event _%s_ has been deleted.", eventToBeDeleted.Summary))
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

	userID := r.Header.Get("Mattermost-User-ID")
	response := r.URL.Query().Get("response")
	eventID := r.URL.Query().Get("evtid")
	calendarID := p.getPrimaryCalendarID(userID)
	srv, _ := p.getCalendarService(userID)

	eventToBeUpdated, err := srv.Events.Get(calendarID, eventID).Do()
	if err != nil {
		p.CreateBotDMPost(userID, fmt.Sprintf("Error! Failed to update the response of _%s_ event.", eventToBeUpdated.Summary))
		return
	}

	for idx, attendee := range eventToBeUpdated.Attendees {
		if attendee.Self {
			eventToBeUpdated.Attendees[idx].ResponseStatus = response
		}
	}

	event, err := srv.Events.Update(calendarID, eventID, eventToBeUpdated).Do()
	if err != nil {
		p.CreateBotDMPost(userID, fmt.Sprintf("Error! Failed to update the response of _%s_ event.", event.Summary))
	} else {
		p.CreateBotDMPost(userID, fmt.Sprintf("Success! Event _%s_ response has been updated.", event.Summary))
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

func (p *Plugin) watchCalendar(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	channelID := r.Header.Get("X-Goog-Channel-ID")
	resourceID := r.Header.Get("X-Goog-Resource-ID")
	state := r.Header.Get("X-Goog-Resource-State")

	watchToken, _ := p.API.KVGet(userID + "watchToken")
	channelByte, _ := p.API.KVGet(userID + "watchChannel")
	var channel calendar.Channel
	json.Unmarshal(channelByte, &channel)

	if string(watchToken) == channelID && state == "exists" {
		p.CalendarSync(userID)
	} else {
		srv, _ := p.getCalendarService(userID)
		srv.Channels.Stop(&calendar.Channel{
			Id:         channelID,
			ResourceId: resourceID,
		})
	}
}
