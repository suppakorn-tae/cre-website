package catalogue_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/catalogue"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/catalogue"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

type fakeSource struct{ snap *svc.Snapshot }

func (f fakeSource) Snapshot(context.Context) (*svc.Snapshot, error) { return f.snap, nil }

func fixture(t *testing.T) *svc.Snapshot {
	t.Helper()
	s, err := svc.NewSnapshot(
		[]svc.Dimension{{
			Code: "EC", Name: svc.Text{"th": "เศรษฐกิจ", "en": "Economic"},
			Factors: []svc.Factor{{
				Code: "EC-MG", Name: svc.Text{"th": "มหภาค"},
				Indicators: []svc.Indicator{{
					Code:       "EC-MG-1",
					Thresholds: engine.Thresholds{Direction: engine.DirectionNormal},
					Name:       svc.Text{"th": "ชื่อ"}, Unit: svc.Text{"th": "ครั้ง"},
					QuestionX: svc.Text{"th": "คำถาม x"}, QuestionY1: svc.Text{"th": "คำถาม y1"},
					QuestionY2: svc.Text{}, QuestionY3: svc.Text{"th": "คำถาม y3"},
				}},
			}},
		}},
		[]svc.RiEOption{{Code: "A", Score: 1, IsExclusive: true, Label: svc.Text{"th": "ไม่มี"}}},
		map[string]svc.ImpactTable{}, map[svc.AdviceKey][]svc.AdviceItem{},
	)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func router(t *testing.T) http.Handler {
	t.Helper()
	h := catalogue.New(fakeSource{fixture(t)})
	r := chi.NewRouter()
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/catalogue", h.MountCatalogue)
		h.MountLookups(r)
	})
	return r
}

func do(t *testing.T, h http.Handler, path string, hdr map[string]string) (*http.Request, *http.Response) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return req, rec.Result()
}

// TestResponsesMatchContract checks 200 and 304 of all three endpoints against
// the OpenAPI document (IO-15).
func TestResponsesMatchContract(t *testing.T) {
	spec, err := api.GetSpec()
	if err != nil {
		t.Fatal(err)
	}
	h := router(t)
	for _, path := range []string{"/api/v1/catalogue", "/api/v1/catalogue?locale=en", "/api/v1/islands", "/api/v1/project-types"} {
		req, resp := do(t, h, path, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: status %d", path, resp.StatusCode)
		}
		if err := contract.Validate(spec, req, resp); err != nil {
			t.Fatalf("%s 200: %v", path, err)
		}
		if cc := resp.Header.Get("Cache-Control"); cc != "private, no-cache" {
			t.Fatalf("%s: Cache-Control %q", path, cc)
		}
		tag := resp.Header.Get("ETag")
		if tag == "" {
			t.Fatalf("%s: no ETag", path)
		}

		req, resp = do(t, h, path, map[string]string{"If-None-Match": tag})
		if resp.StatusCode != http.StatusNotModified {
			t.Fatalf("%s: want 304, got %d", path, resp.StatusCode)
		}
		if err := contract.Validate(spec, req, resp); err != nil {
			t.Fatalf("%s 304: %v", path, err)
		}
	}
}

func TestCatalogueLocaleFallbackAndETag(t *testing.T) {
	h := router(t)
	_, th := do(t, h, "/api/v1/catalogue", nil)
	_, en := do(t, h, "/api/v1/catalogue?locale=en", nil)
	if th.Header.Get("ETag") == en.Header.Get("ETag") {
		t.Fatal("ETag must differ per locale")
	}
	// Stale tag is a full answer.
	if _, r := do(t, h, "/api/v1/catalogue", map[string]string{"If-None-Match": `"old"`}); r.StatusCode != http.StatusOK {
		t.Fatalf("stale tag: %d", r.StatusCode)
	}
}

func decode(resp *http.Response, v any) error {
	defer func() { _ = resp.Body.Close() }()
	return json.NewDecoder(resp.Body).Decode(v)
}

func TestIslandsOtherLast(t *testing.T) {
	h := router(t)
	for path, want := range map[string]string{"/api/v1/islands": "other", "/api/v1/project-types": "other"} {
		_, resp := do(t, h, path, nil)
		var body struct{ Items []struct{ Code string } }
		if err := decode(resp, &body); err != nil {
			t.Fatal(err)
		}
		if n := len(body.Items); n == 0 || body.Items[n-1].Code != want {
			t.Fatalf("%s: %v", path, body.Items)
		}
	}
}
