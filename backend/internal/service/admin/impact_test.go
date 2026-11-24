package admin_test

import (
	"testing"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/admin"
)

func TestValidateImpact(t *testing.T) {
	for name, tc := range map[string]struct {
		v     [5]float64
		field string
		code  string
	}{
		"valid":      {[5]float64{0, 1, 2, 3, 4}, "", ""},
		"zero start": {[5]float64{0, 0.5, 1, 2, 3}, "", ""},
		"equal":      {[5]float64{1, 2, 2, 4, 5}, "/ri_c", admin.CodeInvalidOrder},
		"reversed":   {[5]float64{5, 4, 3, 2, 1}, "/ri_c", admin.CodeInvalidOrder},
		"negative":   {[5]float64{-1, 2, 3, 4, 5}, "/ri_c/a", admin.CodeNegative},
	} {
		t.Run(name, func(t *testing.T) {
			err := admin.ValidateImpact("/ri_c", tc.v)
			if tc.code == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			ve, ok := err.(admin.ValidationError)
			if !ok || len(ve) != 1 || ve[0].Field != tc.field || ve[0].Code != tc.code {
				t.Fatalf("got %#v, want %s %s", err, tc.field, tc.code)
			}
		})
	}
}
