package mail_test

import (
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/templates/mail"
)

func TestRenderOTP(t *testing.T) {
	subject, body, err := mail.RenderOTP(mail.OTPData{Code: "482915", ValidMinutes: 10})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(subject, "482915") || !strings.Contains(subject, "รหัสยืนยันตัวตน") {
		t.Errorf("subject = %q", subject)
	}
	if strings.ContainsAny(subject, "\r\n") {
		t.Errorf("subject has a line break: %q", subject)
	}
	for _, want := range []string{"482915", "10 นาที", "เรียนผู้ใช้งาน"} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q:\n%s", want, body)
		}
	}
}

func TestRenderOTPEmptyCode(t *testing.T) {
	if _, _, err := mail.RenderOTP(mail.OTPData{ValidMinutes: 10}); err == nil {
		t.Fatal("want error for empty code")
	}
}

func TestRenderContinueWithGoogle(t *testing.T) {
	subject, body, err := mail.RenderContinueWithGoogle()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(subject, "Google") || strings.ContainsAny(subject, "\r\n") {
		t.Errorf("subject = %q", subject)
	}
	if !strings.Contains(body, "เรียนผู้ใช้งาน") || !strings.Contains(body, "Google") {
		t.Errorf("body = %q", body)
	}
}
