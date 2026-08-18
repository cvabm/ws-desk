package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func catalogExportFileName(name string) string {
	base := strings.TrimSuffix(profileFileName(name), ".json")
	if base == "" || base == "profile" {
		return "catalog.json"
	}
	return base + "-catalog.json"
}

func catalogExportProfile(p Profile) Profile {
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	if name := profileNameFromURL(p.URL); name != "" {
		p.Name = name
	}
	p.Modules = normalizeModules(p.Modules)
	return p
}

func parseCatalogFile(raw []byte) (Profile, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return Profile{}, fmt.Errorf("empty file")
	}
	var p Profile
	if err := json.Unmarshal(raw, &p); err != nil {
		return Profile{}, fmt.Errorf("invalid json")
	}
	return p, nil
}

func parseImportFile(raw []byte) (Profile, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return Profile{}, fmt.Errorf("empty file")
	}
	if isPostmanCollection(raw) {
		return parsePostmanCollection(raw)
	}
	return parseCatalogFile(raw)
}

func normalizeSavedRequest(r SavedRequest) SavedRequest {
	r.ID = strings.TrimSpace(r.ID)
	r.Name = clipRunes(r.Name, 80)
	r.Title = clipRunes(r.Title, 80)
	r.Description = clipRunes(r.Description, 200)
	r.Module = clipRunes(r.Module, 80)
	r.URL = strings.TrimSpace(r.URL)
	r.Method = strings.TrimSpace(r.Method)
	r.Kind = strings.ToLower(strings.TrimSpace(r.Kind))
	if r.Kind != "http" && r.Kind != "ws" {
		r.Kind = ""
	}
	if r.Name == "" {
		if r.Title != "" {
			r.Name = r.Title
		} else {
			r.Name = "未命名"
		}
	}
	return r
}

func mergeImportedRequests(dst, src []SavedRequest) []SavedRequest {
	byID := make(map[string]int, len(dst)+len(src))
	out := make([]SavedRequest, 0, len(dst)+len(src))
	for _, r := range dst {
		r = normalizeSavedRequest(r)
		if r.ID != "" {
			byID[r.ID] = len(out)
		}
		out = append(out, r)
	}
	for _, r := range src {
		r = normalizeSavedRequest(r)
		if r.ID != "" {
			if i, ok := byID[r.ID]; ok {
				out[i] = r
				continue
			}
		}
		if r.ID == "" {
			r.ID = newRequestID()
		}
		byID[r.ID] = len(out)
		out = append(out, r)
	}
	return out
}

func mergeVariables(dst, src []HeaderItem) []HeaderItem {
	seen := make(map[string]int, len(dst)+len(src))
	out := make([]HeaderItem, 0, len(dst)+len(src))
	for _, list := range [][]HeaderItem{dst, src} {
		for _, row := range list {
			key := strings.TrimSpace(row.Key)
			if key == "" {
				continue
			}
			row.Key = key
			if i, ok := seen[key]; ok {
				out[i] = row
				continue
			}
			seen[key] = len(out)
			out = append(out, row)
		}
	}
	return out
}

func mergeImportedCatalog(dst, src Profile) Profile {
	dst.Requests = mergeImportedRequests(dst.Requests, src.Requests)
	mods := append([]string{}, dst.Modules...)
	mods = append(mods, src.Modules...)
	for _, r := range src.Requests {
		if m := clipRunes(r.Module, 80); m != "" {
			mods = append(mods, m)
		}
	}
	dst.Modules = normalizeModules(mods)
	srcEnvs, _ := normalizeEnvironments(src.Environments, src.ActiveEnv, src.VariableList)
	dstEnvs, active := normalizeEnvironments(dst.Environments, dst.ActiveEnv, dst.VariableList)
	dst.Environments = mergeEnvironments(dstEnvs, srcEnvs)
	dst.ActiveEnv = active
	dst.VariableList = activeEnvVars(dst.Environments, dst.ActiveEnv)
	return dst
}

func importVarMap(p Profile) map[string]string {
	out := map[string]string{}
	for _, row := range p.VariableList {
		if k := strings.TrimSpace(row.Key); k != "" {
			out[k] = row.Value
		}
	}
	for _, e := range p.Environments {
		for _, row := range e.Variables {
			if k := strings.TrimSpace(row.Key); k != "" {
				out[k] = row.Value
			}
		}
	}
	return out
}

func substituteImportVars(s string, vars map[string]string) string {
	if s == "" || !strings.Contains(s, "{{") || len(vars) == 0 {
		return s
	}
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return len(keys[i]) > len(keys[j]) })
	for _, k := range keys {
		s = strings.ReplaceAll(s, "{{"+k+"}}", vars[k])
		s = strings.ReplaceAll(s, "{{ "+k+" }}", vars[k])
	}
	return s
}

func importHostFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !hasURLScheme(raw) {
		raw = "https://" + strings.TrimPrefix(raw, "//")
	}
	switch strings.ToLower(urlSchemeOf(raw)) {
	case "http", "https", "ws", "wss":
		name := profileNameFromURL(raw)
		if name == "" || strings.ContainsAny(name, "{}") {
			return ""
		}
		return name
	default:
		return ""
	}
}

func fileHostFromProfile(p Profile) string {
	if n := importHostFromURL(p.URL); n != "" {
		return n
	}
	return importHostFromURL(p.Name)
}

func hostFromBaseVars(vars map[string]string) string {
	for _, key := range []string{"baseUrl", "base_url", "baseURL", "host", "url", "Host"} {
		if n := importHostFromURL(vars[key]); n != "" {
			return n
		}
	}
	return ""
}

func requestURLOnHost(resolved, host string) string {
	resolved = strings.TrimSpace(resolved)
	if n := importHostFromURL(resolved); n == host && hasURLScheme(resolved) {
		return resolved
	}
	path := pathFromRequestURL(resolved)
	suffix := ""
	if i := strings.IndexAny(resolved, "?#"); i >= 0 {
		suffix = resolved[i:]
	}
	if path == "" || path == "/" {
		return host + suffix
	}
	return host + path + suffix
}

func splitImportByHost(src Profile) ([]Profile, error) {
	vars := importVarMap(src)
	fallback := fileHostFromProfile(src)
	if fallback == "" {
		fallback = hostFromBaseVars(vars)
	}
	groups := map[string][]SavedRequest{}
	order := make([]string, 0, 4)
	add := func(host string, r SavedRequest) {
		if _, ok := groups[host]; !ok {
			order = append(order, host)
		}
		groups[host] = append(groups[host], r)
	}
	for _, r := range src.Requests {
		r = normalizeSavedRequest(r)
		resolved := substituteImportVars(r.URL, vars)
		host := importHostFromURL(resolved)
		if host == "" {
			host = fallback
		}
		if host == "" {
			continue
		}
		if importHostFromURL(r.URL) == "" {
			r.URL = requestURLOnHost(resolved, host)
		}
		add(host, r)
	}
	if len(order) == 0 {
		if fallback == "" {
			return nil, fmt.Errorf("无法从文件判断主机（需要完整 URL 或 baseUrl）")
		}
		order = []string{fallback}
		groups[fallback] = nil
	}
	out := make([]Profile, 0, len(order))
	for _, host := range order {
		out = append(out, Profile{
			Name:         host,
			URL:          host,
			Requests:     groups[host],
			Modules:      src.Modules,
			Environments: src.Environments,
			VariableList: src.VariableList,
			ActiveEnv:    src.ActiveEnv,
		})
	}
	return out, nil
}

func pickPrimaryImport(list []Profile) Profile {
	if len(list) == 0 {
		return Profile{}
	}
	best := 0
	for i := 1; i < len(list); i++ {
		if len(list[i].Requests) > len(list[best].Requests) {
			best = i
		}
	}
	return list[best]
}

func (a *App) loadOrCreateProfile(name string) (Profile, error) {
	dst, err := a.loadProfileByName(name)
	if err == nil {
		return dst, nil
	}
	if !os.IsNotExist(err) {
		return Profile{}, err
	}
	return Profile{Name: name, URL: name, Headers: map[string]string{}}, nil
}

func (a *App) exportCatalog(p Profile) (bool, error) {
	if a.ctx == nil {
		return false, fmt.Errorf("app not ready")
	}
	p = catalogExportProfile(p)
	if p.Name == "" && p.URL == "" && len(p.Requests) == 0 {
		return false, fmt.Errorf("nothing to export")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出接口目录",
		DefaultFilename: catalogExportFileName(p.Name),
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(path) == "" {
		return false, nil
	}
	if !strings.HasSuffix(strings.ToLower(path), ".json") {
		path += ".json"
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) importCatalog() (*Profile, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("app not ready")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "导入接口目录或 Postman Collection",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(path) == "" {
		return nil, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return a.applyImportedFile(raw)
}

func (a *App) applyImportedFile(raw []byte) (*Profile, error) {
	src, err := parseImportFile(raw)
	if err != nil {
		return nil, err
	}
	buckets, err := splitImportByHost(src)
	if err != nil {
		return nil, err
	}
	focus := pickPrimaryImport(buckets).Name
	var primary Profile
	for _, srcHost := range buckets {
		dst, err := a.loadOrCreateProfile(srcHost.Name)
		if err != nil {
			return nil, err
		}
		merged := mergeImportedCatalog(dst, srcHost)
		if err := a.saveProfileFile(merged); err != nil {
			return nil, err
		}
		if srcHost.Name == focus {
			primary = merged
		}
	}
	return &primary, nil
}
