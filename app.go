package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// App is the Wails application API surface.
type App struct {
	ctx     context.Context
	baseDir string
	client  *wsClient
}

// NewApp creates a new App application struct.
func NewApp() *App {
	base := resolveBaseDir()
	a := &App{baseDir: base}
	a.client = newWSClient(a)
	return a
}

func resolveBaseDir() string {
	// Prefer executable directory when packaged; fall back to cwd for `wails dev`.
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		// wails dev runs from a temp build path; if no data dirs nearby, use cwd.
		for _, name := range []string{"servers", "requests", "profiles", "ws-logs"} {
			if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
				return dir
			}
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return "."
}

func (a *App) serversDir() string {
	return filepath.Join(a.baseDir, "servers")
}

func (a *App) requestsDir() string {
	return filepath.Join(a.baseDir, "requests")
}

func (a *App) migrateDataDirs() {
	renameDirIfNeeded(filepath.Join(a.baseDir, "profiles"), a.serversDir())
	renameDirIfNeeded(filepath.Join(a.baseDir, "ws-logs"), a.requestsDir())
}

func renameDirIfNeeded(oldPath, newPath string) {
	if oldPath == newPath {
		return
	}
	if _, err := os.Stat(newPath); err == nil {
		return
	}
	if _, err := os.Stat(oldPath); err != nil {
		return
	}
	_ = os.Rename(oldPath, newPath)
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.migrateDataDirs()
	_ = os.MkdirAll(a.requestsDir(), 0o755)
	_ = a.ensureServers()
}

func (a *App) shutdown(ctx context.Context) {
	if a.client != nil {
		a.client.Disconnect()
	}
}

// GetProfiles returns saved connection profiles (one per scheme + host).
func (a *App) GetProfiles() []Profile {
	list, err := a.loadProfiles()
	if err != nil {
		return nil
	}
	return list
}

// SaveProfile writes a profile keyed by scheme://host (IP or domain).
func (a *App) SaveProfile(p Profile) error {
	if p.URL == "" {
		return fmt.Errorf("url is required")
	}
	if name := profileNameFromURL(p.URL); name != "" {
		p.Name = name
	}
	if p.Name == "" {
		return fmt.Errorf("url host is required")
	}
	return a.saveProfileFile(p)
}

// Connect opens a WebSocket.
func (a *App) Connect(opts ConnectOptions) error {
	return a.client.Connect(opts)
}

// Disconnect closes the active connection.
func (a *App) Disconnect() {
	a.client.Disconnect()
}

// Send transmits a WebSocket text frame.
func (a *App) Send(text string) error {
	return a.client.Send(text)
}

// RequestHTTP sends a one-shot HTTP/HTTPS request. No persistent connection.
func (a *App) RequestHTTP(opts ConnectOptions, body string) (*HTTPExchange, error) {
	return a.client.RequestHTTP(opts, body)
}

// RecordHTTP saves a request/response pair without sending it.
func (a *App) RecordHTTP(ex HTTPExchange) (*HTTPExchange, error) {
	return a.client.RecordHTTP(ex)
}

// RecordWS saves a WebSocket send/receive pair without transmitting.
func (a *App) RecordWS(opts ConnectOptions, outText, inText string) (*WSRecord, error) {
	return a.client.RecordWS(opts, outText, inText)
}

// GetStatus returns the current connection status.
func (a *App) GetStatus() Status {
	return a.client.Status()
}

// GetMessages returns messages after a given id.
func (a *App) GetMessages(afterID int64, limit int) []Msg {
	return a.client.Messages(afterID, limit)
}

// ClearMessages clears the in-memory message buffer.
func (a *App) ClearMessages() {
	a.client.Clear()
}

// GetPaths returns useful directories for the UI footer.
func (a *App) GetPaths() map[string]string {
	return map[string]string{
		"base":     a.baseDir,
		"requests": a.requestsDir(),
		"servers":  a.serversDir(),
	}
}

// FormatJSON pretty-prints JSON or returns the original text.
func (a *App) FormatJSON(text string) string {
	return prettyJSON(text)
}
