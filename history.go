package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SessionInfo is a daily log file summary for the history list.
type SessionInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ModTime    string `json:"modTime"`
	URL        string `json:"url,omitempty"`
	Day        string `json:"day,omitempty"`
	MatchCount int    `json:"matchCount,omitempty"`
	MatchHint  string `json:"matchHint,omitempty"`
}

// SessionDetail is a fully loaded jsonl day (or legacy session) file.
type SessionDetail struct {
	Info     SessionInfo `json:"info"`
	URL      string      `json:"url"`
	Protocol string      `json:"protocol"`
	Messages []Msg       `json:"messages"`
	Notes    []string    `json:"notes"`
}

// ListSessions returns daily log files under the log directory (newest first).
func (a *App) ListSessions() ([]SessionInfo, error) {
	return a.listSessions("")
}

// SearchSessions filters daily logs by keyword (file name, url, content).
func (a *App) SearchSessions(keyword string) ([]SessionInfo, error) {
	return a.listSessions(keyword)
}

func (a *App) listSessions(keyword string) ([]SessionInfo, error) {
	dir := a.logDir()
	_ = os.MkdirAll(dir, 0o755)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	kw := strings.ToLower(strings.TrimSpace(keyword))
	var list []SessionInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		low := strings.ToLower(name)
		if !strings.HasSuffix(low, ".jsonl") {
			continue
		}
		// Prefer daily files: ws-YYYY-MM-DD.jsonl
		// Also keep legacy session-*.jsonl visible.
		info, err := e.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(dir, name)
		si := SessionInfo{
			Name:    name,
			Path:    path,
			Size:    info.Size(),
			ModTime: info.ModTime().In(beijingLocation()).Format("2006-01-02 15:04:05"),
			Day:     dayFromLogName(name),
		}
		si.URL = peekSessionURL(path)

		if kw != "" {
			nameHit := strings.Contains(strings.ToLower(si.Name), kw) ||
				strings.Contains(strings.ToLower(si.Day), kw)
			urlHit := strings.Contains(strings.ToLower(si.URL), kw)
			count, hint := scanKeywordHits(path, kw)
			si.MatchCount = count
			si.MatchHint = hint
			if !nameHit && !urlHit && count == 0 {
				continue
			}
		}
		list = append(list, si)
	}
	sort.Slice(list, func(i, j int) bool {
		// daily files first by day desc, then legacy by modtime
		di, dj := list[i].Day, list[j].Day
		if di != "" && dj != "" && di != dj {
			return di > dj
		}
		if kw != "" && list[i].MatchCount != list[j].MatchCount {
			return list[i].MatchCount > list[j].MatchCount
		}
		return list[i].ModTime > list[j].ModTime
	})
	return list, nil
}

func dayFromLogName(name string) string {
	// ws-2006-01-02.jsonl
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if strings.HasPrefix(base, "ws-") && len(base) >= 13 {
		day := strings.TrimPrefix(base, "ws-")
		if _, err := time.ParseInLocation("2006-01-02", day, beijingLocation()); err == nil {
			return day
		}
	}
	return ""
}

// scanKeywordHits counts case-insensitive substring hits in a jsonl file.
func scanKeywordHits(path, kwLower string) (int, string) {
	if kwLower == "" {
		return 0, ""
	}
	f, err := os.Open(path)
	if err != nil {
		return 0, ""
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	hits := 0
	hint := ""
	for sc.Scan() {
		line := sc.Text()
		low := strings.ToLower(line)
		idx := 0
		for {
			p := strings.Index(low[idx:], kwLower)
			if p < 0 {
				break
			}
			hits++
			if hint == "" {
				abs := idx + p
				start := abs - 40
				if start < 0 {
					start = 0
				}
				end := abs + len(kwLower) + 40
				if end > len(line) {
					end = len(line)
				}
				hint = strings.ReplaceAll(line[start:end], "\t", " ")
				if start > 0 {
					hint = "…" + hint
				}
				if end < len(line) {
					hint = hint + "…"
				}
			}
			idx += p + len(kwLower)
			if idx >= len(low) {
				break
			}
			if hits >= 500 {
				return hits, hint
			}
		}
	}
	return hits, hint
}

// LoadSession loads a log by file name (must be under log dir).
func (a *App) LoadSession(name string) (*SessionDetail, error) {
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	logDir, err := filepath.Abs(a.logDir())
	if err != nil {
		return nil, err
	}
	// allow only basename to avoid path escape
	path := filepath.Join(logDir, filepath.Base(name))
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(logDir, abs)
	if err != nil || strings.HasPrefix(rel, "..") {
		return nil, fmt.Errorf("log must be under log directory")
	}
	return loadSessionFile(abs)
}

// PickAndLoadSession opens a file dialog and loads any .jsonl log.
func (a *App) PickAndLoadSession() (*SessionDetail, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开日志 (.jsonl)",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Lines", Pattern: "*.jsonl"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
		DefaultDirectory: a.logDir(),
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}
	return loadSessionFile(path)
}

// OpenLogDir reveals the log folder in Explorer.
func (a *App) OpenLogDir() error {
	dir := a.logDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return exec.Command("explorer", dir).Start()
}

func peekSessionURL(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	// last non-empty url wins (more recent connect of the day)
	url := ""
	for i := 0; i < 50 && sc.Scan(); i++ {
		var row map[string]any
		if json.Unmarshal(sc.Bytes(), &row) != nil {
			continue
		}
		if u, ok := row["url"].(string); ok && u != "" {
			url = u
		}
	}
	// also scan rest lightly for latest url
	for sc.Scan() {
		var row map[string]any
		if json.Unmarshal(sc.Bytes(), &row) != nil {
			continue
		}
		if kind, _ := row["kind"].(string); kind == "meta" {
			if u, ok := row["url"].(string); ok && u != "" {
				url = u
			}
		}
	}
	return url
}

func loadSessionFile(path string) (*SessionDetail, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return nil, err
	}

	name := filepath.Base(path)
	detail := &SessionDetail{
		Info: SessionInfo{
			Name:    name,
			Path:    path,
			Size:    st.Size(),
			ModTime: st.ModTime().In(beijingLocation()).Format("2006-01-02 15:04:05"),
			Day:     dayFromLogName(name),
		},
		Messages: make([]Msg, 0, 256),
		Notes:    make([]string, 0),
	}

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 256*1024), 8*1024*1024)

	var autoID int64
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		kind, _ := raw["kind"].(string)
		switch kind {
		case "meta":
			if u, ok := raw["url"].(string); ok {
				detail.URL = u
				detail.Info.URL = u
			}
			if p, ok := raw["protocol"].(string); ok {
				detail.Protocol = p
			}
			if ev, ok := raw["event"].(string); ok {
				detail.Notes = append(detail.Notes, ev)
				// surface session boundaries as sys lines for readability
				autoID++
				ts, _ := raw["ts"].(string)
				sess, _ := raw["session"].(string)
				url, _ := raw["url"].(string)
				text := ev
				if sess != "" {
					text += " #" + sess
				}
				if url != "" {
					text += " " + url
				}
				detail.Messages = append(detail.Messages, Msg{
					ID:     autoID,
					Dir:    "sys",
					Time:   ts,
					Text:   text,
					Pretty: text,
					Bytes:  len(text),
				})
			}
		case "sys":
			autoID++
			ts, _ := raw["ts"].(string)
			ev, _ := raw["event"].(string)
			detailText, _ := raw["detail"].(string)
			text := ev
			if detailText != "" {
				if text != "" {
					text += ": "
				}
				text += detailText
			}
			if text == "" {
				text = line
			}
			detail.Messages = append(detail.Messages, Msg{
				ID:     autoID,
				Dir:    "sys",
				Time:   ts,
				Text:   text,
				Pretty: text,
				Bytes:  len(text),
			})
		case "msg":
			m := Msg{Dir: "sys"}
			if id, ok := asInt64(raw["id"]); ok {
				m.ID = id
			} else {
				autoID++
				m.ID = autoID
			}
			// daily file may reuse ids across sessions — force unique for UI
			autoID++
			m.ID = autoID
			if d, ok := raw["dir"].(string); ok {
				m.Dir = d
			}
			if ts, ok := raw["ts"].(string); ok {
				m.Time = ts
			}
			if t, ok := raw["text"].(string); ok {
				m.Text = t
			}
			if p, ok := raw["pretty"].(string); ok {
				m.Pretty = p
			}
			if m.Pretty == "" {
				m.Pretty = prettyJSON(m.Text)
			}
			if b, ok := asInt64(raw["bytes"]); ok {
				m.Bytes = int(b)
			} else {
				m.Bytes = len(m.Text)
			}
			detail.Messages = append(detail.Messages, m)
		default:
			if t, ok := raw["text"].(string); ok {
				autoID++
				dir, _ := raw["dir"].(string)
				if dir == "" {
					dir = "sys"
				}
				ts, _ := raw["ts"].(string)
				detail.Messages = append(detail.Messages, Msg{
					ID:     autoID,
					Dir:    dir,
					Time:   ts,
					Text:   t,
					Pretty: prettyJSON(t),
					Bytes:  len(t),
				})
			}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return detail, nil
}

func asInt64(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	default:
		return 0, false
	}
}
