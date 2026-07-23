package main

// Profile is a named connection preset.
type Profile struct {
	Name      string            `json:"name"`
	URL       string            `json:"url"`
	Protocol  string            `json:"protocol"`
	Headers   map[string]string `json:"headers"`
	Reconnect bool              `json:"reconnect"`
	PingSec   int               `json:"pingSec"`
}

// ConnectOptions is used by the UI to open a connection.
type ConnectOptions struct {
	URL       string            `json:"url"`
	Protocol  string            `json:"protocol"`
	Headers   map[string]string `json:"headers"`
	Reconnect bool              `json:"reconnect"`
	PingSec   int               `json:"pingSec"`
}

// Msg is a single logged frame (in/out/sys).
type Msg struct {
	ID     int64  `json:"id"`
	Dir    string `json:"dir"` // in | out | sys
	Time   string `json:"time"`
	Text   string `json:"text"`
	Pretty string `json:"pretty"`
	Bytes  int    `json:"bytes"`
}

// Status is the live connection snapshot for the UI.
type Status struct {
	State    string `json:"state"` // idle | connecting | open | closed | reconnecting
	URL      string `json:"url"`
	Protocol string `json:"protocol"`
	Session  string `json:"session"`
	MsgCount int    `json:"msgCount"`
	Error    string `json:"error,omitempty"`
}
