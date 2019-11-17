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
const customFormat = "2006-01-02T15:04"
const COMMAND_HELP = `* |/calendar connect| - Connect your Google Calendar with your Mattermost account`

func getCommand() *model.Command {
	return &model.Command{
		Trigger:          "calendar",
		DisplayName:      "Google Calendar",
		Description:      "Integration with Google Calendar",
		AutoComplete:     true,
		AutoCompleteDesc: "Available commands: connect",
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
	split := strings.Fields(args.Command)
	command := split[0]
	action := ""
	if len(split) > 1 {
		action = split[1]
	}

	if command != "/calendar" {
		return &model.CommandResponse{}, nil
	}

	if action == "connect" {
		config := p.API.GetConfig()
		if config.ServiceSettings.SiteURL == nil {
			p.postCommandResponse(args, "Invalid SiteURL")
			return &model.CommandResponse{}, nil
		} else {
			p.postCommandResponse(args, fmt.Sprintf("[Click here to link your Google Calendar.](%s/plugins/calendar/oauth/connect)", *config.ServiceSettings.SiteURL))
			return &model.CommandResponse{}, nil
		}
	}

	srv, errString := p.getCalendarService(args.UserId)
	if srv == nil {
		p.postCommandResponse(args, errString)
		return &model.CommandResponse{}, nil
	}

	if action == "list" {
		var maxResults int = 5
		var convErr error

		if len(split) == 3 {
			maxResults, convErr = strconv.Atoi(split[2])
		}

		if convErr != nil {
			p.postCommandResponse(args, "Incorrect Max Results parameter entered, will use default of 5")
			maxResults = 5
		}

		t := time.Now().Format(time.RFC3339)
		events, err := srv.Events.List("primary").ShowDeleted(false).
			SingleEvents(true).TimeMin(t).MaxResults(int64(maxResults)).OrderBy("startTime").Do()
		if err != nil {
			p.postCommandResponse(args, fmt.Sprintf("Unable to retrieve next %v of the user's events: %v", maxResults, err))
			return &model.CommandResponse{}, nil
		}

		if len(events.Items) == 0 {
			p.postCommandResponse(args, "No upcoming events")
			return &model.CommandResponse{}, nil
		} else {
			text := "# Upcoming Events: \n"
			var date string
			var startTime time.Time
			for _, item := range events.Items {
				tempTime, _ := time.Parse(time.RFC3339, item.Start.DateTime)
				if date != tempTime.Format(dateFormat) {
					startTime, _ = time.Parse(time.RFC3339, item.Start.DateTime)
					date = startTime.Format(dateFormat)
					text += fmt.Sprintf("### %v\n", date)
				}
				endTime, _ := time.Parse(time.RFC3339, item.End.DateTime)
				text += fmt.Sprintf("- %v @ %v to %v\n", item.Summary, startTime.Format(timeFormat), endTime.Format(timeFormat))
			}
			p.postCommandResponse(args, text)
		}
	}

	if action == "create" {
		primaryCalendar, _ := srv.Calendars.Get("primary").Do()
		timezone := primaryCalendar.TimeZone
		location, _ := time.LoadLocation(timezone)
		r, _ := regexp.Compile("\"(.*?)\"")

		matchedString := r.FindString(args.Command)
		newCommand := strings.Replace(args.Command, matchedString, "", -1)
		split = strings.Fields(newCommand)
		matchedString = matchedString[1 : len(matchedString)-1]

		startTime, _ := time.ParseInLocation("2006-01-02T15:04", split[2], location)
		endTime, _ := time.ParseInLocation("2006-01-02T15:04", split[3], location)

		newEvent := calendar.Event{
			Summary: matchedString,
			Start:   &calendar.EventDateTime{DateTime: startTime.Format(time.RFC3339)},
			End:     &calendar.EventDateTime{DateTime: endTime.Format(time.RFC3339)},
		}
		createdEvent, err := srv.Events.Insert("primary", &newEvent).Do()
		if err != nil {
			p.postCommandResponse(args, fmt.Sprintf("Failed to create calendar event. Error: %v", err))
			return &model.CommandResponse{}, nil
		}
		p.postCommandResponse(args, fmt.Sprintf("Success! Event \"%s\" starting %v has been created.", createdEvent.Summary, createdEvent.Start.DateTime))
	}

	return &model.CommandResponse{}, nil
}
