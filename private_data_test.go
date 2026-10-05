package main

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Opt-in offline test: no private fixtures or endpoint values are committed.
// Only temporary copies are passed to APIs that can migrate/save profiles.
func TestPrivateDataOfflineCompatibility(t *testing.T) {
	root := os.Getenv("WS_DESK_TEST_DATA")
	if root == "" {
		t.Skip("set WS_DESK_TEST_DATA to a private data directory for offline verification")
	}
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := os.MkdirAll(a.serversDir(), 0o700); err != nil {
		t.Fatal("cannot create temporary profile directory")
	}
	snapshots := map[string][32]byte{}
	profileCount, requestCount, envCount, historyCount := 0, 0, 0, 0
	for _, directory := range []string{"connection-profiles", "api-requests"} {
		entries, err := os.ReadDir(filepath.Join(root, directory))
		if err != nil {
			t.Fatal("cannot read private data directory; contents omitted")
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			source := filepath.Join(root, directory, entry.Name())
			raw, err := os.ReadFile(source)
			if err != nil {
				t.Fatal("cannot read private data file; contents omitted")
			}
			snapshots[source] = sha256.Sum256(raw)
			if directory == "connection-profiles" && strings.EqualFold(filepath.Ext(entry.Name()), ".json") {
				var profile Profile
				if json.Unmarshal(raw, &profile) != nil {
					t.Fatal("private profile is incompatible; contents omitted")
				}
				profileCount++
				requestCount += len(profile.Requests)
				envCount += len(profile.Environments)
				if err := os.WriteFile(filepath.Join(a.serversDir(), entry.Name()), raw, 0o600); err != nil {
					t.Fatal("cannot create temporary profile copy")
				}
			} else if directory == "api-requests" && strings.EqualFold(filepath.Ext(entry.Name()), ".jsonl") {
				if _, err := loadSessionFile(source); err != nil {
					t.Fatal("private history is incompatible; contents omitted")
				}
				historyCount++
			}
		}
	}
	if profileCount == 0 {
		t.Fatal("no profiles found in private data directory")
	}
	profiles := a.GetProfiles()
	if len(profiles) != profileCount || a.GetProfileLoadError() != "" {
		t.Fatal("not all temporary profiles loaded; details omitted")
	}
	for _, profile := range profiles {
		if err := a.SaveProfile(profile); err != nil {
			t.Fatal("temporary profile save failed; details omitted")
		}
		var saved Profile
		raw, err := os.ReadFile(filepath.Join(a.serversDir(), profileStorageFileName(profile)))
		if err != nil || json.Unmarshal(raw, &saved) != nil {
			t.Fatal("temporary saved profile is unreadable")
		}
		if !reflect.DeepEqual(profile.Requests, saved.Requests) {
			t.Fatal("request definitions changed during round trip; contents omitted")
		}
		if profile.InsecureSkipVerify != saved.InsecureSkipVerify {
			t.Fatal("TLS preference changed during round trip")
		}
		expected := finishProfileEnvs(profile)
		if !reflect.DeepEqual(expected.Environments, saved.Environments) || expected.ActiveEnv != saved.ActiveEnv {
			t.Fatal("environment definitions changed during round trip; contents omitted")
		}
	}
	for source, digest := range snapshots {
		raw, err := os.ReadFile(source)
		if err != nil || sha256.Sum256(raw) != digest {
			t.Fatal("original private data was modified")
		}
	}
	t.Logf("offline verification passed: %d projects, %d requests, %d environments, %d history files; original data unchanged", profileCount, requestCount, envCount, historyCount)
}
