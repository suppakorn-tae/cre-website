package auth

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/mailer"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/app"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/auth"
)

// loginJSON writes v as a JSON body with the given status.
func loginJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// loginRoutes mounts log in, log out, forgot and reset. mail sends the reset
// code; when it is nil (no SMTP configured) forgot answers 503
// mail_unavailable for every e-mail.
//
// Rate limits (env <prefix>_LIMIT and <prefix>_WINDOW override the defaults):
// RL_LOGIN_IP, RL_LOGIN_EMAIL, RL_RESET_REQ_IP, RL_RESET_REQ_EMAIL,
// RL_RESET_VERIFY_IP, RL_RESET_VERIFY_EMAIL.
func loginRoutes(r chi.Router, d app.Deps, mail mailer.Mailer) {
	store := svc.LoginPGStore{DB: d.DB}
	logins, err := svc.NewLoginService(store, d.Sessions)
	if err != nil {
		panic("auth: build login service: " + err.Error())
	}
	logger := d.Logger
	if logger == nil {
		logger = slog.Default()
	}
	resets, err := svc.NewResetService(store, d.Sessions, d.Valkey, mail, logger)
	if err != nil {
		panic("auth: build reset service: " + err.Error())
	}
	rl := d.RateLimit
	if rl == nil { // Deps built without WireAuth (router tests)
		rl = func(string, int, time.Duration, middleware.KeyFunc) app.Middleware { return app.PassThrough }
	}
	r.With(rl("RL_LOGIN_IP", 20, 15*time.Minute, middleware.KeyIP),
		rl("RL_LOGIN_EMAIL", 10, 15*time.Minute, middleware.KeyEmail)).
		Post("/login", login(logins, d.Sessions))
	r.With(d.Auth).Post("/logout", logout(d.Sessions))
	r.With(rl("RL_RESET_REQ_IP", 10, time.Hour, middleware.KeyIP),
		rl("RL_RESET_REQ_EMAIL", 5, time.Hour, middleware.KeyEmail)).
		Post("/password/forgot", requestPasswordReset(resets))
	r.With(rl("RL_RESET_VERIFY_IP", 20, 15*time.Minute, middleware.KeyIP),
		rl("RL_RESET_VERIFY_EMAIL", 10, 15*time.Minute, middleware.KeyEmail)).
		Post("/password/reset", resetPassword(resets))
}
