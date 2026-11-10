# Include custom targets and environment variables here

# If there's no MM_RUDDER_PLUGINS_PROD, add DEV data
RUDDER_WRITE_KEY = 1d5bMvdrfWClLxgK1FvV3s4U1tg
ifdef MM_RUDDER_PLUGINS_PROD
	RUDDER_WRITE_KEY = $(MM_RUDDER_PLUGINS_PROD)
endif
LDFLAGS += -X "github.com/mattermost/mattermost-plugin-google-calendar/server/telemetry.rudderWriteKey=$(RUDDER_WRITE_KEY)"

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

# E2E suite (e2e/playwright/). Layout follows mattermost-plugin-mscalendar's e2e targets.
E2E_DIR = e2e/playwright
# fake (default): the fake Google in e2e/playwright/fake-google answers for Google's hosts. real: the stack
# runs without the fake and Mattermost reaches real Google (needs e2e/playwright/.env.local, see .env.example).
E2E_GOOGLE ?= fake
ifeq ($(E2E_GOOGLE),real)
E2E_COMPOSE = MM_SSL_CERT_FILE= docker compose
else
E2E_COMPOSE = docker compose --profile fake
endif

$(E2E_DIR)/node_modules: $(E2E_DIR)/package.json $(E2E_DIR)/package-lock.json
	cd $(E2E_DIR) && npm ci && npx playwright install chromium
	touch $@

## Starts the disposable Mattermost (and, unless E2E_GOOGLE=real, the fake Google) for the E2E suite.
.PHONY: e2e-env-up
e2e-env-up:
	cd $(E2E_DIR) && $(E2E_COMPOSE) up -d --wait

## Stops the E2E stack and wipes its data.
.PHONY: e2e-env-down
e2e-env-down:
	cd $(E2E_DIR) && docker compose --profile fake down -v

## Prints the E2E stack's container status and logs (CI collects these on failure).
.PHONY: e2e-env-logs
e2e-env-logs:
	cd $(E2E_DIR) && docker compose --profile fake ps -a && docker compose --profile fake logs --no-color

## Builds the plugin and runs the Playwright E2E suite against the stack from e2e-env-up.
.PHONY: e2e
e2e: dist $(E2E_DIR)/node_modules
ifeq ($(E2E_GOOGLE),real)
	cd $(E2E_DIR) && npm run check && npm run test:real
else
	cd $(E2E_DIR) && npm run check && npm test
endif
