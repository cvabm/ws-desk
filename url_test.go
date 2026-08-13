package main

import "testing"

func TestParseDialURL(t *testing.T) {
	tests := []struct {
		raw, fallback, kind, want string
		ok                        bool
	}{
		{"ws://10.0.0.1:8080/x", "", kindWS, "ws://10.0.0.1:8080/x", true},
		{"wss://example.com/ws", "", kindWS, "wss://example.com/ws", true},
		{"http://10.0.0.1:8080/api", "", kindHTTP, "http://10.0.0.1:8080/api", true},
		{"https://example.com/v1", "", kindHTTP, "https://example.com/v1", true},
		{"HTTPS://Example.COM/v1", "", kindHTTP, "https://Example.COM/v1", true},
		{"10.0.0.1:8080/api", "https", kindHTTP, "https://10.0.0.1:8080/api", true},
		{"host/path", "ws", kindWS, "ws://host/path", true},
		{"", "", "", "", false},
		{"ftp://x", "", "", "", false},
		{"http://", "", "", "", false},
	}
	for _, tc := range tests {
		kind, canon, err := parseDialURL(tc.raw, tc.fallback)
		if tc.ok {
			if err != nil {
				t.Fatalf("parseDialURL(%q, %q) err=%v", tc.raw, tc.fallback, err)
			}
			if kind != tc.kind || canon != tc.want {
				t.Fatalf("parseDialURL(%q)=(%q,%q) want (%q,%q)", tc.raw, kind, canon, tc.kind, tc.want)
			}
		} else if err == nil {
			t.Fatalf("parseDialURL(%q) expected error, got %q %q", tc.raw, kind, canon)
		}
	}
}

func TestNormalizeHTTPMethod(t *testing.T) {
	if got := normalizeHTTPMethod("", ""); got != "GET" {
		t.Fatalf("empty -> %s", got)
	}
	if got := normalizeHTTPMethod("", `{"a":1}`); got != "POST" {
		t.Fatalf("body -> %s", got)
	}
	if got := normalizeHTTPMethod("patch", ""); got != "PATCH" {
		t.Fatalf("patch -> %s", got)
	}
}

func TestHasURLScheme(t *testing.T) {
	if !hasURLScheme("https://x") || !hasURLScheme("ws://x") {
		t.Fatal("expected schemes")
	}
	if hasURLScheme("10.0.0.1:8080") || hasURLScheme("//host/path") {
		t.Fatal("should not treat as scheme")
	}
}
