package main

import (
	mattermostplugin "github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost-plugin-google-calendar/gcal"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/config"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/engine"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/plugin"
)

var BuildHash string
var BuildHashShort string
var BuildDate string
var CalendarProvider string

func main() {
	config.Provider = gcal.GetGcalProviderConfig()

	mattermostplugin.ClientMain(
		plugin.NewWithEnv(
			engine.Env{
				Config: &config.Config{
					PluginID:       manifest.Id,
					PluginVersion:  manifest.Version,
					BuildHash:      BuildHash,
					BuildHashShort: BuildHashShort,
					BuildDate:      BuildDate,
					Provider:       config.Provider,
				},
				Dependencies: &engine.Dependencies{},
			}))
}
