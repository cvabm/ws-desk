package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (a *App) ensureServers() error {
	return os.MkdirAll(a.serversDir(), 0o755)
}

func parseDialishURL(raw string) *url.URL {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if !hasURLScheme(raw) {
		raw = "ws://" + strings.TrimPrefix(raw, "//")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil
	}
	return u
}

func defaultPort(scheme string) string {
	switch strings.ToLower(scheme) {
	case "http", "ws":
		return "80"
	case "https", "wss":
		return "443"
	default:
		return ""
	}
}

// urlHostname is the request host (IP or domain), without port or scheme.
func urlHostname(raw string) string {
	u := parseDialishURL(raw)
	if u == nil {
		return ""
	}
	return strings.TrimSpace(u.Hostname())
}

// urlHostPort is host[:port], omitting the scheme's default port.
func urlHostPort(raw string) string {
	u := parseDialishURL(raw)
	if u == nil {
		return ""
	}
	host := strings.TrimSpace(u.Hostname())
	if host == "" {
		return ""
	}
	port := u.Port()
	if port == "" || port == defaultPort(u.Scheme) {
		return host
	}
	if strings.Contains(host, ":") {
		return "[" + host + "]:" + port
	}
	return host + ":" + port
}

// profileNameFromURL is "scheme://host[:port]". Missing scheme defaults to ws.
func profileNameFromURL(raw string) string {
	host := urlHostPort(raw)
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

// profileStorageFileName uses the project name for on-disk storage. The URL
// remains in Profile.Name so connections and requests can still be addressed
// by their scheme and host.
func profileStorageFileName(p Profile) string {
	if project := strings.TrimSpace(p.Project); project != "" {
		return sanitizeName(project) + ".json"
	}
	return profileFileName(p.Name)
}

func (a *App) saveProfileFile(p Profile) error {
	if err := a.ensureServers(); err != nil {
		return err
	}
	path := filepath.Join(a.serversDir(), profileStorageFileName(p))
	if strings.TrimSpace(p.Project) != "" {
		if raw, err := os.ReadFile(path); err == nil {
			var existing Profile
			if json.Unmarshal(raw, &existing) == nil {
				if name := profileNameFromURL(existing.URL); name != "" {
					existing.Name = name
				}
				if existing.Name != "" && existing.Name != p.Name && strings.TrimSpace(existing.Project) == strings.TrimSpace(p.Project) {
					p = mergeProjectCatalogs(existing, p)
				}
			}
		}
	}
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	p.Modules = normalizeModules(p.Modules)
	p = finishProfileEnvs(p)
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
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

// migrateLegacyNamedProfiles rewrites old named or host-only presets to scheme://host[:port] files.
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
		p.Name = name
		want := profileStorageFileName(p)
		if strings.EqualFold(e.Name(), want) && p.Name == name {
			continue
		}
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
	p, loadErr := a.loadProfileByName(name)
	fileName := profileFileName(name)
	if loadErr == nil {
		fileName = profileStorageFileName(p)
	}
	path, err := filepath.Abs(filepath.Join(dir, fileName))
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

func resolveProfileName(hint string) string {
	hint = strings.TrimSpace(hint)
	if hint == "" {
		return ""
	}
	if name := profileNameFromURL(hint); name != "" {
		return name
	}
	return hint
}

func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func (a *App) loadProfileByName(name string) (Profile, error) {
	name = resolveProfileName(name)
	if name == "" {
		return Profile{}, fmt.Errorf("profile is required")
	}
	if err := a.ensureServers(); err != nil {
		return Profile{}, err
	}
	list, err := a.loadProfiles()
	if err != nil {
		return Profile{}, err
	}
	for _, p := range list {
		if p.Name == name {
			return p, nil
		}
	}
	return Profile{}, os.ErrNotExist
}

func normalizeModules(list []string) []string {
	if list == nil {
		return nil
	}
	seen := make(map[string]struct{}, len(list))
	out := make([]string, 0, len(list))
	for _, name := range list {
		name = clipRunes(name, 80)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func (a *App) mergeProfileRequests(p Profile) Profile {
	needReq := p.Requests == nil
	needMod := p.Modules == nil
	needEnv := p.Environments == nil
	if !needReq && !needMod && !needEnv {
		p.Modules = normalizeModules(p.Modules)
		return p
	}
	existing, err := a.loadProfileByName(p.Name)
	if err != nil {
		p.Modules = normalizeModules(p.Modules)
		return p
	}
	if needReq {
		p.Requests = existing.Requests
	}
	if needMod {
		p.Modules = existing.Modules
	}
	if needEnv {
		p.Environments = existing.Environments
		if p.ActiveEnv == "" {
			p.ActiveEnv = existing.ActiveEnv
		}
	}
	p.Modules = normalizeModules(p.Modules)
	return p
}

func upsertSavedRequest(list []SavedRequest, req SavedRequest) ([]SavedRequest, SavedRequest) {
	if req.ID != "" {
		for i, r := range list {
			if r.ID == req.ID {
				list[i] = req
				return list, req
			}
		}
	}
	for i, r := range list {
		if r.Name == req.Name {
			if req.ID == "" {
				req.ID = r.ID
			}
			list[i] = req
			return list, req
		}
	}
	if req.ID == "" {
		req.ID = newRequestID()
	}
	return append(list, req), req
}

func clipRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 {
		return s
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

func (a *App) saveRequestOnProfile(profileHint string, req SavedRequest) (SavedRequest, error) {
	req.Name = clipRunes(req.Name, 80)
	if req.Name == "" {
		return SavedRequest{}, fmt.Errorf("name is required")
	}
	req.Title = clipRunes(req.Title, 80)
	req.Description = clipRunes(req.Description, 200)
	req.Module = clipRunes(req.Module, 80)
	if req.UpdatedAt <= 0 {
		req.UpdatedAt = time.Now().UnixMilli()
	}
	req.URL = strings.TrimSpace(req.URL)
	req.ID = strings.TrimSpace(req.ID)
	name := resolveProfileName(profileHint)
	if name == "" {
		name = profileNameFromURL(req.URL)
	}
	if name == "" {
		return SavedRequest{}, fmt.Errorf("profile is required")
	}
	p, err := a.loadProfileByName(name)
	if err != nil {
		if !os.IsNotExist(err) {
			return SavedRequest{}, err
		}
		p = Profile{Name: name, URL: req.URL, Headers: map[string]string{}}
		if p.URL == "" {
			p.URL = name
		}
	}
	var saved SavedRequest
	p.Requests, saved = upsertSavedRequest(p.Requests, req)
	if err := a.saveProfileFile(p); err != nil {
		return SavedRequest{}, err
	}
	return saved, nil
}

func (a *App) deleteRequestOnProfile(profileHint, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("id is required")
	}
	p, err := a.loadProfileByName(profileHint)
	if err != nil {
		return err
	}
	out := make([]SavedRequest, 0, len(p.Requests))
	for _, r := range p.Requests {
		if r.ID != id {
			out = append(out, r)
		}
	}
	p.Requests = out
	return a.saveProfileFile(p)
}
