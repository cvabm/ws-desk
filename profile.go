package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (a *App) ensureServers() error {
	return os.MkdirAll(a.serversDir(), 0o755)
}

// urlHostname is the request host (IP or domain), without port or scheme.
func urlHostname(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !hasURLScheme(raw) {
		raw = "ws://" + strings.TrimPrefix(raw, "//")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(u.Hostname())
}

// profileNameFromURL is "scheme://host" (no port). Missing scheme defaults to ws.
func profileNameFromURL(raw string) string {
	host := urlHostname(raw)
	if host == "" {
		return ""
	}
	scheme := "ws"
	if hasURLScheme(raw) {
		if s := urlSchemeOf(raw); s != "" {
			scheme = s
		}
	}
	return scheme + "://" + host
}

func profileFileName(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.Index(name, "://"); i > 0 {
		scheme := strings.ToLower(strings.TrimSpace(name[:i]))
		host := strings.TrimSpace(name[i+3:])
		if scheme != "" && host != "" {
			return sanitizeName(scheme) + "-" + sanitizeName(host) + ".json"
		}
	}
	return sanitizeName(name) + ".json"
}

func (a *App) saveProfileFile(p Profile) error {
	if err := a.ensureServers(); err != nil {
		return err
	}
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(a.serversDir(), profileFileName(p.Name)), data, 0o644)
}

func (a *App) loadProfiles() ([]Profile, error) {
	if err := a.ensureServers(); err != nil {
		return nil, err
	}
	_ = a.migrateLegacyNamedProfiles()
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		return nil, err
	}
	var list []Profile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(a.serversDir(), e.Name()))
		if err != nil {
			continue
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			continue
		}
		if name := profileNameFromURL(p.URL); name != "" {
			p.Name = name
		} else if p.Name == "" {
			p.Name = strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		}
		if p.Headers == nil {
			p.Headers = map[string]string{}
		}
		list = append(list, p)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list, nil
}

// migrateLegacyNamedProfiles rewrites old named or host-only presets to scheme://host files.
func (a *App) migrateLegacyNamedProfiles() error {
	dir := a.serversDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			continue
		}
		name := profileNameFromURL(p.URL)
		if name == "" {
			continue
		}
		want := profileFileName(name)
		if strings.EqualFold(e.Name(), want) && p.Name == name {
			continue
		}
		p.Name = name
		if err := a.saveProfileFile(p); err != nil {
			continue
		}
		if !strings.EqualFold(e.Name(), want) {
			_ = os.Remove(path)
		}
	}
	return nil
}

func (a *App) deleteProfile(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("name is required")
	}
	if n := profileNameFromURL(name); n != "" {
		name = n
	}
	dir, err := filepath.Abs(a.serversDir())
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path, err := filepath.Abs(filepath.Join(dir, profileFileName(name)))
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(dir, path)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return fmt.Errorf("invalid profile")
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "profile"
	}
	repl := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", "\"", "", "<", "", ">", "", "|", "-")
	return repl.Replace(s)
}
