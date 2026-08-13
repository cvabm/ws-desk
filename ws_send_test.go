package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func startWSServer(t *testing.T) (wsURL string, received chan string) {
	t.Helper()
	received = make(chan string, 4)
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		received <- string(data)
	}))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http"), received
}

func TestSendWithoutConnectFails(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if err := c.Send(`{"a":1}`); err == nil {
		t.Fatal("expected error")
	}
}

func TestSendWaitsForConnect(t *testing.T) {
	wsURL, received := startWSServer(t)
	c := newWSClient(&App{baseDir: t.TempDir()})
	t.Cleanup(c.Disconnect)

	if err := c.Connect(ConnectOptions{URL: wsURL, Reconnect: false, PingSec: 0}); err != nil {
		t.Fatal(err)
	}
	if err := c.Send(`{"cmd":"ping"}`); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-received:
		if got != `{"cmd":"ping"}` {
			t.Fatalf("got=%q", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("server did not receive message")
	}

	var sawOut bool
	for _, m := range c.Messages(0, 50) {
		if m.Dir == "out" && m.Text == `{"cmd":"ping"}` {
			sawOut = true
		}
	}
	if !sawOut {
		t.Fatal("missing out message")
	}
}

func TestSendEmptyStillFails(t *testing.T) {
	c := newWSClient(&App{baseDir: t.TempDir()})
	if err := c.Send(""); err == nil {
		t.Fatal("expected error")
	}
}
