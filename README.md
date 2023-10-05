# Mattermost Google Calendar Plugin

[![Delivery Status](https://github.com/mattermost/mattermost-plugin-google-calendar/actions/workflows/cd.yml/badge.svg?branch=master)](https://github.com/mattermost/mattermost-plugin-google-calendar/actions/workflows/cd.yml)
[![Code Coverage](https://img.shields.io/codecov/c/github/mattermost/mattermost-plugin-google-calendar/master)](https://codecov.io/gh/mattermost/mattermost-plugin-google-calendar)
[![Release](https://img.shields.io/github/v/release/mattermost/mattermost-plugin-google-calendar)](https://github.com/mattermost/mattermost-plugin-google-calendar/releases/latest)
[![HW](https://img.shields.io/github/issues/mattermost/mattermost-plugin-google-calendar/Up%20For%20Grabs?color=dark%20green&label=Help%20Wanted)](https://github.com/mattermost/mattermost-plugin-google-calendar/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22Up+For+Grabs%22+label%3A%22Help+Wanted%22)

A Google Calendar plugin for Mattermost.

## Documentation

[About](https://docs.mattermost.com/about/mattermost-google-calendar-integration.html) | [Setup](https://docs.mattermost.com/about/setup-mattermost-google-calendar-plugin.html) | [Configuration settings](https://docs.mattermost.com/configure/plugins-configuration-settings.html#google-calendar) | [Usage](https://docs.mattermost.com/collaborate/use-mattermost-google-calendar-plugin.html)

## Features

- Receive a daily summary at a specific time
- Receive event reminders 5 minutes before a meeting via direct message
- Create events directly from a channel, optionally linking them to a channel for reminders
- Receive event remidners 5 minutes before a meeting via message post
- Automatically set an user status (away, DND) during meetings
- View your today or tomorrow's agenda with a slash command
- Easily configurable settings using an attachment interface

## Contribute

### Requirements

- [golang](https://golang.org/doc/install)
- [golangci-lint](https://golangci-lint.run/usage/install/)
- [npm](https://www.npmjs.com/get-npm)

### Build the plugin

1. Clone this repository.
1. Run `make dist`.
2. When the build process finishes the plugin tarball will be available at `dist/com.mattermost.google-calendar-$(VERSION).tar.gz`
3. In your Mattermost Server, go to **System Console > Plugin Management** and upload the `.tar.gz` file to install the plugin.


## Acknowledgments

* [Hossein Ahmadian-Yazdi](https://github.com/hahmadia) for the previous version of the Google Calendar plugin:
    * Thanks to [Waseem18 Notification Plugin](https://github.com/waseem18/mattermost-plugin-google-calendar) for the code inspiration
    * Thanks to [Mattermost Github Plugin](https://github.com/mattermost/mattermost-plugin-github) for code structure
    * Created as a submission for Mattermost Hackathon 2019!!
