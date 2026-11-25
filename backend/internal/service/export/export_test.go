package export_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/export"
)

// These requests fail before the service touches the database or the queue.
func TestRequestRejectsBadScopeCombinations(t *testing.T) {
	s := export.New(nil, nil, nil, nil, nil, nil)
	id := uuid.New()
	for name, tc := range map[string]struct {
		p     export.Params
		field string
		code  string
	}{
		"all with users":     {export.Params{Scope: export.ScopeAll, UserIDs: []uuid.UUID{id}}, "/user_ids", export.CodeNotAllowed},
		"selected, no users": {export.Params{Scope: export.ScopeSelected}, "/user_ids", export.CodeRequired},
		"unknown scope":      {export.Params{Scope: "some"}, "/scope", export.CodeInvalidValue},
		"duplicate user":     {export.Params{Scope: export.ScopeSelected, UserIDs: []uuid.UUID{id, id}}, "/user_ids/1", export.CodeDuplicate},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := s.Request(context.Background(), uuid.New(), tc.p)
			var v admin.ValidationError
			if !errors.As(err, &v) || len(v) != 1 || v[0].Field != tc.field || v[0].Code != tc.code {
				t.Fatalf("err = %v, want %s %s", err, tc.field, tc.code)
			}
		})
	}
}
