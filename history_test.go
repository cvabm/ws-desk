package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadSessionFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ws-2026-07-23.jsonl")
	content := `{"v":1,"kind":"meta","event":"session_start","url":"ws://example/test","protocol":"venus","session":"100001","day":"2026-07-23"}
{"v":1,"kind":"msg","ts":"2026-07-23 10:00:01.000","id":1,"dir":"out","bytes":15,"text":"{\"cmd\":\"ping\"}","pretty":"{\n  \"cmd\": \"ping\"\n}"}
{"v":1,"kind":"msg","ts":"2026-07-23 10:00:01.050","id":2,"dir":"in","bytes":12,"text":"{\"ok\":true}"}
{"v":1,"kind":"sys","ts":"2026-07-23 10:00:02.000","event":"session_end","detail":""}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := loadSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if d.URL != "ws://example/test" {
		t.Fatalf("url=%q", d.URL)
	}
	if d.Protocol != "venus" {
		t.Fatalf("protocol=%q", d.Protocol)
	}
	if d.Info.Day != "2026-07-23" {
		t.Fatalf("day=%q", d.Info.Day)
	}
	// meta session_start + 2 msg + session_end
	if len(d.Messages) != 4 {
		t.Fatalf("msgs=%d %+v", len(d.Messages), d.Messages)
	}
}

func TestLoadSessionExchange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ws-2026-08-13-api.example.com.jsonl")
	content := `{"v":1,"kind":"meta","event":"session_start","url":"https://api.example.com/v1","protocol":"POST","session":"120000","day":"2026-08-13","host":"api.example.com"}
{"v":1,"kind":"msg","ts":"2026-08-13 12:00:00.000","id":1,"dir":"in","bytes":8,"text":"{\"id\":1}","exchange":{"method":"POST","url":"https://api.example.com/v1","status":"201 Created","statusCode":201,"reqBody":"{\"name\":\"n\"}","resBody":"{\"id\":1}","manual":true}}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := loadSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ex *HTTPExchange
	for _, m := range d.Messages {
		if m.Exchange != nil {
			ex = m.Exchange
		}
	}
	if ex == nil || !ex.Manual || ex.StatusCode != 201 || ex.ReqBody != `{"name":"n"}` {
		t.Fatalf("exchange=%+v msgs=%+v", ex, d.Messages)
	}
}

func TestLoadSessionWS(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ws-2026-08-13-api.example.com.jsonl")
	content := `{"v":1,"kind":"meta","event":"session_start","url":"wss://api.example.com/ws","protocol":"ws","session":"120000","day":"2026-08-13","host":"api.example.com"}
{"v":1,"kind":"msg","ts":"2026-08-13 12:00:00.000","id":1,"dir":"out","bytes":15,"text":"{\"cmd\":\"ping\"}","ws":{"url":"wss://api.example.com/ws","out":"{\"cmd\":\"ping\"}","in":"{\"ok\":true}","manual":true}}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := loadSessionFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var rec *WSRecord
	for _, m := range d.Messages {
		if m.WS != nil {
			rec = m.WS
		}
	}
	if rec == nil || !rec.Manual || rec.Out != `{"cmd":"ping"}` || rec.In != `{"ok":true}` {
		t.Fatalf("ws=%+v msgs=%+v", rec, d.Messages)
	}
}

func TestDayFromLogName(t *testing.T) {
	if dayFromLogName("ws-2026-07-23.jsonl") != "2026-07-23" {
		t.Fatal("daily name")
	}
	if dayFromLogName("session-20260723-100000.jsonl") != "" {
		t.Fatal("legacy should have empty day")
	}
}

func TestDailyLogPath(t *testing.T) {
	loc := beijingLocation()
	tm, err := time.ParseInLocation("2006-01-02 15:04:05", "2026-07-23 12:00:00", loc)
	if err != nil {
		t.Fatal(err)
	}
	day, path := dailyLogPath(filepath.Join("tmp", "logs"), tm, "")
	if day != "2026-07-23" {
		t.Fatalf("day=%s", day)
	}
	if filepath.Base(path) != "ws-2026-07-23.jsonl" {
		t.Fatalf("path=%s", path)
	}
	_, path = dailyLogPath(filepath.Join("tmp", "logs"), tm, "192.0.2.11")
	if filepath.Base(path) != "ws-2026-07-23-192.0.2.11.jsonl" {
		t.Fatalf("host path=%s", path)
	}
}

func TestParseLogName(t *testing.T) {
	day, host := parseLogName("ws-2026-07-23-192.0.2.11.jsonl")
	if day != "2026-07-23" || host != "192.0.2.11" {
		t.Fatalf("got day=%q host=%q", day, host)
	}
	day, host = parseLogName("ws-2026-07-23-api.example.com.jsonl")
	if day != "2026-07-23" || host != "api.example.com" {
		t.Fatalf("got day=%q host=%q", day, host)
	}
	day, host = parseLogName("ws-2026-07-23.jsonl")
	if day != "2026-07-23" || host != "" {
		t.Fatalf("legacy day=%q host=%q", day, host)
	}
}
