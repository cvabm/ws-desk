package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type sessionLogger struct {
	mu      sync.Mutex
	file    *os.File
	session string
	day     string
	path    string
}

func beijingLocation() *time.Location {
	return time.FixedZone("CST", 8*3600)
}

func beijingDate(t time.Time) string {
	return t.In(beijingLocation()).Format("2006-01-02")
}

// dailyLogPath returns ws-logs/ws-YYYY-MM-DD.jsonl (one file per calendar day, CST).
func dailyLogPath(logDir string, t time.Time) (day, path string) {
	day = beijingDate(t)
	path = filepath.Join(logDir, fmt.Sprintf("ws-%s.jsonl", day))
	return day, path
}

func newSessionLogger(logDir, url, protocol string) (*sessionLogger, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}
	now := time.Now()
	day, path := dailyLogPath(logDir, now)
	session := now.In(beijingLocation()).Format("150405")

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	l := &sessionLogger{file: f, session: session, day: day, path: path}
	_ = l.write(map[string]any{
		"v":        1,
		"kind":     "meta",
		"event":    "session_start",
		"ts":       now.In(beijingLocation()).Format(time.RFC3339Nano),
		"url":      url,
		"protocol": protocol,
		"session":  session,
		"day":      day,
	})
	return l, nil
}

func (l *sessionLogger) SessionID() string {
	if l == nil {
		return ""
	}
	// day + time, e.g. 2026-07-23/112053
	return l.day + "/" + l.session
}

func (l *sessionLogger) Path() string {
	if l == nil {
		return ""
	}
	return l.path
}

func (l *sessionLogger) WriteMsg(m Msg) {
	if l == nil {
		return
	}
	_ = l.write(map[string]any{
		"v":       1,
		"kind":    "msg",
		"ts":      m.Time,
		"id":      m.ID,
		"dir":     m.Dir,
		"bytes":   m.Bytes,
		"text":    m.Text,
		"pretty":  m.Pretty,
		"session": l.session,
		"day":     l.day,
	})
}

func (l *sessionLogger) WriteSys(event, detail string) {
	if l == nil {
		return
	}
	_ = l.write(map[string]any{
		"v":       1,
		"kind":    "sys",
		"ts":      beijingNow(),
		"event":   event,
		"detail":  detail,
		"session": l.session,
		"day":     l.day,
	})
}

func (l *sessionLogger) write(v any) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = l.file.Write(append(b, '\n'))
	return err
}

func (l *sessionLogger) Close() {
	if l == nil {
		return
	}
	l.WriteSys("session_end", "")
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
}

func beijingNow() string {
	return time.Now().In(beijingLocation()).Format("2006-01-02 15:04:05.000")
}

func prettyJSON(text string) string {
	var v any
	if err := json.Unmarshal([]byte(text), &v); err != nil {
		return text
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return text
	}
	return string(b)
}
