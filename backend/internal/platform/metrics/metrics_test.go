package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
)

func TestRegistryGathersAuthMailFailures(t *testing.T) {
	m := New()
	// A CounterVec without children is not gathered, so create one.
	auth.MailFailures.WithLabelValues("reset_code").Add(0)
	mfs, err := m.Registry.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, mf := range mfs {
		if mf.GetName() == "auth_mail_send_failures_total" {
			return
		}
	}
	t.Fatal("auth_mail_send_failures_total is not gathered")
}

func TestMetricsEndpointCountsRequests(t *testing.T) {
	m := New()
	h := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))

	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if !strings.Contains(rec.Body.String(), `http_requests_total{method="GET",status="418"} 1`) {
		t.Fatalf("missing counter:\n%s", rec.Body)
	}
}
