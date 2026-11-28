package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
)

func csrfReq(method, cookie, header, origin string) *http.Request {
	req := httptest.NewRequest(method, "http://api.example.com/x", nil)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: cookie}) //nolint:gosec // G124: test request cookie, never sent to a browser
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
	h := middleware.CSRF(nil, "https://web.example.com")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
		{"listed host with wrong scheme", csrfReq("POST", "tok", "tok", "http://web.example.com"), 403},
		{"request host with wrong scheme", csrfReq("POST", "tok", "tok", "https://api.example.com"), 403},
		{"listed origin with other port", csrfReq("POST", "tok", "tok", "https://web.example.com:8443"), 403},
		{"listed origin, different case", csrfReq("POST", "tok", "tok", "HTTPS://Web.Example.com"), 204},
		{"opaque origin", csrfReq("POST", "tok", "tok", "null"), 403},
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

// TestCSRFBehindTLSTerminatingProxy covers the Caddy setup: the api sees a
// plain http request, the trusted proxy sets X-Forwarded-Proto. A client on
// https://api.example.com sends Origin: https://api.example.com.
func TestCSRFBehindTLSTerminatingProxy(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	h := middleware.CSRF(trusted, "https://web.example.com")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(204)
	}))
	tests := []struct {
		name   string
		peer   string
		proto  string
		origin string
		want   int
	}{
		{"https origin behind proxy from https", "10.0.0.2:55432", "https", "https://api.example.com", 204},
		{"http origin behind proxy from http", "10.0.0.2:55432", "http", "http://api.example.com", 204},
		{"forged proto from untrusted peer", "203.0.113.9:55432", "https", "https://api.example.com", 403},
		{"missing proto behind proxy", "10.0.0.2:55432", "", "https://api.example.com", 403},
		{"https origin when proxy says http", "10.0.0.2:55432", "http", "https://api.example.com", 403},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := csrfReq("POST", "tok", "tok", tc.origin)
			req.RemoteAddr = tc.peer
			if tc.proto != "" {
				req.Header.Set("X-Forwarded-Proto", tc.proto)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d (%s)", w.Code, tc.want, w.Body)
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

func TestCSRFDefaultPortOrigins(t *testing.T) {
	h := middleware.CSRF(nil, "https://web.example.com")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(204)
	}))
	tests := []struct {
		origin string
		want   int
	}{
		{"https://web.example.com:443", 204},
		{"https://WEB.example.com", 204},
		{"http://api.example.com:80", 204},
		{"https://web.example.com:8443", 403},
		{"http://web.example.com:443", 403},
	}
	for _, tc := range tests {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, csrfReq("POST", "tok", "tok", tc.origin))
		if w.Code != tc.want {
			t.Errorf("%s: got %d, want %d", tc.origin, w.Code, tc.want)
		}
	}
	// own origin with explicit default port in Host
	req := csrfReq("POST", "tok", "tok", "http://api.example.com")
	req.Host = "api.example.com:80"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 204 {
		t.Errorf("own origin with :80 host: got %d", w.Code)
	}
}
