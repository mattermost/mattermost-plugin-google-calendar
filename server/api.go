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

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (p *Plugin) test(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, fmt.Sprintf("%+v", p.getConfiguration()))
}
