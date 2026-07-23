package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func defaultProfiles() []Profile {
	return []Profile{
		{
			Name:      "imcp",
			URL:       "ws://192.0.2.11:10020/imcp",
			Reconnect: true,
			PingSec:   20,
			Headers:   map[string]string{},
		},
		{
			Name:      "gateway",
			URL:       "ws://192.0.2.13:8188/gw",
			Protocol:  "venus-protocol",
			Reconnect: true,
			PingSec:   20,
			Headers:   map[string]string{},
		},
	}
}

func (a *App) profilesDir() string {
	return filepath.Join(a.baseDir, "profiles")
}

func (a *App) ensureProfiles() error {
	dir := a.profilesDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	if len(entries) > 0 {
		return nil
	}
	for _, p := range defaultProfiles() {
		if err := a.saveProfileFile(p); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) saveProfileFile(p Profile) error {
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	name := sanitizeName(p.Name) + ".json"
	return os.WriteFile(filepath.Join(a.profilesDir(), name), data, 0o644)
}

func (a *App) loadProfiles() ([]Profile, error) {
	if err := a.ensureProfiles(); err != nil {
		return defaultProfiles(), nil
	}
	entries, err := os.ReadDir(a.profilesDir())
	if err != nil {
		return defaultProfiles(), nil
	}
	var list []Profile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(a.profilesDir(), e.Name()))
		if err != nil {
			continue
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			continue
		}
		if p.Name == "" {
			p.Name = strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		}
		if p.Headers == nil {
			p.Headers = map[string]string{}
		}
		list = append(list, p)
	}
	if len(list) == 0 {
		return defaultProfiles(), nil
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list, nil
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "profile"
	}
	repl := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", "\"", "", "<", "", ">", "", "|", "-")
	return repl.Replace(s)
}
