// Package middleware holds the base HTTP middleware and the JSON error envelope.
package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
)

// ErrorBody is the standard JSON error envelope: {"error":{...}}.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail describes one error. Code is a stable machine-readable
// identifier; Message is safe to show; RequestID matches the log lines.
type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// WriteError writes the envelope with the given HTTP status.
func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorBody{Error: ErrorDetail{
		Code: code, Message: message, RequestID: log.RequestID(r.Context()),
	}})
}
