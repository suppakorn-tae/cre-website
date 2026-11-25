package assessments_test

import (
	"slices"
	"strconv"
	"testing"

	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
)

func f(v float64) *float64 { return &v }

func at(i int) string { return "/answers/" + strconv.Itoa(i) }

func TestValidateAnswers(t *testing.T) {
	const code = "EC-HS-2"
	tests := []struct {
		name string
		in   svc.AnswerInput
		want []svc.FieldError
	}{
		{"empty answer is a valid clear", svc.AnswerInput{IndicatorCode: code}, nil},
		{"full answer", svc.AnswerInput{
			IndicatorCode: code, X: f(0),
			Y1: &svc.Impact{Value: 1e6, Unit: "baht"}, Y2: &svc.Impact{Value: 30, Unit: "day"},
			Y3: []string{"B", "C"},
		}, nil},
		{"percent at 100 is fine", svc.AnswerInput{IndicatorCode: code, Y1: &svc.Impact{Value: 100, Unit: "percent"}}, nil},
		{
			"negative x",
			svc.AnswerInput{IndicatorCode: code, X: f(-0.5)},
			[]svc.FieldError{{Field: "/answers/0/x", Code: "out_of_range"}},
		},
		{
			"y1 percent above 100",
			svc.AnswerInput{IndicatorCode: code, Y1: &svc.Impact{Value: 100.5, Unit: "percent"}},
			[]svc.FieldError{{Field: "/answers/0/y1/value", Code: "out_of_range"}},
		},
		{
			"y2 percent above 100",
			svc.AnswerInput{IndicatorCode: code, Y2: &svc.Impact{Value: 101, Unit: "percent"}},
			[]svc.FieldError{{Field: "/answers/0/y2/value", Code: "out_of_range"}},
		},
		{"baht above 100 is fine", svc.AnswerInput{IndicatorCode: code, Y1: &svc.Impact{Value: 5000, Unit: "baht"}}, nil},
		{
			"negative day",
			svc.AnswerInput{IndicatorCode: code, Y2: &svc.Impact{Value: -1, Unit: "day"}},
			[]svc.FieldError{{Field: "/answers/0/y2/value", Code: "out_of_range"}},
		},
		{
			"wrong units",
			svc.AnswerInput{
				IndicatorCode: code,
				Y1:            &svc.Impact{Value: 1, Unit: "day"}, Y2: &svc.Impact{Value: 1, Unit: "baht"},
			},
			[]svc.FieldError{
				{Field: "/answers/0/y1/unit", Code: "invalid_unit"},
				{Field: "/answers/0/y2/unit", Code: "invalid_unit"},
			},
		},
		{
			"A with B",
			svc.AnswerInput{IndicatorCode: code, Y3: []string{"A", "B"}},
			[]svc.FieldError{{Field: "/answers/0/y3", Code: "exclusive_option"}},
		},
		{"A alone", svc.AnswerInput{IndicatorCode: code, Y3: []string{"A"}}, nil},
		{
			"option outside A-I",
			svc.AnswerInput{IndicatorCode: code, Y3: []string{"J"}},
			[]svc.FieldError{{Field: "/answers/0/y3/0", Code: "invalid_option"}},
		},
		{
			"duplicate option",
			svc.AnswerInput{IndicatorCode: code, Y3: []string{"B", "B"}},
			[]svc.FieldError{{Field: "/answers/0/y3/1", Code: "duplicate_option"}},
		},
		{
			"bad code",
			svc.AnswerInput{IndicatorCode: "nope"},
			[]svc.FieldError{{Field: "/answers/0/indicator_code", Code: "invalid_indicator_code"}},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := svc.ValidateAnswers([]svc.AnswerInput{tc.in}, at)
			if !slices.Equal(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestValidateAnswersDuplicateIndicatorAndIndex(t *testing.T) {
	in := []svc.AnswerInput{{IndicatorCode: "EC-HS-2"}, {IndicatorCode: "EC-HS-3", X: f(-1)}, {IndicatorCode: "EC-HS-2"}}
	got := svc.ValidateAnswers(in, at)
	want := []svc.FieldError{
		{Field: "/answers/1/x", Code: "out_of_range"},
		{Field: "/answers/2/indicator_code", Code: "duplicate_indicator"},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
