package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const sampleApizzaProject = `{
  "project_info": {"id":"p1","name":"小京测试"},
  "categorys": [
    {
      "id":"c1","name":"接口","parent_category_id":"",
      "api_list": [
        {
          "id":"a1","name":"login","method":"WS","url":"{{host}}","type":"socket",
          "header_params":[],"query_params":[],
          "body_raw":"{\"transaction_id\":\"1\",\"type\":\"login\",\"content\":{\"account\":\"a\"}}",
          "body_raw_example":"{\"transaction_id\":\"2\",\"type\":\"login\",\"content\":{\"account\":\"b\"}}",
          "raw_content_type":"Text","body_type":"form-data",
          "response_doc":"<p>openim 的 ws 地址</p>"
        },
        {
          "id":"a2","name":"repository_list","method":"WS","url":"{{host}}","type":"socket",
          "body_raw":"{\"transaction_id\":\"1\",\"type\":\"login\"}",
          "body_raw_example":"{\"transaction_id\":\"3\",\"type\":\"repository\",\"action\":\"list\"}",
          "raw_content_type":"Text","body_type":"form-data","response_doc":""
        }
      ],
      "sub_categorys": [
        {
          "id":"c2","name":"meeting","parent_category_id":"c1",
          "api_list": [
            {
              "id":"a3","name":"list","method":"WS","url":"{{host}}","type":"socket",
              "body_raw":"","body_raw_example":"{\"type\":\"meeting\",\"action\":\"list\"}",
              "raw_content_type":"Text","body_type":"form-data","response_doc":""
            }
          ],
          "sub_categorys": []
        }
      ]
    }
  ],
  "envirnments": [
    {"id":"1","name":"208.29环境","content_json":[{"key":"host","value":"ws://106.120.208.29:10020/imcp"}]},
    {"id":"2","name":"86.198","content_json":[{"key":"host","value":"ws://10.100.86.198:10020/imcp"}]}
  ]
}`

func TestIsApizzaProject(t *testing.T) {
	if !isApizzaProject([]byte(sampleApizzaProject)) {
		t.Fatal("sample should detect")
	}
	if isApizzaProject([]byte(samplePostmanV21)) {
		t.Fatal("postman should not detect")
	}
	if isApizzaProject([]byte(`{"requests":[{"id":"x","name":"GET /a"}]}`)) {
		t.Fatal("native catalog should not detect")
	}
}

func TestParseApizzaProject(t *testing.T) {
	p, err := parseApizzaProject([]byte(sampleApizzaProject))
	if err != nil {
		t.Fatal(err)
	}
	if p.Project != "小京测试" {
		t.Fatalf("project=%q", p.Project)
	}
	if p.URL != "ws://106.120.208.29:10020/imcp" {
		t.Fatalf("url=%q", p.URL)
	}
	if p.ActiveEnv != "208.29环境" || len(p.Environments) != 2 {
		t.Fatalf("envs=%#v active=%q", p.Environments, p.ActiveEnv)
	}
	if len(p.Requests) != 3 {
		t.Fatalf("requests=%d %#v", len(p.Requests), p.Requests)
	}
	login := p.Requests[0]
	if login.ID != "" {
		t.Fatalf("id should be empty: %q", login.ID)
	}
	if login.Kind != "ws" || login.Title != "login" || login.URL != "{{host}}" {
		t.Fatalf("login=%+v", login)
	}
	if login.Module != "接口" {
		t.Fatalf("login module=%q", login.Module)
	}
	if !strings.Contains(login.Body, `"type":"login"`) || !strings.Contains(login.Body, `"account":"a"`) {
		t.Fatalf("login should keep last raw of same cmd: %s", login.Body)
	}
	if login.Description != "openim 的 ws 地址" {
		t.Fatalf("desc=%q", login.Description)
	}
	repo := p.Requests[1]
	if repo.Title != "repository_list" || !strings.Contains(repo.Body, `"type":"repository"`) {
		t.Fatalf("repo leftover raw should lose to example: %+v", repo)
	}
	meet := p.Requests[2]
	if meet.Module != "接口 / meeting" || meet.Name != "meeting/list" {
		t.Fatalf("meet=%+v", meet)
	}
	if len(p.Modules) != 2 || p.Modules[0] != "接口" || p.Modules[1] != "接口 / meeting" {
		t.Fatalf("modules=%#v", p.Modules)
	}
}

func TestParseImportFileRoutesApizza(t *testing.T) {
	p, err := parseImportFile([]byte(sampleApizzaProject))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 3 || p.Requests[0].Title != "login" {
		t.Fatalf("routed=%#v", p.Requests)
	}
}

func TestSplitImportByHostApizzaKeepsPath(t *testing.T) {
	src, err := parseApizzaProject([]byte(sampleApizzaProject))
	if err != nil {
		t.Fatal(err)
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "ws://106.120.208.29:10020" {
		t.Fatalf("hosts=%#v", namesOf(got))
	}
	if got[0].URL != "ws://106.120.208.29:10020/imcp" {
		t.Fatalf("profile url lost path: %q", got[0].URL)
	}
	if len(got[0].Requests) != 3 {
		t.Fatalf("reqs=%d", len(got[0].Requests))
	}
	if got[0].Requests[0].URL != "ws://106.120.208.29:10020/imcp" {
		t.Fatalf("rewritten=%q", got[0].Requests[0].URL)
	}
	if got[0].ActiveEnv != "208.29环境" || len(got[0].Environments) != 2 {
		t.Fatalf("active=%q envs=%#v", got[0].ActiveEnv, got[0].Environments)
	}
	if got[0].Project != "小京测试" {
		t.Fatalf("project=%q", got[0].Project)
	}
}

func TestApplyImportedFileApizza(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	merged, err := a.applyImportedFile([]byte(sampleApizzaProject))
	if err != nil {
		t.Fatal(err)
	}
	if merged == nil || merged.Name != "ws://106.120.208.29:10020" {
		t.Fatalf("focused=%+v", merged)
	}
	if merged.URL != "ws://106.120.208.29:10020/imcp" {
		t.Fatalf("url=%q", merged.URL)
	}
	if len(merged.Requests) != 3 || merged.Requests[0].Kind != "ws" {
		t.Fatalf("reqs=%#v", merged.Requests)
	}
	if merged.ActiveEnv != "208.29环境" || len(merged.Environments) != 2 {
		t.Fatalf("envs=%#v", merged.Environments)
	}
	if merged.Project != "小京测试" {
		t.Fatalf("project=%q", merged.Project)
	}
	list := a.GetProfiles()
	if len(list) != 1 || list[0].Name != "ws://106.120.208.29:10020" {
		t.Fatalf("profiles=%#v", namesOf(list))
	}
	if len(list[0].Requests) != 3 || len(list[0].Environments) != 2 {
		t.Fatalf("catalog=%+v", list[0])
	}
}

func TestParseApizzaXiaojingFile(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("build", "bin", "小京2.0管控.apizza-project.json"))
	if err != nil {
		t.Skip(err)
	}
	p, err := parseApizzaProject(raw)
	if err != nil {
		t.Fatal(err)
	}
	if p.URL != "ws://106.120.208.29:10020/imcp" {
		t.Fatalf("url=%q", p.URL)
	}
	if p.Project != "小京2.0管控" {
		t.Fatalf("project=%q", p.Project)
	}
	if len(p.Requests) < 50 {
		t.Fatalf("too few requests: %d", len(p.Requests))
	}
	for _, r := range p.Requests {
		if r.Kind != "ws" {
			t.Fatalf("expected ws: %+v", r)
		}
		if r.Title == "" {
			t.Fatalf("empty title: %+v", r)
		}
	}
	if len(p.Environments) != 3 {
		t.Fatalf("envs=%#v", p.Environments)
	}
}
