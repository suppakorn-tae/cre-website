package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
)

const loginMaxBody = 16 << 10

var loginEmailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+$`)

// loginFieldErr is one entry of ValidationErrorBody.fields.
type loginFieldErr struct{ field, code string }

// loginDecode reads a small JSON body into v and answers 400 on failure.
func loginDecode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, loginMaxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		middleware.WriteError(w, r, http.StatusBadRequest, "bad_request", "malformed JSON body")
		return false
	}
	return true
}

// loginInvalid answers 422 with the field errors (ValidationErrorEnvelope).
func loginInvalid(w http.ResponseWriter, _ *http.Request, errs ...loginFieldErr) {
	fields := make([]api.FieldError, 0, len(errs))
	for _, e := range errs {
		fields = append(fields, api.FieldError{Field: e.field, Code: e.code})
	}
	body := api.ValidationErrorBody{Code: "validation_failed", Message: "request failed validation", Fields: fields}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(struct {
		Error api.ValidationErrorBody `json:"error"`
	}{body})
}

// loginValidEmail applies the contract rule: one "@", no spaces, at most 254.
func loginValidEmail(s string) bool {
	return len(s) <= 254 && loginEmailRe.MatchString(s)
}

// login serves POST /auth/login.
func login(l *svc.LoginService, sessions *session.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req api.LoginRequest
		if !loginDecode(w, r, &req) {
			return
		}
		email := string(req.Email)
		var bad []loginFieldErr
		if !loginValidEmail(email) {
			bad = append(bad, loginFieldErr{"/email", "invalid_email"})
		}
		if req.Password == "" || utf8.RuneCountInString(req.Password) > svc.ResetMaxPassword {
			bad = append(bad, loginFieldErr{"/password", "invalid_password"})
		}
		if len(bad) > 0 {
			loginInvalid(w, r, bad...)
			return
		}
		keep := req.KeepLoggedIn != nil && *req.KeepLoggedIn
		res, err := l.Login(r.Context(), email, req.Password, keep)
		switch {
		case errors.Is(err, svc.ErrInvalidCredentials):
			middleware.WriteError(w, r, http.StatusUnauthorized, "invalid_credentials", "e-mail or password is wrong")
			return
		case errors.Is(err, svc.ErrAccountUnavailable):
			middleware.WriteError(w, r, http.StatusForbidden, "account_unavailable", "account is not available")
			return
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "log in failed")
			return
		}
		pr, perr := sessions.Profile(r.Context(), res.AccountID)
		id, uerr := uuid.Parse(res.AccountID)
		if perr != nil || uerr != nil {
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "profile load failed")
			return
		}
		replaceSession(w, r, sessions, res.Token, res.Expires, res.Remember)
		loginWriteSession(w, http.StatusOK, pr, id, res.Expires, res.Remember)
	}
}
