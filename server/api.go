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
	case "/test":
		p.test(w, r)
	case "/test2":
		p.test2(w, r)
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

	err := p.API.KVSet(state, []byte(state))

	if err != nil {
		http.Error(w, "Failed to save state", http.StatusBadRequest)
		return
	}

	calendarConfig := p.CalendarConfig()

	url := calendarConfig.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)

	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (p *Plugin) completeCalendar(w http.ResponseWriter, r *http.Request) {
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

	token, _ := config.Exchange(context.Background(), string(code))
	tokenJson, marshalErr := json.Marshal(token)
	if marshalErr != nil {
		http.Error(w, "invalid token to json marshal", http.StatusBadRequest)
		return
	}
	p.API.KVSet(userId+"calendarToken", tokenJson)
	p.CalendarSync(userId)
	err := p.SetupCalendarWatch(userId)

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	p.StartCronJob(authedUserId)
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
	// Post intro post
	message := "#### Welcome to the Mattermost Google Calendar Plugin!\n" +
		"You've successfully connected your Mattermost account to your Google Calendar."

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
	srv, errString := p.getCalendarService(userId)
	if srv == nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Unable to delete event. Error: %s", errString))
		return
	}
	eventId := r.URL.Query().Get("evtid")
	calendarId := r.URL.Query().Get("calid")
	eventToBeDeleted, _ := srv.Events.Get(calendarId, eventId).Do()
	err := srv.Events.Delete(calendarId, eventId).Do()
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
	eventId := r.URL.Query().Get("evtid")
	calendarId := p.getPrimaryCalendarId(userId)
	srv, _ := p.getCalendarService(userId)

	eventToBeUpdated, err := srv.Events.Get(calendarId, eventId).Do()
	if err != nil {
		p.CreateBotDMPost(userId, fmt.Sprintf("Error! Failed to update the response of _%s_ event.", eventToBeUpdated.Summary))
		return
	}

	for idx, attendee := range eventToBeUpdated.Attendees {
		if attendee.Self {
			eventToBeUpdated.Attendees[idx].ResponseStatus = response
		}
	}

	event, err := srv.Events.Update(calendarId, eventId, eventToBeUpdated).Do()
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
	channelId := r.Header.Get("X-Goog-Channel-ID")
	resourceId := r.Header.Get("X-Goog-Resource-ID")
	state := r.Header.Get("X-Goog-Resource-State")

	watchToken, _ := p.API.KVGet(userId + "watchToken")
	channelByte, _ := p.API.KVGet(userId + "watchChannel")
	var channel calendar.Channel
	json.Unmarshal(channelByte, &channel)

	if string(watchToken) == channelId && state == "exists" {
		p.CalendarSync(userId)
	} else {
		srv, _ := p.getCalendarService(userId)
		srv.Channels.Stop(&calendar.Channel{
			Id:         channelId,
			ResourceId: resourceId,
		})
	}
}

func (p *Plugin) test(w http.ResponseWriter, r *http.Request) {
	authedUserId := r.Header.Get("Mattermost-User-ID")
	p.StartCronJob(authedUserId)
}

func (p *Plugin) test2(w http.ResponseWriter, r *http.Request) {
	authedUserId := r.Header.Get("Mattermost-User-ID")
	p.CalendarSync(authedUserId)
}
