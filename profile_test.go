package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestProfileNameFromURL(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"ws://192.0.2.11:10020/imcp", "ws://192.0.2.11"},
		{"wss://gateway.example.com:443/gw", "wss://gateway.example.com"},
		{"https://API.Example.COM/v1", "https://API.Example.COM"},
		{"http://127.0.0.1/ping", "http://127.0.0.1"},
		{"10.0.0.8:8080/x", "ws://10.0.0.8"},
		{"", ""},
		{"http://", ""},
	}
	for _, tc := range tests {
		if got := profileNameFromURL(tc.in); got != tc.want {
			t.Fatalf("profileNameFromURL(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestURLHostname(t *testing.T) {
	if got := urlHostname("https://API.Example.COM:8443/v1"); got != "API.Example.COM" {
		t.Fatalf("urlHostname=%q", got)
	}
	if got := urlHostname("10.0.0.8:8080/x"); got != "10.0.0.8" {
		t.Fatalf("bare urlHostname=%q", got)
	}
}

func TestProfileFileName(t *testing.T) {
	if got := profileFileName("ws://192.0.2.13"); got != "ws-192.0.2.13.json" {
		t.Fatalf("file=%q", got)
	}
	if got := profileFileName("https://httpbin.org"); got != "https-httpbin.org.json" {
		t.Fatalf("file=%q", got)
	}
}

func TestSaveProfileUsesSchemeHost(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	err := a.SaveProfile(Profile{
		Name:      "gateway",
		URL:       "ws://192.0.2.13:8188/gw",
		Protocol:  "venus-protocol",
		Reconnect: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 1 || list[0].Name != "ws://192.0.2.13" {
		t.Fatalf("profiles=%+v", list)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "ws-192.0.2.13.json")); err != nil {
		t.Fatal(err)
	}
}

func TestSameHostDifferentSchemes(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	if err := a.SaveProfile(Profile{URL: "ws://192.0.2.11:10020/imcp"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "https://192.0.2.11/api"}); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 2 {
		t.Fatalf("profiles=%+v", list)
	}
	names := map[string]bool{}
	for _, p := range list {
		names[p.Name] = true
	}
	if !names["ws://192.0.2.11"] || !names["https://192.0.2.11"] {
		t.Fatalf("names=%v", names)
	}
}

func TestMigrateLegacyNamedProfiles(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	if err := a.ensureServers(); err != nil {
		t.Fatal(err)
	}
	legacy := Profile{Name: "imcp", URL: "ws://192.0.2.11:10020/imcp", Reconnect: true}
	raw, _ := json.MarshalIndent(legacy, "", "  ")
	if err := os.WriteFile(filepath.Join(a.serversDir(), "imcp.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 1 || list[0].Name != "ws://192.0.2.11" {
		t.Fatalf("migrated=%+v", list)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "imcp.json")); !os.IsNotExist(err) {
		t.Fatalf("legacy file should be gone, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "ws-192.0.2.11.json")); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateHostOnlyProfiles(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	if err := a.ensureServers(); err != nil {
		t.Fatal(err)
	}
	old := Profile{Name: "httpbin.org", URL: "https://httpbin.org/get"}
	raw, _ := json.MarshalIndent(old, "", "  ")
	if err := os.WriteFile(filepath.Join(a.serversDir(), "httpbin.org.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 1 || list[0].Name != "https://httpbin.org" {
		t.Fatalf("migrated=%+v", list)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "httpbin.org.json")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "https-httpbin.org.json")); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteProfile(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	if err := a.SaveProfile(Profile{URL: "ws://192.0.2.11:10020/imcp"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "http://203.0.113.19/"}); err != nil {
		t.Fatal(err)
	}
	if err := a.DeleteProfile("http://203.0.113.19/path"); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 1 || list[0].Name != "ws://192.0.2.11" {
		t.Fatalf("after delete=%+v", list)
	}
	if _, err := os.Stat(filepath.Join(a.serversDir(), "http-203.0.113.19.json")); !os.IsNotExist(err) {
		t.Fatalf("http profile file should be gone, err=%v", err)
	}
	if err := a.DeleteProfile("ws://192.0.2.11"); err != nil {
		t.Fatal(err)
	}
	if list := a.GetProfiles(); len(list) != 0 {
		t.Fatalf("want empty, got %+v", list)
	}
	if err := a.DeleteProfile("ws://missing.example"); err != nil {
		t.Fatalf("missing should be ok: %v", err)
	}
	if err := a.DeleteProfile(""); err == nil {
		t.Fatal("empty name should fail")
	}
}

func TestSaveProfileKeepsLastBody(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	err := a.SaveProfile(Profile{
		URL:      "https://httpbin.org/post",
		Method:   "POST",
		BodyType: "json",
		Body:     `{"ping":1}`,
		FormList: []HeaderItem{{Key: "a", Value: "1", Enabled: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 1 {
		t.Fatalf("profiles=%+v", list)
	}
	p := list[0]
	if p.Body != `{"ping":1}` || p.BodyType != "json" || len(p.FormList) != 1 || p.FormList[0].Key != "a" {
		t.Fatalf("profile=%+v", p)
	}
}

func TestGetProfilesEmpty(t *testing.T) {
	a := &App{baseDir: t.TempDir()}
	if list := a.GetProfiles(); len(list) != 0 {
		t.Fatalf("want empty, got %+v", list)
	}
}

func TestMigrateDataDirs(t *testing.T) {
	dir := t.TempDir()
	a := &App{baseDir: dir}
	if err := os.MkdirAll(filepath.Join(dir, "profiles"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "profiles", "ws-1.2.3.4.json"), []byte(`{"name":"ws://1.2.3.4","url":"ws://1.2.3.4/"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "ws-logs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ws-logs", "ws-2026-08-13.jsonl"), []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.migrateDataDirs()
	if _, err := os.Stat(filepath.Join(dir, "servers", "ws-1.2.3.4.json")); err != nil {
		t.Fatalf("servers: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "requests", "ws-2026-08-13.jsonl")); err != nil {
		t.Fatalf("requests: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "profiles")); !os.IsNotExist(err) {
		t.Fatalf("old profiles still exists")
	}
	if _, err := os.Stat(filepath.Join(dir, "ws-logs")); !os.IsNotExist(err) {
		t.Fatalf("old ws-logs still exists")
	}
}
