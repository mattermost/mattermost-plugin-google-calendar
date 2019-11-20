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

	srv, errString := p.getCalendarService(args.UserId)
	if srv == nil {
		p.postCommandResponse(args, errString)
		return &model.CommandResponse{}, nil
	}

	primaryCalendar, _ := srv.Calendars.Get("primary").Do()
	timezone := primaryCalendar.TimeZone
	location, _ := time.LoadLocation(timezone)

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
				startTime, _ = time.Parse(time.RFC3339, item.Start.DateTime)
				endTime, _ := time.Parse(time.RFC3339, item.End.DateTime)
				if date != startTime.Format(dateFormat) {
					date = startTime.Format(dateFormat)

					currentTime := time.Now().In(location).Format(dateFormat)
					tomorrowTime := time.Now().AddDate(0, 0, 1).In(location).Format(dateFormat)
					titleForEventsToDisplay := date
					if date == currentTime {
						titleForEventsToDisplay = fmt.Sprintf("Today (%s)", date)
					} else if date == tomorrowTime {
						titleForEventsToDisplay = fmt.Sprintf("Tomorrow (%s)", date)
					}
					text += fmt.Sprintf("### %v\n", titleForEventsToDisplay)
				}
				timeToDisplay := fmt.Sprintf("%v to %v", startTime.Format(timeFormat), endTime.Format(timeFormat))
				if startTime.Format(timeFormat) == "12:00 AM UTC" && endTime.Format(timeFormat) == "12:00 AM UTC" {
					timeToDisplay = "All-day"
				}
				text += fmt.Sprintf("- [%v](%s) @ %s | [Delete Event](%s/plugins/calendar/delete?evtid=%s&calid=%s)\n",
					item.Summary, item.HtmlLink, timeToDisplay, *config.ServiceSettings.SiteURL, item.Id, primaryCalendar.Id)
			}
			p.postCommandResponse(args, text)
		}
	}

	if action == "summary" {
		date := time.Now().In(location)
		dateToDisplay := "Today"
		titleToDisplay := "Today's"
		if len(split) == 3 {
			if split[2] == "tomorrow" {
				date = time.Now().AddDate(0, 0, 1).In(location)
				dateToDisplay = "Tomorrow"
				titleToDisplay = "Tomorrow's"
			} else {
				date, _ = time.ParseInLocation(customFormatNoTime, split[2], location)
				dateToDisplay = date.Format(dateFormat)
				titleToDisplay = dateToDisplay
			}
		}
		beginOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, location).Format(time.RFC3339)
		endOfDay := time.Date(date.Year(), date.Month(), date.Day(), 23, 59, 59, 0, location).Format(time.RFC3339)

		events, err := srv.Events.List("primary").ShowDeleted(false).
			SingleEvents(true).TimeMin(beginOfDay).TimeMax(endOfDay).OrderBy("startTime").Do()
		if err != nil {
			p.postCommandResponse(args, "Error retrieiving events")
			return &model.CommandResponse{}, nil
		}

		if len(events.Items) == 0 {
			p.CreateBotDMPost(args.UserId, "It seems that you don't have any events happening.")
			return &model.CommandResponse{}, nil
		} else {
			text := fmt.Sprintf("#### %s Schedule:\n", titleToDisplay)
			for _, item := range events.Items {
				text += fmt.Sprintf("**[%v](%s)**\n", item.Summary, item.HtmlLink)

				startTime, _ := time.Parse(time.RFC3339, item.Start.DateTime)
				endTime, _ := time.Parse(time.RFC3339, item.End.DateTime)

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
				text += fmt.Sprintf("**Status of Event**: %s\n\n", strings.Title(item.Status))

			}
			p.CreateBotDMPost(args.UserId, text)
		}
	}

	if action == "create" {
		r, _ := regexp.Compile("\"(.*?)\"")

		matchedString := r.FindString(args.Command)
		newCommand := strings.Replace(args.Command, matchedString, "", -1)
		split = strings.Fields(newCommand)
		matchedString = matchedString[1 : len(matchedString)-1]

		startTime, _ := time.ParseInLocation(customFormat, split[2], location)
		endTime, _ := time.ParseInLocation(customFormat, split[3], location)

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
		p.CreateBotDMPost(args.UserId, fmt.Sprintf("Success! Event _[%s](%s)_ on %v has been created.",
			createdEvent.Summary, createdEvent.HtmlLink, startTime.Format(dateFormat)))
	}

	return &model.CommandResponse{}, nil
}
