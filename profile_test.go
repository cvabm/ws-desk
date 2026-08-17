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
