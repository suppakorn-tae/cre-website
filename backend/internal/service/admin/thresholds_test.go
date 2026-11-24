package admin_test

import (
	"errors"
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

func vals(a, b, c, d, e *float64) admin.Values { return admin.Values{A: a, B: b, C: c, D: d, E: e} }

func TestValidateRL(t *testing.T) {
	f := engine.F
	tests := []struct {
		name  string
		dir   engine.Direction
		v     admin.Values
		field string
		code  string // empty means valid
	}{
		{"all five", engine.DirectionNormal, vals(f(1), f(2), f(3), f(4), f(5)), "", ""},
		{"a-c only", engine.DirectionNormal, vals(f(1), f(2), f(3), nil, nil), "", ""},
		{"c-e only", engine.DirectionNormal, vals(nil, nil, f(3), f(4), f(5)), "", ""},
		{"zero start", engine.DirectionNormal, vals(f(0), f(2), f(3), f(4), f(5)), "", ""},
		{"inverse decreasing", engine.DirectionInverse, vals(f(5), f(4), f(3), f(2), f(1)), "", ""},
		{"inverse increasing", engine.DirectionInverse, vals(f(1), f(2), f(3), f(4), f(5)), "/thresholds", admin.CodeInvalidOrder},
		{"normal decreasing", engine.DirectionNormal, vals(f(5), f(4), f(3), f(2), f(1)), "/thresholds", admin.CodeInvalidOrder},
		{"equal neighbours", engine.DirectionNormal, vals(f(1), f(1), f(3), f(4), f(5)), "/thresholds", admin.CodeInvalidOrder},
		{"gap in pattern", engine.DirectionNormal, vals(f(1), f(2), nil, f(4), f(5)), "/thresholds", admin.CodeInvalidPattern},
		{"only one", engine.DirectionNormal, vals(nil, nil, f(3), nil, nil), "/thresholds", admin.CodeInvalidPattern},
		{"none", engine.DirectionNormal, vals(nil, nil, nil, nil, nil), "/thresholds", admin.CodeInvalidPattern},
		{"b-d only", engine.DirectionNormal, vals(nil, f(2), f(3), f(4), nil), "/thresholds", admin.CodeInvalidPattern},
		{"inverse a-c only", engine.DirectionInverse, vals(f(3), f(2), f(1), nil, nil), "/thresholds", admin.CodeInvalidPattern},
		{"negative", engine.DirectionNormal, vals(f(-1), f(2), f(3), f(4), f(5)), "/thresholds/a", admin.CodeNegative},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := admin.ValidateRL(tc.dir, tc.v)
			if tc.code == "" {
				if err != nil {
					t.Fatalf("want valid, got %v", err)
				}
				return
			}
			var ve admin.ValidationError
			if !errors.As(err, &ve) || len(ve) != 1 || ve[0].Field != tc.field || ve[0].Code != tc.code {
				t.Fatalf("got %v, want field %s code %s", err, tc.field, tc.code)
			}
		})
	}
}
