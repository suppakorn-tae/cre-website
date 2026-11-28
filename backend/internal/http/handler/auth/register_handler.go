package auth

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

// maxBody caps a sign-up request body.
const maxBody = 16 << 10

// Rate limits of the sign-up routes: env prefix, default requests per window.
// Each prefix reads <prefix>_LIMIT and <prefix>_WINDOW.
const (
	rlSignupIP    = "RL_SIGNUP_IP"       // POST /auth/register/start per IP
	rlSignupEmail = "RL_SIGNUP_EMAIL"    // POST /auth/register/start per e-mail
	rlOTPIP       = "RL_OTP_IP"          // POST /auth/register/verify per IP
	rlOTPEmail    = "RL_OTP_EMAIL"       // POST /auth/register/verify per e-mail
	rlResendIP    = "RL_OTP_RESEND_IP"   // POST /auth/register/resend per IP
	rlResendEmail = "RL_OTP_RESEND_MAIL" // POST /auth/register/resend per e-mail
)

// registerRoutes mounts the sign-up endpoints under /auth.
func registerRoutes(r chi.Router, d app.Deps) {
	limit := func(prefix string, n int, w time.Duration, key middleware.KeyFunc) func(http.Handler) http.Handler {
		if d.RateLimit == nil {
			return app.PassThrough
		}
		return d.RateLimit(prefix, n, w, key)
	}
	h := &registerHandler{
		svc:      auth.NewRegister(auth.PGStore{DB: d.DB}, d.Valkey, d.Mailer),
		sessions: d.Sessions,
		hasMail:  d.Mailer != nil,
	}
	r.With(limit(rlSignupIP, 10, time.Hour, middleware.KeyIP), limit(rlSignupEmail, 5, time.Hour, middleware.KeyEmail)).
		Post("/register/start", h.start)
	r.With(limit(rlOTPIP, 30, 15*time.Minute, middleware.KeyIP), limit(rlOTPEmail, 20, 15*time.Minute, middleware.KeyEmail)).
		Post("/register/verify", h.verify)
	r.With(limit(rlResendIP, 10, 15*time.Minute, middleware.KeyIP), limit(rlResendEmail, 5, 15*time.Minute, middleware.KeyEmail)).
		Post("/register/resend", h.resend)
}

type registerHandler struct {
	svc      *auth.Register
	sessions *session.Service
	hasMail  bool
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil || json.Unmarshal(body, v) != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "body is not valid JSON")
		return false
	}
	return true
}

func requestID(r *http.Request) *string {
	if id := log.RequestID(r.Context()); id != "" {
		return &id
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func challenge(c auth.Challenge) api.OtpChallenge {
	return api.OtpChallenge{
		ExpiresInSeconds:         int(c.ExpiresIn.Seconds()),
		ResendAvailableInSeconds: int(c.ResendIn.Seconds()),
	}
}

// fail maps a service error to the contract's error responses.
func (h *registerHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var (
		v  auth.ValidationError
		cd auth.CooldownError
	)
	switch {
	case errors.As(err, &v):
		fields := make([]api.FieldError, len(v))
		for i, f := range v {
			fields[i] = api.FieldError{Field: f.Field, Code: f.Code}
		}
		rid := requestID(r)
		writeJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
			Code: "validation_failed", Message: "the request failed validation", Fields: fields, RequestId: rid,
		}})
	case errors.As(err, &cd):
		w.Header().Set("Retry-After", strconv.Itoa(int(cd.RetryAfter.Seconds())))
		middleware.WriteError(w, r, http.StatusTooManyRequests, "otp_resend_cooldown", "a code was sent a moment ago")
	case errors.Is(err, auth.ErrEmailTaken):
		middleware.WriteError(w, r, http.StatusConflict, "email_taken", "the e-mail is already registered")
	case errors.Is(err, auth.ErrNoPending):
		middleware.WriteError(w, r, http.StatusNotFound, "no_pending_signup", "there is no pending sign-up for this e-mail")
	case errors.Is(err, auth.ErrOTPInvalid):
		h.otpError(w, r, "otp_invalid", "the code is wrong")
	case errors.Is(err, auth.ErrOTPExpired):
		h.otpError(w, r, "otp_expired", "the code has expired")
	case errors.Is(err, auth.ErrOTPLocked):
		h.otpError(w, r, "otp_locked", "too many wrong codes")
	case errors.Is(err, auth.ErrMailFailed):
		slog.ErrorContext(r.Context(), "sign-up e-mail failed", "error", err)
		middleware.WriteError(w, r, http.StatusServiceUnavailable, "mail_unavailable", "the e-mail could not be sent")
	default:
		slog.ErrorContext(r.Context(), "sign-up failed", "error", err)
		middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "sign-up failed")
	}
}

// otpError answers 422 with the field /otp, the shape the contract uses for
// every OTP failure.
func (h *registerHandler) otpError(w http.ResponseWriter, r *http.Request, code, msg string) {
	writeJSON(w, http.StatusUnprocessableEntity, api.ValidationErrorEnvelope{Error: api.ValidationErrorBody{
		Code: code, Message: msg, Fields: []api.FieldError{{Field: "/otp", Code: code}}, RequestId: requestID(r),
	}})
}

// mailReady answers 503 when no mailer is configured.
func (h *registerHandler) mailReady(w http.ResponseWriter, r *http.Request) bool {
	if h.hasMail {
		return true
	}
	middleware.WriteError(w, r, http.StatusServiceUnavailable, "mail_unavailable", "e-mail is not configured")
	return false
}

func (h *registerHandler) start(w http.ResponseWriter, r *http.Request) {
	if !h.mailReady(w, r) {
		return
	}
	var req api.RegisterStartRequest
	if !decode(w, r, &req) {
		return
	}
	in := auth.StartInput{
		Email: req.Email, Password: req.Password, PasswordConfirmation: req.PasswordConfirmation,
		RetentionAccepted: req.RetentionAccepted, TermsAccepted: req.TermsAccepted,
	}
	if req.Organisation != nil {
		in.Organisation = *req.Organisation
	}
	ch, err := h.svc.Start(r.Context(), in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, challenge(ch))
}

func (h *registerHandler) resend(w http.ResponseWriter, r *http.Request) {
	if !h.mailReady(w, r) {
		return
	}
	var req api.EmailRequest
	if !decode(w, r, &req) {
		return
	}
	ch, err := h.svc.Resend(r.Context(), req.Email)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, challenge(ch))
}

func (h *registerHandler) verify(w http.ResponseWriter, r *http.Request) {
	var req api.RegisterVerifyRequest
	if !decode(w, r, &req) {
		return
	}
	acc, err := h.svc.Verify(r.Context(), req.Email, req.Otp)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	tok, exp := h.sessions.Issue(acc.ID.String(), acc.SessionVersion, false)
	replaceSession(w, r, h.sessions, tok, exp, false)
	terms := acc.TermsAcceptedAt
	writeJSON(w, http.StatusCreated, api.AuthSession{
		User: api.Account{
			Id: acc.ID, Email: acc.Email, Role: api.UserRole(session.RoleUser), Organisation: acc.Organisation,
			SignInMethods:   api.SignInMethods{Password: true},
			TermsAcceptedAt: &terms, CreatedAt: acc.CreatedAt.UTC(),
		},
		ExpiresAt:    exp.UTC(),
		KeepLoggedIn: false,
	})
}
