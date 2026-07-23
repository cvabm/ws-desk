package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// App is the Wails application API surface.
type App struct {
	ctx    context.Context
	baseDir string
	client *wsClient
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
		// wails dev runs from a temp build path; if no profiles nearby, use cwd.
		if _, err := os.Stat(filepath.Join(dir, "profiles")); err == nil {
			return dir
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return "."
}

func (a *App) logDir() string {
	return filepath.Join(a.baseDir, "ws-logs")
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_ = os.MkdirAll(a.logDir(), 0o755)
	_ = a.ensureProfiles()
}

func (a *App) shutdown(ctx context.Context) {
	if a.client != nil {
		a.client.Disconnect()
	}
}

// GetProfiles returns saved connection profiles.
func (a *App) GetProfiles() []Profile {
	list, err := a.loadProfiles()
	if err != nil {
		return defaultProfiles()
	}
	return list
}

// SaveProfile writes a profile to disk.
func (a *App) SaveProfile(p Profile) error {
	if p.Name == "" {
		return fmt.Errorf("name is required")
	}
	if p.URL == "" {
		return fmt.Errorf("url is required")
	}
	return a.saveProfileFile(p)
}

// Connect opens a WebSocket using the given options.
func (a *App) Connect(opts ConnectOptions) error {
	return a.client.Connect(opts)
}

// Disconnect closes the active connection.
func (a *App) Disconnect() {
	a.client.Disconnect()
}

// Send transmits a text frame.
func (a *App) Send(text string) error {
	if text == "" {
		return fmt.Errorf("empty message")
	}
	return a.client.Send(text)
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
		"logs":     a.logDir(),
		"profiles": a.profilesDir(),
	}
}

// FormatJSON pretty-prints JSON or returns the original text.
func (a *App) FormatJSON(text string) string {
	return prettyJSON(text)
}
