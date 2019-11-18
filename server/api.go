package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/mattermost/mattermost-server/model"
	"golang.org/x/oauth2"

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
	case "/test":
		p.test(w, r)
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

	p.API.KVSet(state, []byte(state))

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
		fmt.Println(err.Error())
		http.Error(w, "missing stored state", http.StatusBadRequest)
		return
	} else if string(storedState) != state {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}
	p.API.KVDelete(state)
	token, _ := config.Exchange(context.Background(), string(code))
	tokenJson, marshalErr := json.Marshal(token)
	if marshalErr != nil {
		http.Error(w, "invalid token to json marshal", http.StatusBadRequest)
		return
	}
	p.API.KVSet(userId+"calendarToken", tokenJson)

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
	p.CreateBotDMPost(userId, fmt.Sprintf("Success! Event %s has been deleted.", eventToBeDeleted.Summary))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)

}

func (p *Plugin) test(w http.ResponseWriter, r *http.Request) {
	param1 := r.URL.Query().Get("evtid")
	param2 := r.URL.Query().Get("calid")

	fmt.Fprint(w, fmt.Sprintf("%v %v", param1, param2))
}
