package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCatalogExportFileName(t *testing.T) {
	got := catalogExportFileName("https://uapis.cn")
	if got != "https-uapis.cn-catalog.json" {
		t.Fatalf("name = %q", got)
	}
	if catalogExportFileName("") != "catalog.json" {
		t.Fatalf("empty name = %q", catalogExportFileName(""))
	}
	if catalogBundleFileName() != "apitest-catalogs.json" {
		t.Fatalf("bundle name = %q", catalogBundleFileName())
	}
}

func TestParseCatalogBundle(t *testing.T) {
	list, ok := parseCatalogBundle([]byte(`{
	  "kind": "ws-desk-catalogs",
	  "profiles": [
	    {"name":"https://a.example","url":"https://a.example/x","project":"甲","requests":[{"id":"1","title":"A"}]},
	    {"name":"wss://b.example","url":"wss://b.example/im","project":"乙","requests":[{"id":"2","title":"B"}]}
	  ]
	}`))
	if !ok || len(list) != 2 {
		t.Fatalf("bundle = ok=%v len=%d", ok, len(list))
	}
	if list[0].Project != "甲" || list[1].Name != "wss://b.example" {
		t.Fatalf("profiles = %#v", list)
	}
	if _, ok := parseCatalogBundle([]byte(`{"name":"https://a.example","url":"https://a.example"}`)); ok {
		t.Fatal("single catalog should not parse as bundle")
	}
}

func TestImportCatalogBundle(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := a.applyImportedFile([]byte(`{
	  "kind": "ws-desk-catalogs",
	  "profiles": [
	    {"name":"https://a.example","url":"https://a.example/x","project":"甲","requests":[{"id":"a1","title":"登录","url":"https://a.example/login"}]},
	    {"name":"wss://b.example","url":"wss://b.example/im","project":"乙","requests":[{"id":"b1","title":"心跳","url":"wss://b.example/im"}]}
	  ]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name == "" {
		t.Fatalf("primary = %+v", got)
	}
	list := a.GetProfiles()
	if len(list) != 2 {
		t.Fatalf("profiles = %d %#v", len(list), namesOf(list))
	}
}

func TestMergeImportedCatalog(t *testing.T) {
	dst := Profile{
		Name:    "https://example.com",
		URL:     "https://example.com/keep",
		Method:  "GET",
		Modules: []string{"登录", "用户"},
		Requests: []SavedRequest{
			{ID: "a1", Name: "GET /login", Title: "登录", Module: "登录", Method: "GET", URL: "https://example.com/login"},
			{ID: "a2", Name: "GET /me", Title: "我的", Module: "用户", Method: "GET", URL: "https://example.com/me"},
		},
		VariableList: []HeaderItem{
			{Key: "Token", Value: "old", Enabled: true},
			{Key: "Env", Value: "prod", Enabled: true},
		},
	}
	src := Profile{
		Name:    "https://other.example",
		URL:     "https://other.example/x",
		Modules: []string{"用户", "订单"},
		Requests: []SavedRequest{
			{ID: "a1", Name: "POST /login", Title: "登录-新", Module: "登录", Method: "POST", URL: "https://other.example/login", Body: `{"u":1}`},
			{ID: "b3", Name: "GET /orders", Title: "订单列表", Module: "订单", Method: "GET", URL: "https://other.example/orders"},
			{Name: "GET /anon", Title: "无名", Method: "GET", URL: "https://other.example/anon"},
		},
		VariableList: []HeaderItem{
			{Key: "Token", Value: "new", Enabled: true},
			{Key: "Key", Value: "k", Enabled: false},
			{Key: "  ", Value: "skip", Enabled: true},
		},
	}

	got := mergeImportedCatalog(dst, src)
	if got.URL != "https://example.com/keep" || got.Method != "GET" {
		t.Fatalf("host fields changed: %+v", got)
	}
	if len(got.Requests) != 4 {
		t.Fatalf("requests = %d %#v", len(got.Requests), got.Requests)
	}
	if got.Requests[0].Title != "登录-新" || got.Requests[0].Method != "POST" || got.Requests[0].Body != `{"u":1}` {
		t.Fatalf("id overwrite = %+v", got.Requests[0])
	}
	if got.Requests[1].Title != "我的" {
		t.Fatalf("kept = %+v", got.Requests[1])
	}
	if got.Requests[2].ID != "b3" || got.Requests[2].Title != "订单列表" {
		t.Fatalf("appended = %+v", got.Requests[2])
	}
	if got.Requests[3].ID == "" || got.Requests[3].Title != "无名" {
		t.Fatalf("missing id = %+v", got.Requests[3])
	}
	if len(got.Modules) != 3 || got.Modules[0] != "登录" || got.Modules[1] != "用户" || got.Modules[2] != "订单" {
		t.Fatalf("modules = %#v", got.Modules)
	}
	if len(got.Environments) != 0 || len(got.VariableList) != 0 {
		t.Fatalf("automatic environment = %#v vars=%#v", got.Environments, got.VariableList)
	}
}

func TestMergeImportedCatalogKeepsOrder(t *testing.T) {
	dst := Profile{
		Modules: []string{"B", "A"},
		Requests: []SavedRequest{
			{ID: "2", Name: "GET /b", Title: "B", Module: "B"},
			{ID: "1", Name: "GET /a", Title: "A", Module: "A"},
		},
	}
	src := Profile{
		Modules: []string{"A", "C"},
		Requests: []SavedRequest{
			{ID: "1", Name: "GET /a", Title: "A2", Module: "A"},
			{ID: "3", Name: "GET /c", Title: "C", Module: "C"},
		},
	}
	got := mergeImportedCatalog(dst, src)
	if len(got.Modules) != 3 || got.Modules[0] != "B" || got.Modules[1] != "A" || got.Modules[2] != "C" {
		t.Fatalf("modules = %#v", got.Modules)
	}
	if len(got.Requests) != 3 || got.Requests[0].ID != "2" || got.Requests[1].ID != "1" || got.Requests[2].ID != "3" {
		t.Fatalf("requests = %#v", got.Requests)
	}
	if got.Requests[1].Title != "A2" {
		t.Fatalf("overwrite = %+v", got.Requests[1])
	}
}

func TestParseCatalogFile(t *testing.T) {
	if _, err := parseCatalogFile(nil); err == nil {
		t.Fatal("empty should fail")
	}
	if _, err := parseCatalogFile([]byte("not-json")); err == nil {
		t.Fatal("invalid should fail")
	}
	p, err := parseCatalogFile([]byte(`{"requests":[{"id":"x","name":"GET /a"}],"modules":["A"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 1 || p.Requests[0].ID != "x" || len(p.Modules) != 1 {
		t.Fatalf("parsed = %+v", p)
	}
}

func TestSplitImportByHostUsesFileHost(t *testing.T) {
	src := Profile{
		Name:    "https://other.example",
		URL:     "https://other.example/x",
		Modules: []string{"用户"},
		Requests: []SavedRequest{
			{ID: "n1", Name: "GET /me", Title: "我的", Module: "用户", Method: "GET", URL: "https://other.example/me"},
			{ID: "n2", Name: "GET /rel", Title: "相对", Module: "用户", Method: "GET", URL: "/rel"},
		},
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "https://other.example" {
		t.Fatalf("hosts=%#v", got)
	}
	if len(got[0].Requests) != 2 || got[0].Requests[1].URL != "https://other.example/rel" {
		t.Fatalf("reqs=%#v", got[0].Requests)
	}
}

func TestSplitImportByHostSplitsAndSkipsCurrent(t *testing.T) {
	src := Profile{
		URL: "https://should-not-win.example",
		Requests: []SavedRequest{
			{ID: "a", Name: "GET /a", Title: "A", Method: "GET", URL: "https://a.example/a"},
			{ID: "b", Name: "GET /b", Title: "B", Method: "GET", URL: "https://b.example/b"},
			{ID: "c", Name: "GET /c", Title: "C", Method: "GET", URL: "https://a.example/c"},
		},
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "https://a.example" || got[1].Name != "https://b.example" {
		t.Fatalf("hosts=%#v", namesOf(got))
	}
	if len(got[0].Requests) != 2 || len(got[1].Requests) != 1 {
		t.Fatalf("split=%#v", got)
	}
	if pickPrimaryImport(got).Name != "https://a.example" {
		t.Fatalf("primary=%q", pickPrimaryImport(got).Name)
	}
}

func TestSplitImportByHostPostmanBaseURL(t *testing.T) {
	src, err := parsePostmanCollection([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "https://example.com" {
		t.Fatalf("hosts=%#v", namesOf(got))
	}
	if got[0].Requests[0].URL != "https://example.com/login?src=app" {
		t.Fatalf("rewritten=%q", got[0].Requests[0].URL)
	}
	if got[0].Requests[1].URL != "https://example.com/health" {
		t.Fatalf("health=%q", got[0].Requests[1].URL)
	}
}

func TestSplitImportByHostNeedsURL(t *testing.T) {
	_, err := splitImportByHost(Profile{
		Requests: []SavedRequest{{Name: "GET /x", Title: "X", URL: "{{baseUrl}}/x"}},
	})
	if err == nil {
		t.Fatal("expected missing host")
	}
}

func TestApplyImportedFileDoesNotTouchOtherHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:     "https://current.example/keep",
		Modules: []string{"本地"},
		Requests: []SavedRequest{
			{ID: "cur", Name: "GET /keep", Title: "别动", Module: "本地", URL: "https://current.example/keep", Method: "GET"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	merged, err := a.applyImportedFile([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	if merged == nil || merged.Name != "https://example.com" {
		t.Fatalf("focused=%+v", merged)
	}
	got := a.GetProfiles()
	if len(got) != 2 {
		t.Fatalf("profiles=%d %#v", len(got), namesOf(got))
	}
	var current, shop Profile
	for _, p := range got {
		switch p.Name {
		case "https://current.example":
			current = p
		case "https://example.com":
			shop = p
		}
	}
	if current.URL != "https://current.example/keep" || len(current.Requests) != 1 || current.Requests[0].Title != "别动" {
		t.Fatalf("current touched: %+v", current)
	}
	if len(shop.Requests) != 2 || shop.Requests[0].Title != "密码登录" {
		t.Fatalf("shop=%#v", shop.Requests)
	}
}

func TestSameProjectProfilesMerge(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	reqs := []SavedRequest{
		{ID: "a1", Name: "login", Title: "login", Module: "接口", Kind: "ws", Body: `{"type":"login"}`},
		{ID: "a2", Name: "list", Title: "list", Module: "接口", Kind: "ws", Body: `{"type":"list"}`, Example: `{"ok":true}`},
	}
	if err := a.SaveProfile(Profile{
		URL:     "ws://10.0.0.1:1/imcp",
		Project: "小京",
		Requests: []SavedRequest{
			{ID: "b1", Name: "login", Title: "login", Module: "接口", Kind: "ws", Body: `{"type":"login"}`},
		},
		Environments: []Environment{
			{Name: "A", Variables: []HeaderItem{{Key: "host", Value: "ws://10.0.0.1:1/imcp", Enabled: true}}},
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:          "ws://10.0.0.2:1/imcp",
		Project:      "小京",
		Requests:     reqs,
		Environments: []Environment{{Name: "B", Variables: []HeaderItem{{Key: "host", Value: "ws://10.0.0.2:1/imcp", Enabled: true}}}},
	}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles=%#v", namesOf(got))
	}
	if got[0].Project != "小京" {
		t.Fatalf("project=%q", got[0].Project)
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("reqs=%#v", got[0].Requests)
	}
	if len(got[0].Environments) != 2 {
		t.Fatalf("envs=%#v", got[0].Environments)
	}
}

func namesOf(list []Profile) []string {
	out := make([]string, len(list))
	for i, p := range list {
		out[i] = p.Name
	}
	return out
}

func TestSaveProfileMergesSameProject(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := a.SaveProfile(Profile{URL: "https://one.example", Project: "gateway"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "https://two.example", Project: "gateway"}); err != nil {
		t.Fatal(err)
	}

	profiles := a.GetProfiles()
	if len(profiles) != 1 {
		t.Fatalf("GetProfiles() returned %d profiles, want 1", len(profiles))
	}
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("same-project save created %d files, want 1", len(entries))
	}
}

func TestImportCatalogMergesOnDisk(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:     "https://example.com/a",
		Modules: []string{"登录"},
		Requests: []SavedRequest{
			{ID: "keep", Name: "GET /login", Title: "登录", Module: "登录", URL: "https://example.com/login", Method: "GET"},
		},
		VariableList: []HeaderItem{{Key: "Token", Value: "old", Enabled: true}},
	}); err != nil {
		t.Fatal(err)
	}

	dst, err := a.loadProfileByName("https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	src, err := parseCatalogFile([]byte(`{
	  "name": "https://other.example",
	  "url": "https://other.example/x",
	  "modules": ["用户"],
	  "requests": [
	    {"id":"keep","name":"POST /login","title":"登录改","module":"登录","method":"POST","url":"https://other.example/login"},
	    {"id":"new","name":"GET /me","title":"我的","module":"用户","method":"GET","url":"https://other.example/me"}
	  ],
	  "variableList": [{"key":"Token","value":"new","enabled":true}]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	merged := mergeImportedCatalog(dst, src)
	if err := a.saveProfileFile(merged); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if got[0].URL != "https://example.com/a" {
		t.Fatalf("url overwritten: %q", got[0].URL)
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %#v", got[0].Requests)
	}
	if got[0].Requests[0].Title != "登录改" || got[0].Requests[0].Method != "POST" {
		t.Fatalf("overwrite = %+v", got[0].Requests[0])
	}
	if got[0].Requests[1].ID != "new" {
		t.Fatalf("added = %+v", got[0].Requests[1])
	}
	if len(got[0].Modules) != 2 || got[0].Modules[1] != "用户" {
		t.Fatalf("modules = %#v", got[0].Modules)
	}
	if len(got[0].Environments) != 0 || len(got[0].VariableList) != 0 {
		t.Fatalf("automatic environment = %#v vars=%#v", got[0].Environments, got[0].VariableList)
	}
}
