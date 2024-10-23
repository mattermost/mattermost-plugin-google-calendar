# Mattermost Google Calendar Plugin

[![Build status](https://github.com/mattermost/mattermost-plugin-google-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/mattermost/mattermost-plugin-google-calendar/actions/workflows/ci.yml)
[![Code Coverage](https://img.shields.io/codecov/c/github/mattermost/mattermost-plugin-google-calendar/master)](https://codecov.io/gh/mattermost/mattermost-plugin-google-calendar)
[![Release](https://img.shields.io/github/v/release/mattermost/mattermost-plugin-google-calendar)](https://github.com/mattermost/mattermost-plugin-google-calendar/releases/latest)
[![HW](https://img.shields.io/github/issues/mattermost/mattermost-plugin-google-calendar/Up%20For%20Grabs?color=dark%20green&label=Help%20Wanted)](https://github.com/mattermost/mattermost-plugin-google-calendar/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22Up+For+Grabs%22+label%3A%22Help+Wanted%22)

A Google Calendar plugin for Mattermost.

## Documentation

[About](docs/about.md) | [Set up](docs/setup.md) | [Configure](docs/configuration.md) | [Use](docs/usage.md)

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
2. When the build process finishes the plugin tarball will be available at `dist/com.mattermost.gcal-$(VERSION).tar.gz`
3. In your Mattermost Server, go to **System Console > Plugin Management** and upload the `.tar.gz` file to install the plugin.

## How to Release

To trigger a release, follow these steps:

1. **For Patch Release:** Run the following command:
    ```
    make patch
    ```
   This will release a patch change.

2. **For Minor Release:** Run the following command:
    ```
    make minor
    ```
   This will release a minor change.

3. **For Major Release:** Run the following command:
    ```
    make major
    ```
   This will release a major change.

4. **For Patch Release Candidate (RC):** Run the following command:
    ```
    make patch-rc
    ```
   This will release a patch release candidate.

5. **For Minor Release Candidate (RC):** Run the following command:
    ```
    make minor-rc
    ```
   This will release a minor release candidate.

6. **For Major Release Candidate (RC):** Run the following command:
    ```
    make major-rc
    ```
   This will release a major release candidate.

### Releasing new versions

The version of a plugin is determined at compile time, automatically populating a `version` field in the [plugin manifest](plugin.json):
* If the current commit matches a tag, the version will match after stripping any leading `v`, e.g. `1.3.1`.
* Otherwise, the version will combine the nearest tag with `git rev-parse --short HEAD`, e.g. `1.3.1+d06e53e1`.
* If there is no version tag, an empty version will be combined with the short hash, e.g. `0.0.0+76081421`.

To disable this behaviour, manually populate and maintain the `version` field.

## Acknowledgments

* [Hossein Ahmadian-Yazdi](https://github.com/hahmadia) for the previous version of the Google Calendar plugin:
    * Thanks to [Waseem18 Notification Plugin](https://github.com/waseem18/mattermost-plugin-google-calendar) for the code inspiration
    * Thanks to [Mattermost Github Plugin](https://github.com/mattermost/mattermost-plugin-github) for code structure
    * Created as a submission for Mattermost Hackathon 2019!!
