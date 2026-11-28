package auth

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestCommonPasswordListSize(t *testing.T) {
	if n := commonPasswordCount(); n < 3000 {
		t.Fatalf("list has %d entries, want at least 3000", n)
	}
	for l := range commonSet {
		if utf8.RuneCountInString(l) < 8 {
			t.Fatalf("entry %q is shorter than 8 characters", l)
		}
		if l != strings.ToLower(l) {
			t.Fatalf("entry %q is not lower case", l)
		}
	}
}

func TestIsCommonPasswordIgnoresCase(t *testing.T) {
	for _, p := range []string{"password123", "PASSWORD123", "PassWord123", "12345678", "qwertyuiop"} {
		if !IsCommonPassword(p) {
			t.Errorf("%q should be common", p)
		}
	}
	for _, p := range []string{"brand-new-pass", "รหัสผ่านทดสอบ-2569", ""} {
		if IsCommonPassword(p) {
			t.Errorf("%q should not be common", p)
		}
	}
}

func TestResetValidatePasswordRejectsCommon(t *testing.T) {
	if err := ResetValidatePassword("Password123", "Password123"); !errors.Is(err, ErrResetPasswordCommon) {
		t.Fatalf("got %v, want ErrResetPasswordCommon", err)
	}
	if err := ResetValidatePassword("brand-new-pass", "brand-new-pass"); err != nil {
		t.Fatalf("got %v, want nil", err)
	}
}
