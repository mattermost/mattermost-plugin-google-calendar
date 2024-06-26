package gcal

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/pkg/errors"
)

func (c *client) CallJSON(method, url string, in, out interface{}) (responseData []byte, err error) {
	contentType := "application/json"
	buf := &bytes.Buffer{}
	err = json.NewEncoder(buf).Encode(in)
	if err != nil {
		return nil, err
	}
	return c.call(method, url, contentType, buf, out)
}

func (c *client) CallFormPost(method, url string, in url.Values, out interface{}) (responseData []byte, err error) {
	contentType := "application/x-www-form-urlencoded"
	buf := strings.NewReader(in.Encode())
	return c.call(method, url, contentType, buf, out)
}

func (c *client) call(method, callURL, contentType string, inBody io.Reader, out interface{}) (responseData []byte, err error) {
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
	defer resp.Body.Close()

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
