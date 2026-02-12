// Copyright (c) 2019-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package gcal

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/config"
	"github.com/mattermost/mattermost-plugin-mscalendar/calendar/utils/bot"
	"github.com/pkg/errors"
)

type client struct {
	// caching the context here since it's a "single-use" client, usually used
	// within a single API request
	ctx context.Context

	httpClient *http.Client

	conf *config.Config
	bot.Logger
}

func (c *client) CallJSON(method, url string, in, out any) (responseData []byte, err error) {
	contentType := "application/json"
	buf := &bytes.Buffer{}
	err = json.NewEncoder(buf).Encode(in)
	if err != nil {
		return nil, err
	}
	return c.call(method, url, contentType, buf, out)
}

func (c *client) CallFormPost(method, url string, in url.Values, out any) (responseData []byte, err error) {
	contentType := "application/x-www-form-urlencoded"
	buf := strings.NewReader(in.Encode())
	return c.call(method, url, contentType, buf, out)
}

func (c *client) call(method, callURL, contentType string, inBody io.Reader, out any) (responseData []byte, err error) {
	req, err := http.NewRequest(method, callURL, inBody)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Add("Content-Type", contentType)
	}

	if c.ctx != nil {
		req = req.WithContext(c.ctx)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.Body == nil {
		return nil, nil
	}
	defer func() { _ = resp.Body.Close() }()

	responseData, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated:
		if out != nil {
			err = json.Unmarshal(responseData, out)
			if err != nil {
				return responseData, err
			}
		}
		return responseData, nil

	case http.StatusNoContent:
		return nil, nil
	}

	return responseData, errors.WithMessagef(err, "status: %s", resp.Status)
}
