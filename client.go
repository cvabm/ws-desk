package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const maxMessages = 5000

type wsClient struct {
	app     *App
	profile string

	mu       sync.Mutex
	conn     *websocket.Conn
	httpDoer *http.Client
	cancel   context.CancelFunc
	opts     ConnectOptions
	kind     string // ws | http
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
		Kind:     c.kind,
		URL:      c.opts.URL,
		Protocol: c.opts.Protocol,
		Method:   c.opts.Method,
		Session:  c.session,
		MsgCount: len(c.msgs),
		Error:    c.errMsg,
		Profile:  c.profile,
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
	kind, canon, err := parseDialURL(opts.URL, "")
	if err != nil {
		return err
	}
	opts.URL = canon
	if kind == kindHTTP {
		return fmt.Errorf("http/https 无需连接，直接发送")
	}
	c.Disconnect()

	c.mu.Lock()
	c.opts = opts
	c.kind = kindWS
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
	if c.httpDoer != nil {
		c.httpDoer.CloseIdleConnections()
		c.httpDoer = nil
	}
	c.state = "closed"
	c.session = ""
	c.mu.Unlock()
	c.emitStatus()
}

func (c *wsClient) Send(text string) error {
	if text == "" {
		return fmt.Errorf("empty message")
	}
	if err := c.waitUntilOpen(15 * time.Second); err != nil {
		return err
	}
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

func (c *wsClient) waitUntilOpen(timeout time.Duration) error {
	c.mu.Lock()
	if c.conn != nil && c.state == "open" {
		c.mu.Unlock()
		return nil
	}
	want := c.wantOpen.Load()
	c.mu.Unlock()
	if !want {
		return fmt.Errorf("not connected")
	}

	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(40 * time.Millisecond)
	defer ticker.Stop()
	for {
		if !time.Now().Before(deadline) {
			return fmt.Errorf("连接超时")
		}
		if c.app != nil && c.app.ctx != nil {
			select {
			case <-ticker.C:
			case <-c.app.ctx.Done():
				return fmt.Errorf("not connected")
			}
		} else {
			<-ticker.C
		}

		c.mu.Lock()
		conn := c.conn
		state := c.state
		errMsg := c.errMsg
		reconnect := c.opts.Reconnect
		want := c.wantOpen.Load()
		c.mu.Unlock()

		if conn != nil && state == "open" {
			return nil
		}
		if !want || (state == "closed" && !reconnect) {
			if errMsg != "" {
				return fmt.Errorf("%s", errMsg)
			}
			return fmt.Errorf("not connected")
		}
	}
}

func (c *wsClient) RequestHTTP(opts ConnectOptions, body string) (*HTTPExchange, error) {
	kind, canon, err := parseDialURL(opts.URL, "")
	if err != nil {
		return nil, err
	}
	if kind != kindHTTP {
		return nil, fmt.Errorf("url must be http:// or https://")
	}
	opts.URL = canon

	doer, err := c.beginHTTP(opts, true)
	if err != nil {
		return nil, err
	}
	return c.doHTTP(opts, httpDoerFor(doer, opts.NoFollowRedirects), body)
}

// RecordHTTP stores a request/response pair in the live list and daily log without sending.
func (c *wsClient) RecordHTTP(ex HTTPExchange) (*HTTPExchange, error) {
	kind, canon, err := parseDialURL(ex.URL, "")
	if err != nil {
		return nil, err
	}
	if kind != kindHTTP {
		return nil, fmt.Errorf("url must be http:// or https://")
	}
	ex.URL = canon
	normalizeRecordedExchange(&ex)

	opts := ConnectOptions{
		URL:     ex.URL,
		Method:  ex.Method,
		Headers: ex.ReqHeaders,
	}
	if _, err := c.beginHTTP(opts, false); err != nil {
		return nil, err
	}

	ptr := &ex
	c.pushEx("out", formatHTTPOut(ex.Method, ex.URL, ex.ReqBody), ptr)
	c.pushEx("in", formatHTTPIn(ex.Status, ex.ResBody, false), ptr)
	return ptr, nil
}

// RecordWS stores a send/receive pair in the live list and daily log without sending.
func (c *wsClient) RecordWS(opts ConnectOptions, outText, inText string) (*WSRecord, error) {
	kind, canon, err := parseDialURL(opts.URL, "ws")
	if err != nil {
		return nil, err
	}
	if kind != kindWS {
		return nil, fmt.Errorf("url must be ws:// or wss://")
	}
	opts.URL = canon
	if strings.TrimSpace(outText) == "" && strings.TrimSpace(inText) == "" {
		return nil, fmt.Errorf("out or in text is required")
	}

	rec := &WSRecord{
		URL:      canon,
		Protocol: strings.TrimSpace(opts.Protocol),
		Out:      outText,
		In:       inText,
		Manual:   true,
	}
	if err := c.beginWSRecord(opts); err != nil {
		return nil, err
	}
	if outText != "" {
		c.pushWS("out", outText, rec)
	}
	c.push("sys", fmt.Sprintf("recorded  ws  out=%db  in=%db", len(outText), len(inText)))
	if inText != "" {
		c.pushWS("in", inText, rec)
	}
	return rec, nil
}

func (c *wsClient) beginWSRecord(opts ConnectOptions) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	live := c.conn != nil || c.wantOpen.Load()
	host := urlHostname(opts.URL)
	if c.logger != nil && c.logger.Host() != host && !live {
		c.logger.Close()
		c.logger = nil
		c.session = ""
	}
	if c.logger == nil {
		proto := strings.TrimSpace(opts.Protocol)
		if proto == "" {
			proto = "ws"
		}
		logger, logErr := newSessionLogger(c.app.requestsDir(), opts.URL, proto)
		if logErr != nil {
			return logErr
		}
		c.logger = logger
		c.session = logger.SessionID()
	}
	if !live {
		c.opts = opts
		c.kind = kindWS
		if c.state == "" {
			c.state = "idle"
		}
		c.errMsg = ""
	}
	return nil
}

func (c *wsClient) beginHTTP(opts ConnectOptions, needDoer bool) (*http.Client, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	live := c.conn != nil || c.wantOpen.Load()
	var doer *http.Client
	if needDoer {
		if c.httpDoer == nil {
			c.httpDoer = newHTTPDoer()
		}
		doer = c.httpDoer
	}
	host := urlHostname(opts.URL)
	if c.logger != nil && c.logger.Host() != host && !live {
		c.logger.Close()
		c.logger = nil
		c.session = ""
	}
	if c.logger == nil {
		logger, logErr := newSessionLogger(c.app.requestsDir(), opts.URL, opts.Method)
		if logErr != nil {
			return nil, logErr
		}
		c.logger = logger
		c.session = logger.SessionID()
	}
	if !live {
		c.opts = opts
		c.kind = kindHTTP
		c.state = "idle"
		c.errMsg = ""
	}
	return doer, nil
}

func (c *wsClient) doHTTP(opts ConnectOptions, doer *http.Client, body string) (*HTTPExchange, error) {
	ex := &HTTPExchange{
		Method:     normalizeHTTPMethod(opts.Method, body),
		URL:        opts.URL,
		ReqBody:    body,
		ReqHeaders: map[string]string{},
		ResHeaders: map[string]string{},
	}
	if doer == nil {
		ex.Error = "http client missing"
		return ex, nil
	}

	method := ex.Method
	var reader io.Reader
	reqBody := body
	if methodOmitsBody(method) {
		reqBody = ""
		ex.ReqBody = ""
		reader = nil
	} else if body != "" {
		reader = strings.NewReader(body)
	}

	req, err := http.NewRequest(method, opts.URL, reader)
	if err != nil {
		ex.Error = err.Error()
		return ex, nil
	}
	applyHTTPHeaders(req, opts.Headers, reqBody)
	ex.ReqHeaders = flattenHeader(req.Header)
	if doer != nil {
		snapshotJarCookies(ex.ReqHeaders, doer.Jar, opts.URL)
	}

	c.pushEx("out", formatHTTPOut(method, opts.URL, reqBody), ex)
	start := time.Now()
	resp, err := doer.Do(req)
	ex.TimeMs = time.Since(start).Milliseconds()
	if err != nil {
		ex.Error = err.Error()
		c.pushEx("in", "http error: "+err.Error(), ex)
		return ex, nil
	}
	defer resp.Body.Close()

	text, n, truncated, err := readHTTPBody(resp.Body)
	ex.Status = resp.Status
	ex.StatusCode = resp.StatusCode
	ex.Bytes = int(n)
	ex.Truncated = truncated
	ex.ResHeaders = flattenHeader(resp.Header)
	ex.ResBody = text
	if err != nil {
		ex.Error = err.Error()
		c.pushEx("in", formatHTTPIn(resp.Status, text, truncated), ex)
		return ex, nil
	}
	c.pushEx("in", formatHTTPIn(resp.Status, text, truncated), ex)
	return ex, nil
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
		TLSClientConfig:  insecureTLSConfig(),
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
	logger, logErr := newSessionLogger(c.app.requestsDir(), opts.URL, opts.Protocol)
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
	c.pushEx(dir, text, nil)
}

func (c *wsClient) pushWS(dir, text string, rec *WSRecord) {
	pretty := text
	if (dir == "in" || dir == "out") && len(text) <= 16*1024 {
		pretty = prettyJSON(text)
	}
	c.emitMsg(Msg{
		ID:     c.nextID.Add(1),
		Dir:    dir,
		Time:   beijingNow(),
		Text:   text,
		Pretty: pretty,
		Bytes:  len(text),
		WS:     rec,
	})
}

func (c *wsClient) pushEx(dir, text string, ex *HTTPExchange) {
	pretty := text
	if ex != nil {
		pretty = clipText(text, 480)
	} else if (dir == "in" || dir == "out") && len(text) <= 16*1024 {
		pretty = prettyJSON(text)
	}
	c.emitMsg(Msg{
		ID:       c.nextID.Add(1),
		Dir:      dir,
		Time:     beijingNow(),
		Text:     text,
		Pretty:   pretty,
		Bytes:    len(text),
		Exchange: ex,
	})
}

func (c *wsClient) emitMsg(m Msg) {
	if m.Profile == "" {
		m.Profile = c.profile
	}
	c.mu.Lock()
	c.msgs = append(c.msgs, m)
	if len(c.msgs) > maxMessages {
		c.msgs = c.msgs[len(c.msgs)-maxMessages:]
	}
	logger := c.logger
	c.mu.Unlock()

	if logger != nil {
		if m.Dir == "sys" {
			logger.WriteSys("note", m.Text)
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

func (c *wsClient) ClearCookies() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.httpDoer == nil {
		return
	}
	c.httpDoer.Jar = newCookieJar()
}
