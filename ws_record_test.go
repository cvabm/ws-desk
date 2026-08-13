package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecordWS(t *testing.T) {
	dir := t.TempDir()
	app := &App{baseDir: dir}
	c := newWSClient(app)
	t.Cleanup(c.Disconnect)

	got, err := c.RecordWS(ConnectOptions{
		URL:      "wss://api.example.com/ws",
		Protocol: "venus",
	}, `{"cmd":"ping"}`, `{"ok":true}`)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || !got.Manual || got.Out != `{"cmd":"ping"}` || got.In != `{"ok":true}` {
		t.Fatalf("record=%+v", got)
	}
	if got.URL != "wss://api.example.com/ws" || got.Protocol != "venus" {
		t.Fatalf("record=%+v", got)
	}

	msgs := c.Messages(0, 50)
	var sawOut, sawIn, sawSys bool
	for _, m := range msgs {
		if m.Dir == "out" && strings.Contains(m.Text, `"cmd":"ping"`) && m.WS != nil && m.WS.Manual {
			sawOut = true
		}
		if m.Dir == "in" && strings.Contains(m.Text, `"ok":true`) && m.WS != nil && m.WS.In == `{"ok":true}` {
			sawIn = true
		}
		if m.Dir == "sys" && strings.Contains(m.Text, "recorded  ws") {
			sawSys = true
		}
	}
	if !sawOut || !sawIn || !sawSys {
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
	var loaded *WSRecord
	for _, m := range detail.Messages {
		if m.WS != nil && m.Dir == "in" {
			loaded = m.WS
		}
	}
	if loaded == nil || !loaded.Manual || loaded.Out != `{"cmd":"ping"}` {
		t.Fatalf("loaded=%+v", loaded)
	}
}

func TestRecordWSOnlyOut(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	got, err := c.RecordWS(ConnectOptions{URL: "ws://10.0.0.1/ws"}, `{"a":1}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if got.In != "" || got.Out != `{"a":1}` {
		t.Fatalf("record=%+v", got)
	}
	for _, m := range c.Messages(0, 50) {
		if m.Dir == "in" {
			t.Fatalf("unexpected in: %+v", m)
		}
	}
}

func TestRecordWSRequiresText(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if _, err := c.RecordWS(ConnectOptions{URL: "ws://example.com/ws"}, "  ", ""); err == nil {
		t.Fatal("expected error")
	}
}

func TestRecordWSRejectsHTTP(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if _, err := c.RecordWS(ConnectOptions{URL: "https://example.com/api"}, `{}`, `{}`); err == nil {
		t.Fatal("expected error")
	}
}

func TestRecordWSDoesNotDropLive(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)
	c.wantOpen.Store(true)
	if _, err := c.RecordWS(ConnectOptions{URL: "ws://example.com/ws"}, `{"x":1}`, `{"y":2}`); err != nil {
		t.Fatal(err)
	}
	if !c.wantOpen.Load() {
		t.Fatal("record should not drop a live websocket")
	}
}
