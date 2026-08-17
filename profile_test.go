package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveProfileOneFilePerHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Method: "GET"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "https://example.com/b", Method: "POST", Body: `{"x":1}`}); err != nil {
		t.Fatal(err)
	}

	list := a.GetProfiles()
	if len(list) != 1 {
		t.Fatalf("want 1 profile per host, got %d", len(list))
	}
	if list[0].Name != "https://example.com" {
		t.Fatalf("name = %q", list[0].Name)
	}
	if list[0].URL != "https://example.com/b" {
		t.Fatalf("url = %q", list[0].URL)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "servers"))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("want 1 file, got %d", len(entries))
	}
	if entries[0].Name() != "https-example.com.json" {
		t.Fatalf("filename = %q", entries[0].Name())
	}
}

func TestSavedRequestsStayOnHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Method: "GET"}); err != nil {
		t.Fatal(err)
	}
	login, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "登录", URL: "https://example.com/login", Method: "POST", Body: `{"u":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.ID == "" {
		t.Fatal("expected id")
	}
	list, err := a.SaveRequest("https://example.com/login", SavedRequest{
		Name: "拉列表", URL: "https://example.com/users", Method: "GET",
	})
	if err != nil {
		t.Fatal(err)
	}
	if list.ID == login.ID {
		t.Fatal("ids should differ")
	}

	// last-used overwrite must not drop bookmarks
	if err := a.SaveProfile(Profile{URL: "https://example.com/b", Method: "PUT", Body: "x"}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if got[0].URL != "https://example.com/b" || got[0].Method != "PUT" {
		t.Fatalf("last-used = %+v", got[0])
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %d", len(got[0].Requests))
	}

	again, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "登录", URL: "https://example.com/login", Method: "POST", Body: `{"u":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != login.ID {
		t.Fatalf("upsert id %q want %q", again.ID, login.ID)
	}
	got = a.GetProfiles()
	if len(got[0].Requests) != 2 {
		t.Fatalf("after upsert requests = %d", len(got[0].Requests))
	}
	var loginBody string
	for _, r := range got[0].Requests {
		if r.Name == "登录" {
			loginBody = r.Body
		}
	}
	if loginBody != `{"u":2}` {
		t.Fatalf("login body = %q", loginBody)
	}

	if err := a.DeleteRequest("https://example.com", login.ID); err != nil {
		t.Fatal(err)
	}
	got = a.GetProfiles()
	if len(got[0].Requests) != 1 || got[0].Requests[0].Name != "拉列表" {
		t.Fatalf("after delete = %+v", got[0].Requests)
	}
}

func TestSaveRequestRequiresName(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if _, err := a.SaveRequest("https://example.com", SavedRequest{
		URL: "https://example.com/x", Method: "GET",
	}); err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestSavedRequestsArePerHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := a.SaveRequest("https://a.example/x", SavedRequest{
		Name: "A", URL: "https://a.example/x", Method: "GET",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SaveRequest("https://b.example/y", SavedRequest{
		Name: "B", URL: "https://b.example/y", Method: "POST",
	}); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 2 {
		t.Fatalf("profiles = %d", len(list))
	}
	for _, p := range list {
		if len(p.Requests) != 1 {
			t.Fatalf("%s requests = %d", p.Name, len(p.Requests))
		}
	}
}

func TestWSSavedMessagesStayOnHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "ws://example.com/ws", Reconnect: true}); err != nil {
		t.Fatal(err)
	}
	login, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","u":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.ID == "" {
		t.Fatal("expected id")
	}
	if _, err := a.SaveRequest("ws://example.com/ws", SavedRequest{
		Name: "ping", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"ping"}`,
	}); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "ws://example.com/ws", Body: `{"cmd":"other"}`}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %d", len(got[0].Requests))
	}

	again, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","u":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != login.ID {
		t.Fatalf("upsert id %q want %q", again.ID, login.ID)
	}
	got = a.GetProfiles()
	var loginBody, loginKind string
	for _, r := range got[0].Requests {
		if r.Name == "login" {
			loginBody = r.Body
			loginKind = r.Kind
		}
	}
	if loginBody != `{"cmd":"login","u":2}` || loginKind != "ws" {
		t.Fatalf("login = body %q kind %q", loginBody, loginKind)
	}
}
