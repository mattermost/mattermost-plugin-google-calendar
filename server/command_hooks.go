package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/model"
	"github.com/mattermost/mattermost-server/plugin"
	"google.golang.org/api/calendar/v3"
)

const dateFormat = "Monday, January 2, 2006"
const timeFormat = "3:04 PM MST"
const customFormat = "2006-01-02@15:04"
const customFormatNoTime = "2006-01-02"
const COMMAND_HELP = `* |/calendar connect| - Connect your Google Calendar with your Mattermost account
* |/calendar list [number_of_events]| - List the upcoming X number of events.
	* |number_of_events| should be a number or can be left blank. By default is set to 5
* |/calendar summary [date]| - Get a break down of a particular date.
	* |date| should be a date in the format of YYYY-MM-DD or can be "tomorrow" or can be left blank. By default retrieves todays summary breakdown
* |/calendar create "[title_of_event]" [start_datetime] [end_datetime]| - Create a event with a title and start date-time and end date-time
	* |title_of_event| can be any title you like for the event. It **MUST** be placed within quotes.
	* |start_datetime| This is the time the event starts. It should be a date and time in the format of YYYY-MM-DD@HH:MM in 24 hour time format. 
	* |end_datetime| This is the time the event ends. It should be a date and time in the format of YYYY-MM-DD@HH:MM in 24 hour time format.
`

func getCommand() *model.Command {
	return &model.Command{
		Trigger:          "calendar",
		DisplayName:      "Google Calendar",
		Description:      "Integration with Google Calendar",
		AutoComplete:     true,
		AutoCompleteDesc: "Available commands: connect, list, summary, create, help",
		AutoCompleteHint: "[command]",
	}
}

func (p *Plugin) postCommandResponse(args *model.CommandArgs, text string) {
	post := &model.Post{
		UserId:    p.botId,
		ChannelId: args.ChannelId,
		Message:   text,
	}
	_ = p.API.SendEphemeralPost(args.UserId, post)
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	userID := args.UserId
	split := strings.Fields(args.Command)
	command := split[0]
	action := ""
	config := p.API.GetConfig()

	if len(split) > 1 {
		action = split[1]
	}

	if command != "/calendar" {
		return &model.CommandResponse{}, nil
	}

	if action == "connect" {
		if config.ServiceSettings.SiteURL == nil {
			p.postCommandResponse(args, "Invalid SiteURL")
			return &model.CommandResponse{}, nil
		} else {
			p.postCommandResponse(args, fmt.Sprintf("[Click here to link your Google Calendar.](%s/plugins/calendar/oauth/connect)", *config.ServiceSettings.SiteURL))
			return &model.CommandResponse{}, nil
		}
	}

	srv, err := p.getCalendarService(args.UserId)
	if err != nil {
		p.postCommandResponse(args, err.Error())
		return &model.CommandResponse{}, nil
	}

	location := p.getPrimaryCalendarLocation(userID)

	switch action {
	case "list":
		return p.executeCommandList(args, split, srv, location, config)
	case "summary":
		return p.executeCommandSummary(args, split, srv, location, userID)
	case "create":
		return p.executeCommandCreate(args, split, srv, location)
	case "help":
		return p.executeCommandHelp(args)
	}

	return &model.CommandResponse{}, nil
}
