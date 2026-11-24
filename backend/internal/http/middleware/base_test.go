package middleware

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
)

func TestRecovererReturnsEnvelope(t *testing.T) {
	var buf bytes.Buffer
	l := log.New(&buf, "info")
	h := RequestID(Recoverer(l)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != 500 || !strings.Contains(rec.Body.String(), `"internal_error"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "boom") || !strings.Contains(buf.String(), "boom") {
		t.Fatal("panic must be logged, not returned")
	}
}

func TestTimeoutReturns504(t *testing.T) {
	h := Timeout(20 * time.Millisecond)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusGatewayTimeout {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestWriteErrorShape(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/", nil).WithContext(log.WithRequestID(context.Background(), "rid"))
	WriteError(rec, r, 400, "bad_request", "Bad")
	want := `{"error":{"code":"bad_request","message":"Bad","request_id":"rid"}}` + "\n"
	if rec.Body.String() != want || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("got %q", rec.Body)
	}
}
