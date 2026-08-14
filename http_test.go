package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHTTPRoundTrip(t *testing.T) {
	var gotMethod, gotBody, gotCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotCT = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)

	app := &App{baseDir: t.TempDir()}
	c := newWSClient(app)
	t.Cleanup(c.Disconnect)
	ex, err := c.RequestHTTP(ConnectOptions{URL: srv.URL + "/item", Method: "POST"}, `{"name":"n"}`)
	if err != nil {
		t.Fatal(err)
	}
	if ex == nil || ex.StatusCode != http.StatusCreated {
		t.Fatalf("exchange=%+v", ex)
	}
	if st := c.Status(); st.Kind != kindHTTP {
		t.Fatalf("status=%+v", st)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method=%s", gotMethod)
	}
	if gotBody != `{"name":"n"}` {
		t.Fatalf("body=%q", gotBody)
	}
	if !strings.Contains(gotCT, "application/json") {
		t.Fatalf("content-type=%q", gotCT)
	}
	msgs := c.Messages(0, 50)
	var sawIn bool
	for _, m := range msgs {
		if m.Dir == "sys" && strings.Contains(m.Text, "ms") && strings.Contains(m.Text, "http") {
			t.Fatalf("status note should not be recorded: %q", m.Text)
		}
		if m.Dir == "in" && strings.Contains(m.Text, `"ok":true`) {
			sawIn = true
		}
	}
	if !sawIn {
		t.Fatalf("missing response in messages: %+v", msgs)
	}
	var sawOutEx bool
	for _, m := range msgs {
		if m.Dir == "out" && m.Exchange != nil && m.Exchange.Method == http.MethodPost && m.Exchange.ReqBody == `{"name":"n"}` {
			sawOutEx = true
		}
	}
	if !sawOutEx {
		t.Fatalf("missing exchange on out message: %+v", msgs)
	}
	var sawEx bool
	for _, m := range msgs {
		if m.Dir == "in" && m.Exchange != nil && m.Exchange.StatusCode == http.StatusCreated && m.Exchange.ResBody == `{"ok":true}` {
			sawEx = true
		}
	}
	if !sawEx {
		t.Fatalf("missing exchange on in message: %+v", msgs)
	}
}

func TestHTTPSGet(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method=%s", r.Method)
		}
		if r.ContentLength > 0 {
			t.Error("GET should not send a body")
		}
		_, _ = w.Write([]byte(`{"pong":1}`))
	}))
	t.Cleanup(srv.Close)

	app := &App{baseDir: t.TempDir()}
	c := newWSClient(app)
	t.Cleanup(c.Disconnect)
	ex, err := c.RequestHTTP(ConnectOptions{
		URL:     srv.URL + "/ping",
		Method:  "GET",
		Headers: map[string]string{"Authorization": "Bearer t"},
	}, `{"ignored":true}`)
	if err != nil {
		t.Fatal(err)
	}
	if ex == nil || ex.StatusCode != http.StatusOK {
		t.Fatalf("exchange=%+v", ex)
	}
	if ex.ReqHeaders["Authorization"] != "Bearer t" {
		t.Fatalf("req headers=%v", ex.ReqHeaders)
	}
	msgs := c.Messages(0, 50)
	var sawIn, sawOutGET bool
	for _, m := range msgs {
		if m.Dir == "in" && strings.Contains(m.Text, `"pong"`) {
			sawIn = true
		}
		if m.Dir == "out" && strings.HasPrefix(m.Text, "GET ") {
			sawOutGET = true
		}
	}
	if !sawIn || !sawOutGET {
		t.Fatalf("msgs=%+v", msgs)
	}
}

func TestRejectUnknownScheme(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if err := c.Connect(ConnectOptions{URL: "ftp://example.com"}); err == nil {
		t.Fatal("expected error")
	}
}

func TestHTTPOutMessageCarriesExchange(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	url := srv.URL + "/item?q=1"
	if _, err := c.RequestHTTP(ConnectOptions{
		URL:     url,
		Method:  "PUT",
		Headers: map[string]string{"X-Trace": "t1", "Authorization": "Bearer tok"},
	}, `{"v":2}`); err != nil {
		t.Fatal(err)
	}
	var out *Msg
	for _, m := range c.Messages(0, 50) {
		if m.Dir == "out" {
			out = &m
			break
		}
	}
	if out == nil || out.Exchange == nil {
		t.Fatalf("out=%+v", out)
	}
	ex := out.Exchange
	if ex.Method != http.MethodPut || ex.URL != url || ex.ReqBody != `{"v":2}` {
		t.Fatalf("exchange=%+v", ex)
	}
	if ex.ReqHeaders["X-Trace"] != "t1" || ex.ReqHeaders["Authorization"] != "Bearer tok" {
		t.Fatalf("headers=%v", ex.ReqHeaders)
	}
	if ex.StatusCode != http.StatusNoContent {
		t.Fatalf("live out should share completed exchange, status=%d", ex.StatusCode)
	}
}

func TestHTTPDoesNotConnect(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if err := c.Connect(ConnectOptions{URL: "https://example.com/api"}); err == nil {
		t.Fatal("expected connect to be rejected for http")
	}
}

func TestRecordHTTP(t *testing.T) {
	dir := t.TempDir()
	app := &App{baseDir: dir}
	c := newWSClient(app)
	t.Cleanup(c.Disconnect)

	got, err := c.RecordHTTP(HTTPExchange{
		Method:     "post",
		URL:        "https://api.example.com/v1/item",
		ReqBody:    `{"name":"n"}`,
		ReqHeaders: map[string]string{"Content-Type": "application/json"},
		ResBody:    `{"id":1}`,
		ResHeaders: map[string]string{"Content-Type": "application/json"},
		StatusCode: 201,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || !got.Manual || got.StatusCode != 201 || got.Status != "201 Created" {
		t.Fatalf("exchange=%+v", got)
	}
	if got.Method != http.MethodPost {
		t.Fatalf("method=%s", got.Method)
	}
	if st := c.Status(); st.Kind != kindHTTP || st.URL != "https://api.example.com/v1/item" {
		t.Fatalf("status=%+v", st)
	}

	msgs := c.Messages(0, 50)
	var sawOut, sawIn bool
	for _, m := range msgs {
		if m.Dir == "out" && strings.Contains(m.Text, `"name":"n"`) && m.Exchange != nil && m.Exchange.Manual {
			sawOut = true
		}
		if m.Dir == "in" && strings.Contains(m.Text, `"id":1`) && m.Exchange != nil && m.Exchange.StatusCode == 201 {
			sawIn = true
		}
		if m.Dir == "sys" && (strings.Contains(m.Text, "recorded") || (strings.Contains(m.Text, "http") && strings.Contains(m.Text, "ms"))) {
			t.Fatalf("http status/recorded note should not be recorded: %q", m.Text)
		}
	}
	if !sawOut || !sawIn {
		t.Fatalf("msgs=%+v", msgs)
	}

	entries, err := os.ReadDir(app.requestsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("expected a daily log file")
	}
	detail, err := loadSessionFile(filepath.Join(app.requestsDir(), entries[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	var loaded *HTTPExchange
	for _, m := range detail.Messages {
		if m.Exchange != nil && m.Dir == "in" {
			loaded = m.Exchange
		}
	}
	if loaded == nil || !loaded.Manual || loaded.ResBody != `{"id":1}` || loaded.ReqBody != `{"name":"n"}` {
		t.Fatalf("loaded exchange=%+v", loaded)
	}
}

func TestRecordHTTPDoesNotDropLive(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	c.wantOpen.Store(true)
	if _, err := c.RecordHTTP(HTTPExchange{URL: "http://10.0.0.1/ping"}); err != nil {
		t.Fatal(err)
	}
	if !c.wantOpen.Load() {
		t.Fatal("record http should not drop a live websocket")
	}
}

func TestRecordHTTPDefaultsStatus(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	got, err := c.RecordHTTP(HTTPExchange{URL: "http://10.0.0.1/ping"})
	if err != nil {
		t.Fatal(err)
	}
	if got.StatusCode != 200 || got.Status != "200 OK" || got.Method != http.MethodGet {
		t.Fatalf("exchange=%+v", got)
	}
}

func TestRecordHTTPRequiresURL(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if _, err := c.RecordHTTP(HTTPExchange{}); err == nil {
		t.Fatal("expected error")
	}
}

func TestRecordHTTPRejectsWS(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	if _, err := c.RecordHTTP(HTTPExchange{URL: "ws://example.com/ws"}); err == nil {
		t.Fatal("expected error")
	}
}

func TestHTTPStatusLine(t *testing.T) {
	code, status := httpStatusLine(0, "")
	if code != 200 || status != "200 OK" {
		t.Fatalf("default=%d %q", code, status)
	}
	code, status = httpStatusLine(404, "")
	if code != 404 || status != "404 Not Found" {
		t.Fatalf("404=%d %q", code, status)
	}
	code, status = httpStatusLine(201, "201 Created")
	if code != 201 || status != "201 Created" {
		t.Fatalf("keep=%d %q", code, status)
	}
}
