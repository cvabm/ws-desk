package main

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const maxMessages = 5000

type wsClient struct {
	app *App

	mu       sync.Mutex
	conn     *websocket.Conn
	cancel   context.CancelFunc
	opts     ConnectOptions
	state    string
	errMsg   string
	session  string
	logger   *sessionLogger
	msgs     []Msg
	nextID   atomic.Int64
	wantOpen atomic.Bool
	epoch    atomic.Uint64 // invalidates older dial loops
}

func newWSClient(app *App) *wsClient {
	return &wsClient{app: app, state: "idle"}
}

func (c *wsClient) Status() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	return Status{
		State:    c.state,
		URL:      c.opts.URL,
		Protocol: c.opts.Protocol,
		Session:  c.session,
		MsgCount: len(c.msgs),
		Error:    c.errMsg,
	}
}

func (c *wsClient) Messages(afterID int64, limit int) []Msg {
	c.mu.Lock()
	defer c.mu.Unlock()
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	out := make([]Msg, 0, limit)
	for i := len(c.msgs) - 1; i >= 0 && len(out) < limit; i-- {
		if c.msgs[i].ID > afterID {
			out = append(out, c.msgs[i])
		}
	}
	// reverse to chronological
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func (c *wsClient) Clear() {
	c.mu.Lock()
	c.msgs = nil
	c.mu.Unlock()
	c.emitStatus()
}

func (c *wsClient) Connect(opts ConnectOptions) error {
	if opts.URL == "" {
		return fmt.Errorf("url is required")
	}
	c.Disconnect()

	c.mu.Lock()
	c.opts = opts
	c.errMsg = ""
	c.state = "connecting"
	c.mu.Unlock()
	c.wantOpen.Store(true)
	ep := c.epoch.Add(1)
	c.emitStatus()

	go c.dialLoop(ep)
	return nil
}

func (c *wsClient) Disconnect() {
	c.wantOpen.Store(false)
	c.epoch.Add(1)
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel()
		c.cancel = nil
	}
	if c.conn != nil {
		_ = c.conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "bye"),
			time.Now().Add(time.Second))
		_ = c.conn.Close()
		c.conn = nil
	}
	if c.logger != nil {
		c.logger.Close()
		c.logger = nil
	}
	c.state = "closed"
	c.session = ""
	c.mu.Unlock()
	c.emitStatus()
}

func (c *wsClient) Send(text string) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return fmt.Errorf("not connected")
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(text)); err != nil {
		return err
	}
	c.push("out", text)
	return nil
}

func (c *wsClient) dialLoop(ep uint64) {
	backoff := time.Second
	for c.wantOpen.Load() && c.epoch.Load() == ep {
		err := c.dialOnce(ep)
		if !c.wantOpen.Load() || c.epoch.Load() != ep {
			return
		}
		if err != nil {
			c.mu.Lock()
			c.errMsg = err.Error()
			c.state = "reconnecting"
			c.mu.Unlock()
			c.push("sys", "error: "+err.Error())
			c.emitStatus()
		}
		if !c.opts.Reconnect {
			c.mu.Lock()
			c.state = "closed"
			c.mu.Unlock()
			c.emitStatus()
			return
		}
		c.push("sys", fmt.Sprintf("reconnect in %s", backoff))
		timer := time.NewTimer(backoff)
		select {
		case <-timer.C:
		case <-c.app.ctx.Done():
			timer.Stop()
			return
		}
		if c.epoch.Load() != ep {
			return
		}
		if backoff < 15*time.Second {
			backoff *= 2
			if backoff > 15*time.Second {
				backoff = 15 * time.Second
			}
		}
	}
}

func (c *wsClient) dialOnce(ep uint64) error {
	opts := c.opts
	header := http.Header{}
	for k, v := range opts.Headers {
		if k != "" {
			header.Set(k, v)
		}
	}

	c.mu.Lock()
	c.state = "connecting"
	c.errMsg = ""
	c.mu.Unlock()
	c.emitStatus()

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     nil,
	}
	if opts.Protocol != "" {
		dialer.Subprotocols = []string{opts.Protocol}
	}

	conn, resp, err := dialer.Dial(opts.URL, header)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("%w (http %s)", err, resp.Status)
		}
		return err
	}
	if c.epoch.Load() != ep {
		_ = conn.Close()
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	logger, logErr := newSessionLogger(c.app.logDir(), opts.URL, opts.Protocol)
	if logErr != nil {
		cancel()
		_ = conn.Close()
		return logErr
	}

	c.mu.Lock()
	if c.conn != nil {
		_ = c.conn.Close()
	}
	if c.cancel != nil {
		c.cancel()
	}
	if c.logger != nil {
		c.logger.Close()
	}
	c.conn = conn
	c.cancel = cancel
	c.logger = logger
	c.session = logger.SessionID()
	c.state = "open"
	c.errMsg = ""
	proto := conn.Subprotocol()
	c.mu.Unlock()

	c.push("sys", fmt.Sprintf("connected  protocol=%s  session=%s", proto, logger.SessionID()))
	c.emitStatus()

	// reader
	errCh := make(chan error, 1)
	go func() {
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if c.epoch.Load() == ep {
				c.push("in", string(data))
			}
		}
	}()

	// optional ping
	var pingTicker *time.Ticker
	if opts.PingSec > 0 {
		pingTicker = time.NewTicker(time.Duration(opts.PingSec) * time.Second)
		defer pingTicker.Stop()
	}

	for {
		if pingTicker != nil {
			select {
			case <-ctx.Done():
				return nil
			case err := <-errCh:
				c.cleanupConn(conn, cancel, logger)
				c.push("sys", "closed: "+err.Error())
				return err
			case <-pingTicker.C:
				if c.epoch.Load() != ep {
					return nil
				}
				deadline := time.Now().Add(5 * time.Second)
				if err := conn.WriteControl(websocket.PingMessage, []byte("ping"), deadline); err != nil {
					c.cleanupConn(conn, cancel, logger)
					return err
				}
			}
		} else {
			select {
			case <-ctx.Done():
				return nil
			case err := <-errCh:
				c.cleanupConn(conn, cancel, logger)
				c.push("sys", "closed: "+err.Error())
				return err
			}
		}
		if !c.wantOpen.Load() || c.epoch.Load() != ep {
			return nil
		}
	}
}

func (c *wsClient) cleanupConn(conn *websocket.Conn, cancel context.CancelFunc, logger *sessionLogger) {
	cancel()
	_ = conn.Close()
	c.mu.Lock()
	if c.conn == conn {
		c.conn = nil
	}
	if c.logger == logger {
		logger.Close()
		c.logger = nil
		c.session = ""
	}
	if c.wantOpen.Load() && c.opts.Reconnect {
		c.state = "reconnecting"
	} else {
		c.state = "closed"
	}
	c.mu.Unlock()
	c.emitStatus()
}

func (c *wsClient) push(dir, text string) {
	pretty := text
	if dir == "in" || dir == "out" {
		pretty = prettyJSON(text)
	}
	m := Msg{
		ID:     c.nextID.Add(1),
		Dir:    dir,
		Time:   beijingNow(),
		Text:   text,
		Pretty: pretty,
		Bytes:  len(text),
	}
	c.mu.Lock()
	c.msgs = append(c.msgs, m)
	if len(c.msgs) > maxMessages {
		c.msgs = c.msgs[len(c.msgs)-maxMessages:]
	}
	logger := c.logger
	c.mu.Unlock()

	if logger != nil {
		if dir == "sys" {
			logger.WriteSys("note", text)
		} else {
			logger.WriteMsg(m)
		}
	}
	if c.app.ctx != nil {
		runtime.EventsEmit(c.app.ctx, "message", m)
	}
}

func (c *wsClient) emitStatus() {
	if c.app.ctx == nil {
		return
	}
	runtime.EventsEmit(c.app.ctx, "status", c.Status())
}
