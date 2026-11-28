package account

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// Validation runs before any database access, so a zero Service is enough.
func TestChangePasswordRejectsCommonPassword(t *testing.T) {
	var s Service
	for _, p := range []string{"password123", "PASSWORD123", "12345678"} {
		_, err := s.ChangePassword(context.Background(), uuid.New(), "whatever-current", p, p)
		var fe *FieldError
		if !errors.As(err, &fe) || fe.Field != "/new_password" || fe.Code != "password_too_common" {
			t.Fatalf("%q: got %v, want password_too_common on /new_password", p, err)
		}
	}
}
