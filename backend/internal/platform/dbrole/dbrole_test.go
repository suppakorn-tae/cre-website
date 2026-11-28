package dbrole_test

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/platform/dbrole"
	"github.com/suppakorn-tae/cre-website/backend/internal/platform/log"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
)

func TestCheck(t *testing.T) {
	owner := testutil.NewOwnerDB(t)
	app := testutil.NewAppPool(t, owner)
	ctx := context.Background()

	t.Run("owner warns", func(t *testing.T) {
		var buf bytes.Buffer
		if err := dbrole.Check(ctx, owner, false, log.New(&buf, "info")); err != nil {
			t.Fatalf("non-strict must not fail: %v", err)
		}
		out := buf.String()
		for _, want := range []string{`"level":"WARN"`, `"role":"`, "cre_app", "audit"} {
			if !strings.Contains(out, want) {
				t.Errorf("log %q lacks %q", out, want)
			}
		}
		if strings.Contains(out, "postgres://") || strings.Contains(out, "password") {
			t.Errorf("log leaks a connection string: %q", out)
		}
	})

	t.Run("owner strict errors", func(t *testing.T) {
		var buf bytes.Buffer
		err := dbrole.Check(ctx, owner, true, log.New(&buf, "info"))
		if !errors.Is(err, dbrole.ErrOwnerRole) {
			t.Fatalf("want ErrOwnerRole, got %v", err)
		}
		if buf.Len() != 0 {
			t.Errorf("strict mode logged: %q", buf.String())
		}
	})

	t.Run("cre_app is silent", func(t *testing.T) {
		for _, strict := range []bool{false, true} {
			var buf bytes.Buffer
			if err := dbrole.Check(ctx, app, strict, log.New(&buf, "info")); err != nil {
				t.Fatalf("strict=%t: %v", strict, err)
			}
			if buf.Len() != 0 {
				t.Errorf("strict=%t: unexpected log %q", strict, buf.String())
			}
		}
	})
}
