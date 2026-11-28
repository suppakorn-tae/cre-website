package auth

import (
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/oidc"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

const (
	googleStateCookie   = "cre_google_state"
	googlePendingCookie = "cre_google_pending"
	googleCookiePath    = "/api/v1/auth/google"
)

// Web pages the callback redirects to, by intent.
var googleReturn = map[string]string{
	svc.IntentLogin: "/login", svc.IntentSignup: "/register/google",
	svc.IntentLink: "/account", svc.IntentReauth: "/account",
}

// googleRoutes mounts the Google endpoints. They need GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET (config.API has no Google fields). The redirect URL is
// GOOGLE_REDIRECT_URL, or PUBLIC_BASE_URL + the callback path. Without them
// the routes stay mounted and answer 503 google_unavailable, so the api
// starts and the contract stays complete. GOOGLE_ISSUER overrides the issuer
// for tests.
func googleRoutes(r chi.Router, d app.Deps) {
	limit := app.PassThrough
	if d.RateLimit != nil {
		limit = d.RateLimit("RL_GOOGLE_IP", 30, 15*time.Minute, middleware.KeyIP)
	}
	id, secret := os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET")
	base := strings.TrimSuffix(os.Getenv("PUBLIC_BASE_URL"), "/")
	redirect := os.Getenv("GOOGLE_REDIRECT_URL")
	if redirect == "" && base != "" {
		redirect = base + googleCookiePath + "/callback"
	}
	if id == "" || secret == "" || redirect == "" || base == "" || d.DB == nil || d.Valkey == nil || d.Sessions == nil {
		slog.Warn("google sign-in disabled: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_BASE_URL (or GOOGLE_REDIRECT_URL)")
		mountGoogleUnavailable(r, limit)
		return
	}
	issuer := os.Getenv("GOOGLE_ISSUER")
	if issuer == "" {
		issuer = "https://accounts.google.com"
	}
	idp := oidc.New(oidc.Config{Issuer: issuer, ClientID: id, ClientSecret: secret, RedirectURL: redirect})
	h := &googleHandler{
		svc:      svc.NewGoogle(idp, svc.GooglePGStore{DB: d.DB}, d.Valkey, d.Sessions),
		sessions: d.Sessions, web: base, insecure: d.Config.Insecure(),
	}
	h.mount(r, limit)
}

// mountGoogleUnavailable keeps the Google routes mounted (same limits) but
// answers 503 until Google is configured.
func mountGoogleUnavailable(r chi.Router, limit app.Middleware) {
	off := func(w http.ResponseWriter, req *http.Request) {
		middleware.WriteError(w, req, http.StatusServiceUnavailable, "google_unavailable", "Google sign-in is not configured")
	}
	r.With(limit).Post("/google/start", off)
	r.Get("/google/callback", off)
	r.Get("/google/pending", off)
	r.With(limit).Post("/google/complete", off)
}

type googleHandler struct {
	svc      *svc.Google
	sessions *session.Service
	web      string // PUBLIC_BASE_URL
	insecure bool
}

func (h *googleHandler) mount(r chi.Router, limit app.Middleware) {
	r.With(limit).Post("/google/start", h.start)
	r.Get("/google/callback", h.callback) // the contract declares no 429; a valid single-use state is needed to get past it
	r.Get("/google/pending", h.pending)
	r.With(limit).Post("/google/complete", h.complete)
}

func (h *googleHandler) setCookie(w http.ResponseWriter, name, value string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // Secure is off only outside production (local http development)
		Name: name, Value: value, Path: googleCookiePath, MaxAge: int(maxAge.Seconds()),
		HttpOnly: true, Secure: !h.insecure, SameSite: http.SameSiteLaxMode,
	})
}

// sessionAccount is the account of a valid session cookie, or "".
func (h *googleHandler) sessionAccount(r *http.Request) (string, error) {
	c, err := r.Cookie(session.CookieName)
	if err != nil || c.Value == "" {
		return "", nil
	}
	p, err := h.sessions.Authenticate(r.Context(), c.Value)
	if errors.Is(err, session.ErrInvalidToken) || errors.Is(err, session.ErrExpired) || errors.Is(err, session.ErrRevoked) {
		return "", nil
	}
	return p.AccountID, err
}

// start serves POST /auth/google/start (startGoogleAuth). The state is also
// bound to this browser in an httpOnly cookie, so a callback URL cannot be
// replayed in another browser.
func (h *googleHandler) start(w http.ResponseWriter, r *http.Request) {
	var req api.GoogleStartRequest
	if !loginDecode(w, r, &req) {
		return
	}
	if !req.Intent.Valid() {
		loginInvalid(w, r, loginFieldErr{"/intent", "invalid_intent"})
		return
	}
	acct, err := h.sessionAccount(r)
	var authURL, state string
	switch {
	case err != nil:
	case req.Intent == api.Link || req.Intent == api.Reauth:
		authURL, state, err = h.svc.StartForAccount(r.Context(), string(req.Intent), acct)
	default:
		authURL, state, err = h.svc.Start(r.Context(), string(req.Intent))
	}
	switch {
	case errors.Is(err, svc.ErrSessionRequired):
		middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
	case errors.Is(err, svc.ErrGoogleAlreadyLinked):
		middleware.WriteError(w, r, http.StatusConflict, "google_already_linked", "a Google account is already linked")
	case err != nil:
		slog.ErrorContext(r.Context(), "google start failed", "error", err)
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "google sign-in failed")
	default:
		h.setCookie(w, googleStateCookie, state, svc.GoogleStateTTL)
		writeJSON(w, http.StatusOK, api.GoogleStartResponse{AuthorizationUrl: authURL})
	}
}

// callback serves GET /auth/google/callback (googleCallback): always a 302
// to the web app with ?result=.
func (h *googleHandler) callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	in := svc.CallbackInput{State: q.Get("state"), Code: q.Get("code"), Error: q.Get("error")}
	if c, err := r.Cookie(googleStateCookie); err != nil || subtle.ConstantTimeCompare([]byte(c.Value), []byte(in.State)) != 1 {
		in.State = "" // not started in this browser
	}
	h.setCookie(w, googleStateCookie, "", -time.Second)
	acct, err := h.sessionAccount(r)
	in.SessionAccount = acct
	out := svc.CallbackOutcome{Result: svc.ResultFailed}
	if err == nil {
		out, err = h.svc.Callback(r.Context(), in)
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "google callback failed", "error", err)
	}
	if out.Session != nil {
		replaceSession(w, r, h.sessions, out.Session.Token, out.Session.Expires, false)
	}
	if out.PendingToken != "" {
		h.setCookie(w, googlePendingCookie, out.PendingToken, svc.GooglePendingTTL)
	}
	page, ok := googleReturn[out.Intent]
	if !ok {
		page = googleReturn[svc.IntentLogin]
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, h.web+page+"?result="+url.QueryEscape(out.Result), http.StatusFound)
}

func pendingToken(r *http.Request) string {
	if c, err := r.Cookie(googlePendingCookie); err == nil {
		return c.Value
	}
	return ""
}

// pending serves GET /auth/google/pending (getGooglePending).
func (h *googleHandler) pending(w http.ResponseWriter, r *http.Request) {
	email, left, err := h.svc.Pending(r.Context(), pendingToken(r))
	if err != nil {
		(&registerHandler{}).fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, api.GooglePending{Email: email, ExpiresInSeconds: int(left.Seconds())})
}

// complete serves POST /auth/google/complete (completeGoogleSignup).
func (h *googleHandler) complete(w http.ResponseWriter, r *http.Request) {
	var req api.GoogleCompleteRequest
	if !loginDecode(w, r, &req) {
		return
	}
	org := ""
	if req.Organisation != nil {
		org = *req.Organisation
	}
	acc, res, err := h.svc.Complete(r.Context(), pendingToken(r), org, req.RetentionAccepted, req.TermsAccepted)
	if errors.Is(err, svc.ErrGoogleAlreadyLinked) {
		middleware.WriteError(w, r, http.StatusConflict, "google_already_linked", "the Google account is already linked")
		return
	}
	if err != nil {
		(&registerHandler{}).fail(w, r, err)
		return
	}
	h.setCookie(w, googlePendingCookie, "", -time.Second)
	replaceSession(w, r, h.sessions, res.Token, res.Expires, false)
	terms := acc.TermsAcceptedAt.UTC()
	writeJSON(w, http.StatusCreated, api.AuthSession{
		User: api.Account{
			Id: acc.ID, Email: acc.Email, Role: api.UserRole(session.RoleUser), Organisation: acc.Organisation,
			SignInMethods: api.SignInMethods{Google: true}, TermsAcceptedAt: &terms, CreatedAt: acc.CreatedAt.UTC(),
		},
		ExpiresAt: res.Expires.UTC(),
	})
}

// UnlinkGoogleHandler serves DELETE /account/google (unlinkGoogle). The
// account routes mount it behind d.Auth.
func UnlinkGoogleHandler(d app.Deps) http.HandlerFunc {
	return unlinkGoogle(svc.NewGoogle(nil, svc.GooglePGStore{DB: d.DB}, d.Valkey, d.Sessions), d.Sessions)
}

func unlinkGoogle(g *svc.Google, sessions *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.PrincipalFrom(r.Context())
		if !ok {
			middleware.WriteError(w, r, http.StatusUnauthorized, "unauthenticated", "session required")
			return
		}
		err := g.Unlink(r.Context(), p.AccountID)
		switch {
		case errors.Is(err, svc.ErrPasswordRequired):
			middleware.WriteError(w, r, http.StatusConflict, "password_required", "set a password before unlinking Google")
			return
		case errors.Is(err, svc.ErrGoogleNotLinked), errors.Is(err, svc.ErrLoginNoAccount):
			middleware.WriteError(w, r, http.StatusConflict, "google_not_linked", "no Google account is linked")
			return
		case err != nil:
			slog.ErrorContext(r.Context(), "google unlink failed", "error", err)
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "unlink failed")
			return
		}
		pr, err := sessions.Profile(r.Context(), p.AccountID)
		id, uerr := uuid.Parse(pr.ID)
		if err != nil || uerr != nil {
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "profile load failed")
			return
		}
		terms := pr.TermsAcceptedAt.UTC()
		writeJSON(w, http.StatusOK, api.Account{
			Id: id, Email: pr.Email, Role: api.UserRole(pr.Role), Organisation: pr.Organisation,
			SignInMethods:   api.SignInMethods{Password: pr.HasPassword, Google: pr.HasGoogle},
			TermsAcceptedAt: &terms, CreatedAt: pr.CreatedAt.UTC(),
		})
	}
}
