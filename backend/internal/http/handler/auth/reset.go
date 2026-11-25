package auth

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/api"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
)

var resetOTPRe = regexp.MustCompile(`^[0-9]{6}$`)

// requestPasswordReset serves POST /auth/password/forgot. The answer is the
// same whether or not the e-mail is registered.
func requestPasswordReset(s *svc.ResetService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req api.EmailRequest
		if !loginDecode(w, r, &req) {
			return
		}
		email := string(req.Email)
		if !loginValidEmail(email) {
			loginInvalid(w, r, loginFieldErr{"/email", "invalid_email"})
			return
		}
		ch, err := s.RequestCode(r.Context(), email)
		switch {
		case errors.Is(err, svc.ErrResetCooldown):
			w.Header().Set("Retry-After", strconv.Itoa(int(svc.ResetResendAfter.Seconds())))
			middleware.WriteError(w, r, http.StatusTooManyRequests, "otp_resend_cooldown", "wait before asking for a new code")
			return
		case errors.Is(err, svc.ErrResetMailUnavailable):
			middleware.WriteError(w, r, http.StatusServiceUnavailable, "mail_unavailable", "e-mail is not configured")
			return
		case err != nil:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "could not start reset")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		loginJSON(w, http.StatusOK, api.OtpChallenge{
			ExpiresInSeconds:         int(ch.ExpiresIn.Seconds()),
			ResendAvailableInSeconds: int(ch.ResendIn.Seconds()),
		})
	}
}

// resetPassword serves POST /auth/password/reset. No cookie is set.
func resetPassword(s *svc.ResetService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req api.ResetPasswordRequest
		if !loginDecode(w, r, &req) {
			return
		}
		email := string(req.Email)
		if !loginValidEmail(email) {
			loginInvalid(w, r, loginFieldErr{"/email", "invalid_email"})
			return
		}
		if !resetOTPRe.MatchString(string(req.Otp)) {
			loginInvalid(w, r, loginFieldErr{"/otp", "otp_invalid"})
			return
		}
		err := s.Reset(r.Context(), email, string(req.Otp), string(req.NewPassword), string(req.NewPasswordConfirmation))
		switch {
		case err == nil:
			w.WriteHeader(http.StatusNoContent)
		case errors.Is(err, svc.ErrResetOTPInvalid):
			loginInvalid(w, r, loginFieldErr{"/otp", "otp_invalid"})
		case errors.Is(err, svc.ErrResetOTPExpired):
			loginInvalid(w, r, loginFieldErr{"/otp", "otp_expired"})
		case errors.Is(err, svc.ErrResetOTPLocked):
			loginInvalid(w, r, loginFieldErr{"/otp", "otp_locked"})
		case errors.Is(err, svc.ErrResetPasswordShort):
			loginInvalid(w, r, loginFieldErr{"/new_password", "password_too_short"})
		case errors.Is(err, svc.ErrResetPasswordMismatch):
			loginInvalid(w, r, loginFieldErr{"/new_password_confirmation", "password_mismatch"})
		default:
			middleware.WriteError(w, r, http.StatusInternalServerError, "internal", "reset failed")
		}
	}
}
