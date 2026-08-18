package main

import (
	"strings"
	"testing"
)

const samplePostmanV21 = `{
  "info": {
    "name": "商店 API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "用户",
      "item": [
        {
          "name": "登录",
          "item": [
            {
              "name": "密码登录",
              "request": {
                "method": "POST",
                "header": [
                  {"key": "X-App", "value": "desk", "disabled": false},
                  {"key": "Authorization", "value": "Bearer skip-me"},
                  {"key": "X-Off", "value": "no", "disabled": true}
                ],
                "auth": {
                  "type": "bearer",
                  "bearer": [{"key": "token", "value": "{{Token}}"}]
                },
                "body": {
                  "mode": "raw",
                  "raw": "{\"u\":1}",
                  "options": {"raw": {"language": "json"}}
                },
                "url": {
                  "raw": "{{baseUrl}}/login?src=app",
                  "host": ["{{baseUrl}}"],
                  "path": ["login"],
                  "query": [{"key": "src", "value": "app"}]
                },
                "description": {"content": "用账号密码登录", "type": "text/plain"}
              }
            }
          ]
        }
      ]
    },
    {
      "name": "健康检查",
      "request": "https://example.com/health"
    },
    {
      "name": "空文件夹",
      "item": []
    }
  ],
  "variable": [
    {"key": "baseUrl", "value": "https://example.com", "type": "string"},
    {"key": "Token", "value": "abc", "disabled": false},
    {"key": "", "value": "skip"},
    {"key": "Old", "value": "x", "disabled": true}
  ]
}`

func TestIsPostmanCollection(t *testing.T) {
	if !isPostmanCollection([]byte(samplePostmanV21)) {
		t.Fatal("v2.1 should detect")
	}
	if isPostmanCollection([]byte(`{"requests":[{"id":"x","name":"GET /a"}],"modules":["A"]}`)) {
		t.Fatal("native catalog should not detect")
	}
	if isPostmanCollection([]byte(`{"info":{"name":"x"},"paths":{}}`)) {
		t.Fatal("openapi-like should not detect")
	}
	wrapped := `{"collection":` + samplePostmanV21 + `}`
	if !isPostmanCollection([]byte(wrapped)) {
		t.Fatal("wrapped collection should detect")
	}
}

func TestParsePostmanCollection(t *testing.T) {
	p, err := parsePostmanCollection([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 2 {
		t.Fatalf("requests=%d %#v", len(p.Requests), p.Requests)
	}
	login := p.Requests[0]
	if login.ID != "" {
		t.Fatalf("postman id should be empty: %q", login.ID)
	}
	if p.Project != "商店 API" {
		t.Fatalf("project=%q", p.Project)
	}
	if login.Title != "密码登录" || login.Name != "POST /login" {
		t.Fatalf("login name=%q title=%q", login.Name, login.Title)
	}
	if login.Module != "用户 / 登录" {
		t.Fatalf("module=%q", login.Module)
	}
	if login.Method != "POST" || login.URL != "{{baseUrl}}/login?src=app" {
		t.Fatalf("url=%q method=%q", login.URL, login.Method)
	}
	if login.AuthType != "bearer" || login.AuthToken != "{{Token}}" {
		t.Fatalf("auth=%s %q", login.AuthType, login.AuthToken)
	}
	if login.BodyType != "json" || login.Body != `{"u":1}` {
		t.Fatalf("body=%q type=%q", login.Body, login.BodyType)
	}
	if login.Description != "用账号密码登录" {
		t.Fatalf("desc=%q", login.Description)
	}
	if len(login.HeaderList) != 2 {
		t.Fatalf("headers=%#v", login.HeaderList)
	}
	if login.HeaderList[0].Key != "X-App" || login.HeaderList[0].Value != "desk" || !login.HeaderList[0].Enabled {
		t.Fatalf("header0=%+v", login.HeaderList[0])
	}
	if login.HeaderList[1].Key != "X-Off" || login.HeaderList[1].Enabled {
		t.Fatalf("header1=%+v", login.HeaderList[1])
	}
	health := p.Requests[1]
	if health.Title != "健康检查" || health.Method != "GET" || health.URL != "https://example.com/health" {
		t.Fatalf("health=%+v", health)
	}
	if health.Module != "" || health.BodyType != "none" {
		t.Fatalf("health module/body=%q %q", health.Module, health.BodyType)
	}
	if len(p.Modules) != 3 || p.Modules[0] != "用户" || p.Modules[1] != "用户 / 登录" || p.Modules[2] != "空文件夹" {
		t.Fatalf("modules=%#v", p.Modules)
	}
	if len(p.Environments) != 1 || p.Environments[0].Name != "商店 API" {
		t.Fatalf("envs=%#v", p.Environments)
	}
	vars := p.Environments[0].Variables
	if len(vars) != 3 || vars[0].Key != "baseUrl" || vars[1].Key != "Token" || vars[2].Key != "Old" || vars[2].Enabled {
		t.Fatalf("vars=%#v", vars)
	}
}

func TestParseImportFileRoutesPostman(t *testing.T) {
	p, err := parseImportFile([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 2 || p.Requests[0].Title != "密码登录" {
		t.Fatalf("routed=%#v", p.Requests)
	}
	native, err := parseImportFile([]byte(`{"requests":[{"id":"x","name":"GET /a"}],"modules":["A"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(native.Requests) != 1 || native.Requests[0].ID != "x" {
		t.Fatalf("native=%#v", native)
	}
}

func TestMergePostmanDoesNotOverwriteIDs(t *testing.T) {
	dst := Profile{
		Modules: []string{"登录"},
		Requests: []SavedRequest{
			{ID: "keep", Name: "GET /login", Title: "本地登录", Module: "登录", Method: "GET", URL: "https://example.com/login"},
		},
		ActiveEnv: "默认",
		Environments: []Environment{
			{Name: "默认", Variables: []HeaderItem{{Key: "Token", Value: "old", Enabled: true}}},
		},
	}
	src, err := parsePostmanCollection([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	got := mergeImportedCatalog(dst, src)
	if len(got.Requests) != 3 {
		t.Fatalf("requests=%d %#v", len(got.Requests), got.Requests)
	}
	if got.Requests[0].ID != "keep" || got.Requests[0].Title != "本地登录" || got.Requests[0].Method != "GET" {
		t.Fatalf("overwrote local: %+v", got.Requests[0])
	}
	if got.Requests[1].ID == "" || got.Requests[1].Title != "密码登录" {
		t.Fatalf("appended login=%+v", got.Requests[1])
	}
	if got.Requests[2].Title != "健康检查" {
		t.Fatalf("appended health=%+v", got.Requests[2])
	}
	if got.ActiveEnv != "默认" {
		t.Fatalf("active=%q", got.ActiveEnv)
	}
	if len(got.Environments) != 2 || got.Environments[1].Name != "商店 API" {
		t.Fatalf("envs=%#v", got.Environments)
	}
	if got.VariableList[0].Value != "old" {
		t.Fatalf("active vars changed: %#v", got.VariableList)
	}
	wantMods := []string{"登录", "用户", "用户 / 登录", "空文件夹"}
	if strings.Join(got.Modules, ",") != strings.Join(wantMods, ",") {
		t.Fatalf("modules=%#v", got.Modules)
	}
}

func TestPostmanBodyAndAuthVariants(t *testing.T) {
	raw := `{
	  "info": {"name": "变体", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
	  "item": [
	    {
	      "name": "表单",
	      "request": {
	        "method": "POST",
	        "url": "https://example.com/form",
	        "auth": {"type": "basic", "basic": [
	          {"key": "username", "value": "u"},
	          {"key": "password", "value": "p"}
	        ]},
	        "body": {"mode": "urlencoded", "urlencoded": [
	          {"key": "a", "value": "1"},
	          {"key": "b", "value": "2", "disabled": true}
	        ]}
	      }
	    },
	    {
	      "name": "上传",
	      "request": {
	        "method": "POST",
	        "url": {"raw": ""},
	        "body": {"mode": "formdata", "formdata": [
	          {"key": "note", "value": "hi", "type": "text"},
	          {"key": "file", "src": "a.bin", "type": "file"}
	        ]}
	      }
	    },
	    {
	      "name": "查询",
	      "request": {
	        "method": "GET",
	        "url": {
	          "protocol": "https",
	          "host": ["api", "example", "com"],
	          "path": ["v1", "ping"],
	          "query": [
	            {"key": "q", "value": "ok"},
	            {"key": "x", "value": "no", "disabled": true}
	          ]
	        }
	      }
	    },
	    {
	      "name": "GQL",
	      "request": {
	        "method": "POST",
	        "url": "https://example.com/graphql",
	        "body": {
	          "mode": "graphql",
	          "graphql": {"query": "query { me }", "variables": "{\"id\":1}"}
	        }
	      }
	    }
	  ]
	}`
	p, err := parsePostmanCollection([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 4 {
		t.Fatalf("requests=%d", len(p.Requests))
	}
	form := p.Requests[0]
	if form.AuthType != "basic" || form.AuthUser != "u" || form.AuthPass != "p" {
		t.Fatalf("basic=%+v", form)
	}
	if form.BodyType != "form" || len(form.FormList) != 2 || form.FormList[1].Enabled {
		t.Fatalf("form=%#v", form.FormList)
	}
	upload := p.Requests[1]
	if upload.BodyType != "form" || len(upload.FormList) != 1 || upload.FormList[0].Key != "note" {
		t.Fatalf("formdata=%#v", upload.FormList)
	}
	if upload.Name != "POST /" {
		t.Fatalf("empty url name=%q", upload.Name)
	}
	q := p.Requests[2]
	if q.URL != "https://api.example.com/v1/ping?q=ok" || q.Name != "GET /v1/ping" || q.BodyType != "none" {
		t.Fatalf("built url=%q name=%q type=%q", q.URL, q.Name, q.BodyType)
	}
	gql := p.Requests[3]
	if gql.BodyType != "json" || !strings.Contains(gql.Body, `"query":"query { me }"`) || !strings.Contains(gql.Body, `"id":1`) {
		t.Fatalf("gql=%q", gql.Body)
	}
}

func TestParsePostmanRejectsEmpty(t *testing.T) {
	if _, err := parsePostmanCollection([]byte(`{"foo":1}`)); err == nil {
		t.Fatal("should reject")
	}
	if _, err := parseImportFile(nil); err == nil {
		t.Fatal("empty should fail")
	}
}
