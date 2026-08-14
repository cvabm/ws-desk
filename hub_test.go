package main

import "testing"

func TestHubIsolatesProfiles(t *testing.T) {
	app := &App{baseDir: t.TempDir()}
	h := newClientHub(app)
	t.Cleanup(h.DisconnectAll)

	a, err := h.forURL("ws://10.0.0.1/a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := h.forURL("ws://10.0.0.2/b")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("expected separate clients")
	}

	a.wantOpen.Store(true)
	if _, err := h.RecordWS(ConnectOptions{URL: "ws://10.0.0.2/b"}, `{"x":1}`, `{"y":2}`); err != nil {
		t.Fatal(err)
	}
	if !a.wantOpen.Load() {
		t.Fatal("recording B should not drop A")
	}
	if n := len(a.Messages(0, 50)); n != 0 {
		t.Fatalf("A should stay empty, got %d", n)
	}
	if n := len(b.Messages(0, 50)); n == 0 {
		t.Fatal("B should have recorded messages")
	}

	h.Select("ws://10.0.0.1")
	if n := len(h.Messages(0, 50)); n != 0 {
		t.Fatalf("active A msgs=%d", n)
	}
	h.Select("ws://10.0.0.2")
	if n := len(h.Messages(0, 50)); n == 0 {
		t.Fatal("active B should show its messages")
	}
}

func TestHubHTTPDoesNotDropWS(t *testing.T) {
	app := &App{baseDir: t.TempDir()}
	h := newClientHub(app)
	t.Cleanup(h.DisconnectAll)
	ws, err := h.forURL("ws://10.0.0.1/ws")
	if err != nil {
		t.Fatal(err)
	}
	ws.wantOpen.Store(true)
	if _, err := h.RecordHTTP(HTTPExchange{URL: "http://10.0.0.1/ping"}); err != nil {
		t.Fatal(err)
	}
	if !ws.wantOpen.Load() {
		t.Fatal("http record should not drop the other websocket")
	}
}

func TestHubRemoveDisconnectsOnlyThatProfile(t *testing.T) {
	app := &App{baseDir: t.TempDir()}
	h := newClientHub(app)
	t.Cleanup(h.DisconnectAll)
	a, _ := h.forURL("ws://10.0.0.1/a")
	b, _ := h.forURL("ws://10.0.0.2/b")
	a.wantOpen.Store(true)
	b.wantOpen.Store(true)
	h.Remove("ws://10.0.0.1")
	if a.wantOpen.Load() {
		t.Fatal("removed profile should disconnect")
	}
	if !b.wantOpen.Load() {
		t.Fatal("other profile should stay connected")
	}
}
