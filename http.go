package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const (
	maxHTTPBody     = 2 << 20
	httpReqTimeout  = 30 * time.Second
	httpDialTimeout = 10 * time.Second
)

func newHTTPDoer() *http.Client {
	return &http.Client{
		Timeout: httpReqTimeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   httpDialTimeout,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          16,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true, // debug client: allow lab / self-signed certs
				MinVersion:         tls.VersionTLS12,
			},
		},
	}
}

func normalizeHTTPMethod(method, body string) string {
	m := strings.ToUpper(strings.TrimSpace(method))
	if m == "" {
		if strings.TrimSpace(body) == "" {
			return http.MethodGet
		}
		return http.MethodPost
	}
	return m
}

func methodOmitsBody(method string) bool {
	switch strings.ToUpper(method) {
	case http.MethodGet, http.MethodHead, http.MethodDelete, http.MethodOptions:
		return true
	default:
		return false
	}
}

func looksLikeJSON(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return false
	}
	return (t[0] == '{' && strings.HasSuffix(t, "}")) || (t[0] == '[' && strings.HasSuffix(t, "]"))
}

func applyHTTPHeaders(req *http.Request, headers map[string]string, body string) {
	for k, v := range headers {
		if k == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "ApiTester")
	}
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json, text/plain, */*")
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		if looksLikeJSON(body) {
			req.Header.Set("Content-Type", "application/json")
		} else {
			req.Header.Set("Content-Type", "text/plain; charset=utf-8")
		}
	}
}

func readHTTPBody(r io.Reader) (string, int64, bool, error) {
	limited := io.LimitReader(r, maxHTTPBody+1)
	b, err := io.ReadAll(limited)
	if err != nil {
		return "", 0, false, err
	}
	truncated := int64(len(b)) > maxHTTPBody
	if truncated {
		b = b[:maxHTTPBody]
	}
	return string(b), int64(len(b)), truncated, nil
}

func formatHTTPOut(method, rawURL, body string) string {
	if strings.TrimSpace(body) == "" {
		return method + " " + rawURL
	}
	return body
}

func formatHTTPIn(status string, body string, truncated bool) string {
	if strings.TrimSpace(body) == "" {
		return "HTTP " + status + " (empty body)"
	}
	if truncated {
		return body + fmt.Sprintf("\n\n… truncated at %d bytes", maxHTTPBody)
	}
	return body
}

func httpStatusLine(code int, status string) (int, string) {
	if code <= 0 {
		code = http.StatusOK
	}
	status = strings.TrimSpace(status)
	if status == "" {
		if t := http.StatusText(code); t != "" {
			status = fmt.Sprintf("%d %s", code, t)
		} else {
			status = fmt.Sprintf("%d", code)
		}
	}
	return code, status
}

func normalizeRecordedExchange(ex *HTTPExchange) {
	if ex.ReqHeaders == nil {
		ex.ReqHeaders = map[string]string{}
	}
	if ex.ResHeaders == nil {
		ex.ResHeaders = map[string]string{}
	}
	ex.Method = normalizeHTTPMethod(ex.Method, ex.ReqBody)
	ex.StatusCode, ex.Status = httpStatusLine(ex.StatusCode, ex.Status)
	ex.Bytes = len(ex.ResBody)
	ex.Manual = true
	ex.Error = ""
}

func flattenHeader(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, vs := range h {
		out[k] = strings.Join(vs, ", ")
	}
	return out
}
