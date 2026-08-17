package main

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInsecureTLSConfig(t *testing.T) {
	cfg := insecureTLSConfig()
	if cfg == nil || !cfg.InsecureSkipVerify {
		t.Fatalf("expected InsecureSkipVerify, got %#v", cfg)
	}
	if cfg.MinVersion != tls.VersionTLS12 {
		t.Fatalf("MinVersion = %d", cfg.MinVersion)
	}
}

func TestDoHTTPNetworkErrorReturnsExchange(t *testing.T) {
	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: "http://127.0.0.1:1/", Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v, want nil so UI can render the exchange", err)
	}
	if ex == nil || ex.Error == "" {
		t.Fatalf("expected exchange with Error set, got %#v", ex)
	}
	if ex.Method != http.MethodGet {
		t.Fatalf("method = %q", ex.Method)
	}
}

func TestDoHTTPMissingClientReturnsExchange(t *testing.T) {
	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: "http://example.com", Method: "GET"}, nil, "")
	if err != nil {
		t.Fatalf("doHTTP err = %v, want nil", err)
	}
	if ex == nil || ex.Error == "" {
		t.Fatalf("expected exchange with Error set, got %#v", ex)
	}
}

func TestDoHTTPSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v", err)
	}
	if ex.Error != "" {
		t.Fatalf("unexpected Error %q", ex.Error)
	}
	if ex.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", ex.StatusCode)
	}
	if !strings.Contains(ex.ResBody, "ok") {
		t.Fatalf("body = %q", ex.ResBody)
	}
}

func TestHTTPDoerAcceptsSelfSigned(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v", err)
	}
	if ex.Error != "" {
		t.Fatalf("self-signed rejected: %s", ex.Error)
	}
	if ex.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", ex.StatusCode)
	}
}

func TestCookieJarReusesSetCookie(t *testing.T) {
	var secondCookie string
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		if n == 1 {
			http.SetCookie(w, &http.Cookie{Name: "sid", Value: "abc"})
			_, _ = io.WriteString(w, "set")
			return
		}
		secondCookie = r.Header.Get("Cookie")
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	doer := newHTTPDoer()
	if _, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/", Method: "GET"}, doer, ""); err != nil {
		t.Fatal(err)
	}
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/", Method: "GET"}, doer, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(secondCookie, "sid=abc") {
		t.Fatalf("second request cookie = %q", secondCookie)
	}
	if !strings.Contains(ex.ReqHeaders["Cookie"], "sid=abc") {
		t.Fatalf("logged Cookie = %#v", ex.ReqHeaders)
	}
}

func TestHTTPRedirectFollowToggle(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/go", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dest", http.StatusFound)
	})
	mux.HandleFunc("/dest", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "arrived")
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	doer := newHTTPDoer()
	stop, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/go", Method: "GET"}, httpDoerFor(doer, true), "")
	if err != nil {
		t.Fatal(err)
	}
	if stop.StatusCode != http.StatusFound {
		t.Fatalf("no-follow status = %d", stop.StatusCode)
	}
	follow, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/go", Method: "GET"}, httpDoerFor(doer, false), "")
	if err != nil {
		t.Fatal(err)
	}
	if follow.StatusCode != http.StatusOK || !strings.Contains(follow.ResBody, "arrived") {
		t.Fatalf("follow got %d %q", follow.StatusCode, follow.ResBody)
	}
}
