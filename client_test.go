package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func waitClientState(t *testing.T, c *wsClient, state string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if c.Status().State == state {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("wanted state %s, got %#v", state, c.Status())
}

func newTestWSClient(t *testing.T) *wsClient {
	t.Helper()
	a := NewApp()
	a.baseDir = t.TempDir()
	c := newWSClient(a)
	t.Cleanup(c.Disconnect)
	return c
}

func echoWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	for {
		kind, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if err := conn.WriteMessage(kind, data); err != nil {
			return
		}
	}
}

func TestConcurrentWebSocketSends(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(echoWS))
	t.Cleanup(srv.Close)
	c := newTestWSClient(t)
	if err := c.Connect(ConnectOptions{URL: "ws" + strings.TrimPrefix(srv.URL, "http")}); err != nil {
		t.Fatal(err)
	}
	waitClientState(t, c, "open")
	const count = 32
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := c.Send(fmt.Sprintf("message-%d", i)); err != nil {
				t.Errorf("send: %v", err)
			}
		}(i)
	}
	wg.Wait()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		seen := map[string]bool{}
		for _, msg := range c.Messages(0, 100) {
			if msg.Dir == "in" {
				seen[msg.Text] = true
			}
		}
		if len(seen) == count {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("not all concurrent messages were echoed")
}

func TestWebSocketTLSRequiresExplicitOptIn(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(echoWS))
	t.Cleanup(srv.Close)
	for _, insecure := range []bool{false, true} {
		t.Run(fmt.Sprintf("insecure=%v", insecure), func(t *testing.T) {
			c := newTestWSClient(t)
			if err := c.Connect(ConnectOptions{URL: "wss" + strings.TrimPrefix(srv.URL, "https"), InsecureSkipVerify: insecure}); err != nil {
				t.Fatal(err)
			}
			if insecure {
				waitClientState(t, c, "open")
			} else {
				waitClientState(t, c, "closed")
				if c.Status().Error == "" {
					t.Fatal("expected TLS verification error")
				}
			}
		})
	}
}

func TestDisconnectDuringHandshakeDoesNotReopen(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		echoWS(w, r)
	}))
	t.Cleanup(srv.Close)
	c := newTestWSClient(t)
	c.opts = ConnectOptions{URL: "ws" + strings.TrimPrefix(srv.URL, "http")}
	c.wantOpen.Store(true)
	ep := c.epoch.Add(1)
	done := make(chan error, 1)
	go func() { done <- c.dialOnce(ep) }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("handshake did not start")
	}
	c.Disconnect()
	close(release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("stale handshake did not finish")
	}
	if status := c.Status(); status.State != "closed" || status.Session != "" {
		t.Fatalf("stale handshake replaced disconnected state: %#v", status)
	}
}

func TestOldConnectionCleanupDoesNotCloseReplacementState(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(echoWS))
	t.Cleanup(srv.Close)
	rawURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	old, _, err := websocket.DefaultDialer.Dial(rawURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = old.Close() })
	replacement, _, err := websocket.DefaultDialer.Dial(rawURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = replacement.Close() })
	c := newTestWSClient(t)
	c.conn = replacement
	c.state = "open"
	c.wantOpen.Store(true)
	c.cleanupConn(old, func() {}, nil)
	if c.conn != replacement || c.Status().State != "open" {
		t.Fatal("old reader cleanup overwrote the new connection state")
	}
}
