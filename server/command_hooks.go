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
	messageToPost := ""
	switch action {
	case "list":
		messageToPost = p.executeCommandList(args)
	case "summary":
		messageToPost = p.executeCommandSummary(args)
	case "create":
		messageToPost = p.executeCommandCreate(args)
	case "help":
		messageToPost = p.executeCommandHelp(args)
	}

	if messageToPost != "" {
		p.postCommandResponse(args, messageToPost)
	}

	return &model.CommandResponse{}, nil
}

func (p *Plugin) executeCommandList(args *model.CommandArgs) string {
	maxResults := 5
	split := strings.Fields(args.Command)
	userID := args.UserId
	location := p.getPrimaryCalendarLocation(userID)
	srv, err := p.getCalendarService(userID)
	if err != nil {
		return err.Error()
	}

	if len(split) == 3 {
		maxResults, err = strconv.Atoi(split[2])
	}

	if err != nil {
		p.postCommandResponse(args, "Incorrect Max Results parameter entered, will use default of 5")
		maxResults = 5
	}

	t := time.Now().Format(time.RFC3339)
	events, err := srv.Events.List("primary").ShowDeleted(false).
		SingleEvents(true).TimeMin(t).MaxResults(int64(maxResults)).OrderBy("startTime").Do()

	if err != nil {
		return fmt.Sprintf("Unable to retrieve next %v of the user's events: %v", maxResults, err)
	}

	if len(events.Items) == 0 {
		return "No upcoming events"
	}
	text := "# Upcoming Events: \n"
	var date string
	var startTime time.Time
	siteURL := *p.API.GetConfig().ServiceSettings.SiteURL
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
		text += fmt.Sprintf("- [%v](%s) @ %s | [Delete Event](%s/plugins/calendar/delete?evtid=%s)\n",
			item.Summary, item.HtmlLink, timeToDisplay, siteURL, item.Id)
	}
	p.CreateBotDMPost(userID, "It seems that you don't have any events happening.")
	return ""
}

func (p *Plugin) executeCommandSummary(args *model.CommandArgs) string {
	split := strings.Fields(args.Command)
	userID := args.UserId
	location := p.getPrimaryCalendarLocation(userID)
	srv, err := p.getCalendarService(userID)
	if err != nil {
		return err.Error()
	}

	date := time.Now().In(location)
	dateToDisplay := "Today"
	titleToDisplay := "Today's"
	if len(split) == 3 {
		date, _ = time.ParseInLocation(customFormatNoTime, split[2], location)
		dateToDisplay = date.Format(dateFormat)
		titleToDisplay = dateToDisplay
		if split[2] == "tomorrow" {
			date = time.Now().AddDate(0, 0, 1).In(location)
			dateToDisplay = "Tomorrow"
			titleToDisplay = "Tomorrow's"
		}
	}
	beginOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, location).Format(time.RFC3339)
	endOfDay := time.Date(date.Year(), date.Month(), date.Day(), 23, 59, 59, 0, location).Format(time.RFC3339)

	events, err := srv.Events.List("primary").ShowDeleted(false).
		SingleEvents(true).TimeMin(beginOfDay).TimeMax(endOfDay).OrderBy("startTime").Do()

	if err != nil {
		return "Error retrieiving events"
	}

	if len(events.Items) == 0 {
		return "It seems that you don't have any events happening."
	}
	text := fmt.Sprintf("#### %s Schedule:\n", titleToDisplay)
	for _, item := range events.Items {
		text += p.printEventSummary(userID, item)
	}
	p.CreateBotDMPost(userID, text)
	return ""

}

func (p *Plugin) executeCommandCreate(args *model.CommandArgs) string {
	split := strings.Fields(args.Command)
	userID := args.UserId
	location := p.getPrimaryCalendarLocation(userID)
	srv, err := p.getCalendarService(userID)
	if err != nil {
		return err.Error()
	}

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
		return fmt.Sprintf("Failed to create calendar event. Error: %v", err)
	}
	p.CreateBotDMPost(args.UserId, fmt.Sprintf("Success! Event _[%s](%s)_ on %v has been created.",
		createdEvent.Summary, createdEvent.HtmlLink, startTime.Format(dateFormat)))
	return ""
}

func (p *Plugin) executeCommandHelp(args *model.CommandArgs) string {
	return "###### Mattermost Google Calendar Plugin - Slash Command Help\n" + strings.Replace(COMMAND_HELP, "|", "`", -1)
}
