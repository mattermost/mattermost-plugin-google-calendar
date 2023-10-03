# Include custom targets and environment variables here

# If there's no MM_RUDDER_PLUGINS_PROD, add DEV data
RUDDER_WRITE_KEY = 1d5bMvdrfWClLxgK1FvV3s4U1tg
ifdef MM_RUDDER_PLUGINS_PROD
	RUDDER_WRITE_KEY = $(MM_RUDDER_PLUGINS_PROD)
endif
LDFLAGS += -X "github.com/mattermost/mattermost-plugin-mscalendar/server/telemetry.rudderWriteKey=$(RUDDER_WRITE_KEY)"

# Build info
BUILD_DATE = $(shell date -u)
BUILD_HASH = $(shell git rev-parse HEAD)
BUILD_HASH_SHORT = $(shell git rev-parse --short HEAD)
LDFLAGS += -X "main.BuildDate=$(BUILD_DATE)"
LDFLAGS += -X "main.BuildHash=$(BUILD_HASH)"
LDFLAGS += -X "main.BuildHashShort=$(BUILD_HASH_SHORT)"

GO_BUILD_FLAGS = -ldflags '$(LDFLAGS)'

# Generates mock golang interfaces for testing
mock:
ifneq ($(HAS_SERVER),)
	go install github.com/golang/mock/mockgen@v1.6.0
	@echo nothing to do
endif

clean_mock:
ifneq ($(HAS_SERVER),)
endif
