package main

import (
	"io/ioutil"
	"path/filepath"
	"sync"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-server/v5/plugin"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	botID string
}

//OnActivate function ensures what bot does when become actived
func (p *Plugin) OnActivate() error {
	command, err := p.getCommand()

	if err != nil {
		return errors.Wrap(err, "failed to get command")
	}
	p.API.RegisterCommand(command)

	botID, err := p.Helpers.EnsureBot(&model.Bot{
		Username:    "google.calendar",
		DisplayName: "Google Calendar",
		Description: "Created by the Google Calendar plugin.",
	})
	if err != nil {
		return errors.Wrap(err, "failed to ensure google calendar bot")
	}
	p.botID = botID
	p.API.KVSet(plugin.BotUserKey, []byte(botID))

	bundlePath, err := p.API.GetBundlePath()
	if err != nil {
		return errors.Wrap(err, "couldn't get bundle path")
	}

	profileImage, err := ioutil.ReadFile(filepath.Join(bundlePath, "assets", "profile.png"))
	if err != nil {
		return errors.Wrap(err, "couldn't read profile image")
	}

	appErr := p.API.SetProfileImage(botID, profileImage)
	if appErr != nil {
		return errors.Wrap(appErr, "couldn't set profile image")
	}

	return nil
}
