package s3_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
)

func newOffline(t *testing.T) *s3.Store {
	t.Helper()
	st, err := s3.New(s3.Config{Endpoint: "http://127.0.0.1:1", Bucket: "cre", AccessKey: "a", SecretKey: "bbbbbbbb"})
	if err != nil {
		t.Fatal(err)
	}
	return st
}

func TestNewValidates(t *testing.T) {
	for _, cfg := range []s3.Config{
		{Bucket: "cre"},
		{Endpoint: "http://h:9000"},
		{Endpoint: "h:9000", Bucket: "cre"},
		{Endpoint: "ftp://h", Bucket: "cre"},
	} {
		if _, err := s3.New(cfg); err == nil {
			t.Errorf("New(%+v): want error", cfg)
		}
	}
}

// Key checks run before any network call, so no server is needed.
func TestKeysOutsidePrefixesRejected(t *testing.T) {
	st := newOffline(t)
	ctx := context.Background()
	for _, key := range []string{"", "other/a.pdf", "reports/", "exports/", "reports/../x", "reports//x", "/reports/a"} {
		if err := st.Put(ctx, key, strings.NewReader("x"), 1, ""); !errors.Is(err, s3.ErrInvalidKey) {
			t.Errorf("Put(%q) err = %v, want ErrInvalidKey", key, err)
		}
		if _, err := st.Get(ctx, key); !errors.Is(err, s3.ErrInvalidKey) {
			t.Errorf("Get(%q) err = %v, want ErrInvalidKey", key, err)
		}
		if _, err := st.Exists(ctx, key); !errors.Is(err, s3.ErrInvalidKey) {
			t.Errorf("Exists(%q) err = %v, want ErrInvalidKey", key, err)
		}
		if err := st.Delete(ctx, key); !errors.Is(err, s3.ErrInvalidKey) {
			t.Errorf("Delete(%q) err = %v, want ErrInvalidKey", key, err)
		}
	}
}
