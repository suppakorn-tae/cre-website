// Package mail holds the e-mail templates. All user-facing text is Thai and
// lives in the embedded template files, never in Go code.
package mail

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"strings"
	"text/template"
)

//go:embed otp.subject.txt.tmpl otp.body.txt.tmpl google.subject.txt.tmpl google.body.txt.tmpl
var files embed.FS

var tmpl = template.Must(template.ParseFS(files, "*.tmpl"))

// OTPData is the input of the OTP e-mail.
type OTPData struct {
	// Code is the one-time password.
	Code string
	// ValidMinutes is how long the code stays valid.
	ValidMinutes int
}

// RenderOTP returns the Thai subject and plain-text body of the OTP e-mail.
func RenderOTP(d OTPData) (subject, body string, err error) {
	if d.Code == "" {
		return "", "", errors.New("mail: otp code is empty")
	}
	var s, b bytes.Buffer
	if err := tmpl.ExecuteTemplate(&s, "otp.subject.txt.tmpl", d); err != nil {
		return "", "", fmt.Errorf("mail: render otp subject: %w", err)
	}
	if err := tmpl.ExecuteTemplate(&b, "otp.body.txt.tmpl", d); err != nil {
		return "", "", fmt.Errorf("mail: render otp body: %w", err)
	}
	return strings.TrimSpace(s.String()), b.String(), nil
}

// RenderContinueWithGoogle returns the Thai subject and plain-text body of
// the e-mail sent when a Google-only account asks for a password reset.
func RenderContinueWithGoogle() (subject, body string, err error) {
	var s, b bytes.Buffer
	if err := tmpl.ExecuteTemplate(&s, "google.subject.txt.tmpl", nil); err != nil {
		return "", "", fmt.Errorf("mail: render google subject: %w", err)
	}
	if err := tmpl.ExecuteTemplate(&b, "google.body.txt.tmpl", nil); err != nil {
		return "", "", fmt.Errorf("mail: render google body: %w", err)
	}
	return strings.TrimSpace(s.String()), b.String(), nil
}
