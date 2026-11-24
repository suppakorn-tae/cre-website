package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
)

func csrfReq(method, cookie, header, origin string) *http.Request {
	req := httptest.NewRequest(method, "http://api.example.com/x", nil)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: cookie})
	}
	if header != "" {
		req.Header.Set(middleware.CSRFHeader, header)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	return req
}

func TestCSRF(t *testing.T) {
	h := middleware.CSRF("https://web.example.com")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(204)
	}))
	tests := []struct {
		name string
		req  *http.Request
		want int
	}{
		{"get needs nothing", csrfReq("GET", "", "", "https://evil.test"), 204},
		{"cross-origin post without token", csrfReq("POST", "", "", "https://evil.test"), 403},
		{"post without header", csrfReq("POST", "tok", "", ""), 403},
		{"post without cookie", csrfReq("POST", "", "tok", ""), 403},
		{"mismatch", csrfReq("PUT", "tok", "other", ""), 403},
		{"cross-origin with valid token", csrfReq("POST", "tok", "tok", "https://evil.test"), 403},
		{"same host origin", csrfReq("DELETE", "tok", "tok", "http://api.example.com"), 204},
		{"listed origin", csrfReq("PATCH", "tok", "tok", "https://web.example.com"), 204},
		{"missing origin with token (next.js server)", csrfReq("POST", "tok", "tok", ""), 204},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, tc.req)
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d (%s)", w.Code, tc.want, w.Body)
			}
			if tc.want == 403 && !strings.Contains(w.Body.String(), `"csrf_invalid"`) {
				t.Fatalf("code: %s", w.Body)
			}
		})
	}
}

func TestCSRFCookie(t *testing.T) {
	tok := middleware.NewCSRFToken()
	if len(tok) != 32 || tok == middleware.NewCSRFToken() {
		t.Fatalf("token: %q", tok)
	}
	w := httptest.NewRecorder()
	middleware.SetCSRFCookie(w, tok, false)
	c := w.Result().Cookies()[0]
	if c.Name != "cre_csrf" || c.HttpOnly || !c.Secure || c.Path != "/" || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie: %+v", c)
	}
}
