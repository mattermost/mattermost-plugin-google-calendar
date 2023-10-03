package gcal

import (
	"github.com/mattermost/mattermost-plugin-mscalendar/server/config"
)

const (
	ProviderGCal            = "gcal"
	ProviderGCalDisplayName = "Google Calendar"
	ProviderGCalRepository  = "https://github.com/mattermost/mattermost-plugin-google-calendar"
)

func GetGcalProviderConfig() config.ProviderConfig {
	return config.ProviderConfig{
		Name:        ProviderGCal,
		DisplayName: ProviderGCalDisplayName,
		Repository:  ProviderGCalRepository,

		CommandTrigger: ProviderGCal,

		TelemetryShortName: ProviderGCal,

		BotUsername:    ProviderGCal,
		BotDisplayName: ProviderGCalDisplayName,
		Features: config.ProviderFeatures{
			EncryptedStore:     true,
			EventNotifications: false,
		},
	}
}
