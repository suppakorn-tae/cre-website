package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
)

// CSRF cookie and header names, as in the contract (GET /auth/csrf).
const (
	CSRFCookie = "cre_csrf"
	CSRFHeader = "X-CSRF-Token"
)

// NewCSRFToken returns a fresh random token (32 hex characters).
func NewCSRFToken() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// SetCSRFCookie writes the double-submit cookie. It is not httpOnly so the
// web client can read it and echo it in X-CSRF-Token.
func SetCSRFCookie(w http.ResponseWriter, token string, insecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CSRFCookie, Value: token, Path: "/",
		Secure: !insecure, SameSite: http.SameSiteLaxMode,
	})
}

// CSRF guards POST, PUT, PATCH and DELETE with a double-submit token and an
// Origin check. The header must equal the cookie. When Origin is present it
// must be one of extraOrigins (full origins such as https://conriskexpert.com,
// compared on scheme, host and port) or have the request's own scheme and
// host; a missing Origin (server-side calls from
// Next.js) is accepted when the token matches. Failures answer 403
// `csrf_invalid`.
func CSRF(extraOrigins ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range extraOrigins {
		if n, ok := normOrigin(o); ok {
			allowed[n] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			c, err := r.Cookie(CSRFCookie)
			h := r.Header.Get(CSRFHeader)
			if err != nil || c.Value == "" || h == "" ||
				subtle.ConstantTimeCompare([]byte(c.Value), []byte(h)) != 1 {
				WriteError(w, r, http.StatusForbidden, "csrf_invalid", "csrf token missing or wrong")
				return
			}
			if o := r.Header.Get("Origin"); o != "" {
				n, ok := normOrigin(o)
				if !ok || (!allowed[n] && n != ownOrigin(r)) {
					WriteError(w, r, http.StatusForbidden, "csrf_invalid", "origin not allowed")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// normOrigin returns "scheme://host[:port]" in lower case, or false when o is
// not an http(s) origin (for example the opaque origin "null").
func normOrigin(o string) (string, bool) {
	u, err := url.Parse(strings.TrimRight(o, "/"))
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", false
	}
	return strings.ToLower(u.Scheme + "://" + u.Host), true
}

// ownOrigin is the origin the request itself was made to.
func ownOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return strings.ToLower(scheme + "://" + r.Host)
}
