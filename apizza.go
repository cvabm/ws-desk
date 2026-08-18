package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"time"
	"unicode"
)

type apizzaProject struct {
	ProjectInfo struct {
		Name string `json:"name"`
	} `json:"project_info"`
	Categorys    []apizzaCategory `json:"categorys"`
	Envirnments  []apizzaEnv      `json:"envirnments"`
	Environments []apizzaEnv      `json:"environments"`
}

type apizzaCategory struct {
	Name          string           `json:"name"`
	APIList       []apizzaAPI      `json:"api_list"`
	SubCategorys  []apizzaCategory `json:"sub_categorys"`
	SubCategories []apizzaCategory `json:"sub_categories"`
}

type apizzaAPI struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Method         string        `json:"method"`
	URL            string        `json:"url"`
	Type           string        `json:"type"`
	HeaderParams   []apizzaParam `json:"header_params"`
	QueryParams    []apizzaParam `json:"query_params"`
	BodyParams     []apizzaParam `json:"body_params"`
	BodyRaw        string        `json:"body_raw"`
	BodyRawExample string        `json:"body_raw_example"`
	RawContentType string        `json:"raw_content_type"`
	BodyType       string        `json:"body_type"`
	ResponseDoc    string        `json:"response_doc"`
}

type apizzaParam struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Desc    string `json:"desc"`
	Eg      string `json:"eg"`
	Checked int    `json:"checked"`
	Type    string `json:"type"`
}

type apizzaEnv struct {
	Name        string          `json:"name"`
	ContentJSON json.RawMessage `json:"content_json"`
}

type apizzaEnvKV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func isApizzaProject(raw []byte) bool {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '{' {
		return false
	}
	var probe struct {
		ProjectInfo json.RawMessage `json:"project_info"`
		Categorys   json.RawMessage `json:"categorys"`
	}
	if json.Unmarshal(raw, &probe) != nil {
		return false
	}
	info := bytes.TrimSpace(probe.ProjectInfo)
	cats := bytes.TrimSpace(probe.Categorys)
	if len(info) > 2 && info[0] == '{' {
		return true
	}
	return len(cats) > 2 && cats[0] == '['
}

func parseApizzaProject(raw []byte) (Profile, error) {
	raw = bytes.TrimSpace(raw)
	var proj apizzaProject
	if err := json.Unmarshal(raw, &proj); err != nil {
		return Profile{}, fmt.Errorf("invalid apizza project")
	}
	if proj.ProjectInfo.Name == "" && len(proj.Categorys) == 0 {
		return Profile{}, fmt.Errorf("invalid apizza project")
	}
	p := Profile{Headers: map[string]string{}}
	if name := clipRunes(strings.TrimSpace(proj.ProjectInfo.Name), 80); name != "" {
		p.Project = name
	}
	collectApizzaCategories(proj.Categorys, nil, &p)
	p.Modules = normalizeModules(p.Modules)
	envs := proj.Envirnments
	if len(envs) == 0 {
		envs = proj.Environments
	}
	for _, e := range envs {
		name := clipRunes(strings.TrimSpace(e.Name), 80)
		if name == "" {
			continue
		}
		vars := parseApizzaEnvVars(e.ContentJSON)
		p.Environments = append(p.Environments, Environment{Name: name, Variables: vars})
	}
	if len(p.Environments) > 0 {
		p.ActiveEnv = p.Environments[0].Name
		p.VariableList = p.Environments[0].Variables
		if host := apizzaHostFromVars(p.Environments[0].Variables); host != "" {
			p.URL = host
			p.Name = profileNameFromURL(host)
		}
	}
	if p.URL == "" {
		if host := hostFromBaseVars(importVarMap(p)); host != "" {
			p.URL = host
			p.Name = host
		}
	}
	return p, nil
}

func collectApizzaCategories(cats []apizzaCategory, folder []string, p *Profile) {
	for _, cat := range cats {
		next := folder
		if name := strings.TrimSpace(cat.Name); name != "" {
			next = append(append([]string{}, folder...), name)
		}
		if path := joinPostmanFolder(next); path != "" {
			p.Modules = append(p.Modules, path)
		}
		for _, api := range cat.APIList {
			req, ok := savedRequestFromApizza(api)
			if !ok {
				continue
			}
			req.Module = joinPostmanFolder(next)
			req.ID = ""
			req.UpdatedAt = time.Now().UnixMilli()
			p.Requests = append(p.Requests, req)
		}
		subs := cat.SubCategorys
		if len(subs) == 0 {
			subs = cat.SubCategories
		}
		if len(subs) > 0 {
			collectApizzaCategories(subs, next, p)
		}
	}
}

func savedRequestFromApizza(api apizzaAPI) (SavedRequest, bool) {
	title := strings.TrimSpace(api.Name)
	rawURL := strings.TrimSpace(api.URL)
	if title == "" && rawURL == "" && strings.TrimSpace(api.BodyRaw) == "" && strings.TrimSpace(api.BodyRawExample) == "" {
		return SavedRequest{}, false
	}
	req := SavedRequest{
		Title:       title,
		Description: htmlToPlain(api.ResponseDoc),
		URL:         rawURL,
		AuthType:    "none",
		UpdatedAt:   time.Now().UnixMilli(),
	}
	if apizzaIsSocket(api) {
		body := apizzaPickBody(api.BodyRaw, api.BodyRawExample)
		req.Kind = "ws"
		req.Body = body
		req.BodyType = apizzaBodyKind(body, api.RawContentType)
		req.Name = apizzaWSName(title, body)
		if req.URL == "" {
			req.URL = "{{host}}"
		}
		return req, true
	}
	method := strings.ToUpper(strings.TrimSpace(api.Method))
	if method == "" {
		method = "GET"
	}
	req.Kind = "http"
	req.Method = method
	req.HeaderList = apizzaHeaderRows(api.HeaderParams)
	req.AuthType, req.AuthToken, req.AuthUser, req.AuthPass = apizzaAuthFromHeaders(req.HeaderList)
	if req.AuthType != "none" {
		req.HeaderList = dropAuthHeader(req.HeaderList)
	}
	req.URL = apizzaHTTPURL(rawURL, api.QueryParams)
	req.BodyType, req.Body, req.FormList = convertApizzaHTTPBody(api)
	req.Name = requestNameFromURL(req.Method, req.URL)
	if req.Title == "" {
		req.Title = req.Name
	}
	return req, true
}

func apizzaIsSocket(api apizzaAPI) bool {
	t := strings.ToLower(strings.TrimSpace(api.Type))
	if t == "socket" || t == "websocket" || t == "ws" || t == "wss" {
		return true
	}
	m := strings.ToUpper(strings.TrimSpace(api.Method))
	if m == "WS" || m == "WSS" || m == "WEBSOCKET" {
		return true
	}
	u := strings.ToLower(strings.TrimSpace(api.URL))
	return strings.HasPrefix(u, "ws://") || strings.HasPrefix(u, "wss://")
}

func apizzaPickBody(raw, example string) string {
	raw = strings.TrimSpace(raw)
	example = strings.TrimSpace(example)
	rawJSON := looksLikeJSON(raw)
	exJSON := looksLikeJSON(example)
	if rawJSON && exJSON {
		if sameApizzaCmd(raw, example) {
			return raw
		}
		return example
	}
	if exJSON {
		return example
	}
	if rawJSON {
		return raw
	}
	if example != "" {
		return example
	}
	return raw
}

func sameApizzaCmd(a, b string) bool {
	ka := apizzaCmdKey(a)
	kb := apizzaCmdKey(b)
	if ka == "" || kb == "" {
		return ka == kb
	}
	return ka == kb
}

func apizzaCmdKey(body string) string {
	var obj map[string]any
	if json.Unmarshal([]byte(body), &obj) != nil {
		return ""
	}
	top := firstJSONString(obj, "cmd", "type", "action", "op", "event", "venus", "janus", "request")
	var nested string
	if inner, ok := obj["content"].(map[string]any); ok {
		nested = firstJSONString(inner, "request", "cmd", "type", "action", "op", "event")
	}
	if inner, ok := obj["body"].(map[string]any); ok && nested == "" {
		nested = firstJSONString(inner, "request", "cmd", "type", "action", "op", "event")
	}
	if nested == "" {
		if _, hasType := obj["type"]; hasType {
			nested = firstJSONString(obj, "action")
		}
	}
	if top != "" && nested != "" && top != nested {
		return top + "/" + nested
	}
	if nested != "" {
		return nested
	}
	return top
}

func firstJSONString(obj map[string]any, keys ...string) string {
	for _, k := range keys {
		switch v := obj[k].(type) {
		case string:
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		case float64:
			return strings.TrimSpace(fmt.Sprint(v))
		case json.Number:
			return strings.TrimSpace(v.String())
		}
	}
	return ""
}

func apizzaWSName(title, body string) string {
	if k := apizzaCmdKey(body); k != "" && !strings.ContainsAny(k, " \t") && len([]rune(k)) <= 40 {
		return clipRunes(k, 80)
	}
	if title != "" {
		return clipRunes(title, 80)
	}
	return "新消息"
}

func apizzaBodyKind(body, rawType string) string {
	if looksLikeJSON(body) {
		return "json"
	}
	t := strings.ToLower(strings.TrimSpace(rawType))
	if t == "json" || t == "application/json" {
		return "json"
	}
	if strings.TrimSpace(body) == "" {
		return "none"
	}
	return "text"
}

func parseApizzaEnvVars(raw json.RawMessage) []HeaderItem {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var rows []apizzaEnvKV
	if json.Unmarshal(raw, &rows) != nil {
		var s string
		if json.Unmarshal(raw, &s) != nil || json.Unmarshal([]byte(s), &rows) != nil {
			return nil
		}
	}
	out := make([]HeaderItem, 0, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		out = append(out, HeaderItem{Key: key, Value: row.Value, Enabled: true})
	}
	return out
}

func apizzaHostFromVars(rows []HeaderItem) string {
	vars := map[string]string{}
	for _, row := range rows {
		if k := strings.TrimSpace(row.Key); k != "" {
			vars[k] = row.Value
		}
	}
	if u := strings.TrimSpace(vars["host"]); u != "" && hasURLScheme(u) {
		return u
	}
	return hostFromBaseVars(vars)
}

func apizzaHeaderRows(list []apizzaParam) []HeaderItem {
	out := make([]HeaderItem, 0, len(list))
	for _, row := range list {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		val := row.Value
		if val == "" {
			val = row.Eg
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   val,
			Enabled: row.Checked != 0,
		})
	}
	return out
}

func apizzaAuthFromHeaders(list []HeaderItem) (typ, token, user, pass string) {
	for _, h := range list {
		if !strings.EqualFold(h.Key, "Authorization") {
			continue
		}
		v := strings.TrimSpace(h.Value)
		low := strings.ToLower(v)
		if strings.HasPrefix(low, "bearer ") {
			return "bearer", strings.TrimSpace(v[7:]), "", ""
		}
		if strings.HasPrefix(low, "basic ") {
			return "basic", "", "", ""
		}
	}
	return "none", "", "", ""
}

func dropAuthHeader(list []HeaderItem) []HeaderItem {
	out := list[:0:len(list)]
	for _, h := range list {
		if strings.EqualFold(h.Key, "Authorization") {
			continue
		}
		out = append(out, h)
	}
	return out
}

func apizzaHTTPURL(raw string, query []apizzaParam) string {
	raw = strings.TrimSpace(raw)
	var parts []string
	for _, row := range query {
		if row.Checked == 0 {
			continue
		}
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		val := row.Value
		if val == "" {
			val = row.Eg
		}
		if queryHasKey(raw, key) {
			continue
		}
		parts = append(parts, urlQueryEscape(key)+"="+urlQueryEscape(val))
	}
	if len(parts) == 0 {
		return raw
	}
	sep := "?"
	if strings.Contains(raw, "?") {
		sep = "&"
	}
	return raw + sep + strings.Join(parts, "&")
}

func queryHasKey(raw, key string) bool {
	i := strings.Index(raw, "?")
	if i < 0 {
		return false
	}
	q := raw[i+1:]
	if j := strings.Index(q, "#"); j >= 0 {
		q = q[:j]
	}
	for _, part := range strings.Split(q, "&") {
		k, _, _ := strings.Cut(part, "=")
		if strings.EqualFold(k, key) {
			return true
		}
	}
	return false
}

func convertApizzaHTTPBody(api apizzaAPI) (typ, raw string, form []HeaderItem) {
	mode := strings.ToLower(strings.TrimSpace(api.BodyType))
	body := apizzaPickBody(api.BodyRaw, api.BodyRawExample)
	switch mode {
	case "form-data", "formdata", "x-www-form-urlencoded", "urlencoded":
		rows := apizzaFormRows(api.BodyParams)
		if len(rows) > 0 {
			return "form", "", rows
		}
		if looksLikeJSON(body) {
			return "json", body, nil
		}
		if body != "" {
			return "text", body, nil
		}
		if methodOmitsBody(api.Method) {
			return "none", "", nil
		}
		return "form", "", nil
	case "json", "application/json":
		return "json", body, nil
	case "raw", "text", "xml", "html":
		if looksLikeJSON(body) {
			return "json", body, nil
		}
		if body == "" && methodOmitsBody(api.Method) {
			return "none", "", nil
		}
		return "text", body, nil
	case "none", "no", "":
		if looksLikeJSON(body) {
			return "json", body, nil
		}
		if body != "" {
			return "text", body, nil
		}
		if methodOmitsBody(api.Method) {
			return "none", "", nil
		}
		return "json", "", nil
	default:
		if looksLikeJSON(body) {
			return "json", body, nil
		}
		if body != "" {
			return "text", body, nil
		}
		if methodOmitsBody(api.Method) {
			return "none", "", nil
		}
		return "json", "", nil
	}
}

func apizzaFormRows(list []apizzaParam) []HeaderItem {
	out := make([]HeaderItem, 0, len(list))
	for _, row := range list {
		key := strings.TrimSpace(row.Key)
		if key == "" || strings.Contains(key, ".") {
			continue
		}
		val := row.Value
		if val == "" {
			val = row.Eg
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   val,
			Enabled: row.Checked != 0,
		})
	}
	return out
}

func htmlToPlain(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			b.WriteByte(' ')
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	s = html.UnescapeString(b.String())
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return r == '\n' || r == '\r'
	})
	out := make([]string, 0, len(fields))
	for _, line := range fields {
		line = strings.TrimSpace(strings.Map(func(r rune) rune {
			if unicode.IsSpace(r) {
				return ' '
			}
			return r
		}, line))
		if line != "" {
			out = append(out, line)
		}
	}
	return clipRunes(strings.Join(out, " "), 200)
}
