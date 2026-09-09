package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeEnvironmentsWithoutListIsEmpty(t *testing.T) {
	envs, active := normalizeEnvironments(nil, "", []HeaderItem{
		{Key: "Token", Value: "abc", Enabled: true},
		{Key: "  ", Value: "skip", Enabled: true},
	})
	if active != "" || len(envs) != 0 {
		t.Fatalf("envs=%#v active=%q", envs, active)
	}
}

func TestNormalizeEnvironmentsKeepsActive(t *testing.T) {
	envs, active := normalizeEnvironments([]Environment{
		{Name: "开发", Variables: []HeaderItem{{Key: "Token", Value: "dev", Enabled: true}}},
		{Name: " 开发 ", Variables: []HeaderItem{{Key: "Extra", Value: "x", Enabled: true}}},
		{Name: "正式", Variables: []HeaderItem{{Key: "Token", Value: "prod", Enabled: true}}},
	}, "正式", nil)
	if active != "正式" || len(envs) != 2 {
		t.Fatalf("envs=%#v active=%q", envs, active)
	}
	if len(envs[0].Variables) != 2 || envs[0].Variables[1].Key != "Extra" {
		t.Fatalf("merged dup name = %#v", envs[0].Variables)
	}
}

func TestMergeEnvironmentsByName(t *testing.T) {
	dst := []Environment{
		{Name: "开发", Variables: []HeaderItem{
			{Key: "Token", Value: "dev", Enabled: true},
			{Key: "Host", Value: "a", Enabled: true},
		}},
		{Name: "正式", Variables: []HeaderItem{{Key: "Token", Value: "prod", Enabled: true}}},
	}
	src := []Environment{
		{Name: "开发", Variables: []HeaderItem{{Key: "Token", Value: "dev2", Enabled: true}}},
		{Name: "测试", Variables: []HeaderItem{{Key: "Token", Value: "test", Enabled: true}}},
	}
	got := mergeEnvironments(dst, src)
	if len(got) != 3 || got[0].Name != "开发" || got[1].Name != "正式" || got[2].Name != "测试" {
		t.Fatalf("envs=%#v", got)
	}
	if len(got[0].Variables) != 2 || got[0].Variables[0].Value != "dev2" || got[0].Variables[1].Value != "a" {
		t.Fatalf("dev vars=%#v", got[0].Variables)
	}
	if got[1].Variables[0].Value != "prod" {
		t.Fatalf("prod overwritten: %#v", got[1].Variables)
	}
}

func TestMergeImportedEnvironmentsKeepsActive(t *testing.T) {
	dst := Profile{
		URL:       "https://example.com/a",
		ActiveEnv: "开发",
		Environments: []Environment{
			{Name: "开发", Variables: []HeaderItem{{Key: "Token", Value: "dev", Enabled: true}}},
			{Name: "正式", Variables: []HeaderItem{{Key: "Token", Value: "prod", Enabled: true}}},
		},
		VariableList: []HeaderItem{{Key: "Token", Value: "dev", Enabled: true}},
	}
	src := Profile{
		Environments: []Environment{
			{Name: "开发", Variables: []HeaderItem{{Key: "Token", Value: "dev2", Enabled: true}}},
			{Name: "测试", Variables: []HeaderItem{{Key: "Token", Value: "test", Enabled: true}}},
		},
	}
	got := mergeImportedCatalog(dst, src)
	if got.ActiveEnv != "开发" {
		t.Fatalf("active=%q", got.ActiveEnv)
	}
	if len(got.Environments) != 3 {
		t.Fatalf("envs=%#v", got.Environments)
	}
	if got.VariableList[0].Value != "dev2" {
		t.Fatalf("active vars=%#v", got.VariableList)
	}
	if got.Environments[2].Name != "测试" {
		t.Fatalf("missing imported env: %#v", got.Environments)
	}
}

func TestProfileCanHaveNoEnvironments(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := a.SaveProfile(Profile{
		URL:          "https://example.com/a",
		Environments: []Environment{},
		VariableList: []HeaderItem{},
	}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles=%d", len(got))
	}
	if len(got[0].Environments) != 0 || got[0].ActiveEnv != "" {
		t.Fatalf("empty environments not preserved: %#v active=%q", got[0].Environments, got[0].ActiveEnv)
	}
}

func TestProfileKeepsEnvironments(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:       "https://example.com/a",
		ActiveEnv: "正式",
		Environments: []Environment{
			{Name: "开发", Variables: []HeaderItem{{Key: "Token", Value: "dev", Enabled: true}}},
			{Name: "正式", Variables: []HeaderItem{{Key: "Token", Value: "prod", Enabled: true}}},
		},
	}); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{
		URL:          "https://example.com/b",
		Method:       "POST",
		VariableList: []HeaderItem{{Key: "Token", Value: "prod2", Enabled: true}},
		Requests: []SavedRequest{{
			Name: "GET /login", URL: "https://example.com/login", Method: "GET",
		}},
	}); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles=%d", len(got))
	}
	if got[0].ActiveEnv != "正式" || len(got[0].Environments) != 2 {
		t.Fatalf("envs=%#v active=%q", got[0].Environments, got[0].ActiveEnv)
	}
	if got[0].VariableList[0].Value != "prod2" {
		t.Fatalf("active vars=%#v", got[0].VariableList)
	}
	if got[0].Environments[0].Variables[0].Value != "dev" {
		t.Fatalf("other env changed: %#v", got[0].Environments[0])
	}
}
