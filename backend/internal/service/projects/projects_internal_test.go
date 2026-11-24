package projects

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestExpectedProgress(t *testing.T) {
	start, end := day("2027-01-01"), day("2027-01-11") // 10 days
	cases := []struct {
		now  string
		want int
	}{
		{"2026-12-31T10:00:00Z", 0},
		{"2027-01-01T00:00:00+07:00", 0},
		{"2027-01-02T12:00:00+07:00", 10},
		{"2027-01-06T12:00:00+07:00", 50},
		{"2027-01-11T00:00:00+07:00", 100},
		{"2028-01-01T00:00:00Z", 100},
		// 17:30 UTC is already the next day in Bangkok.
		{"2027-01-05T17:30:00Z", 50},
	}
	for _, c := range cases {
		now, err := time.Parse(time.RFC3339, c.now)
		if err != nil {
			t.Fatal(err)
		}
		if got := ExpectedProgress(start, end, now); got != c.want {
			t.Errorf("%s: got %d, want %d", c.now, got, c.want)
		}
	}
	// 1 of 3 days is 33.3 -> 33; 2 of 3 is 66.7 -> 67 (half up).
	three := day("2027-01-04")
	if got := ExpectedProgress(start, three, day("2027-01-02").Add(5*time.Hour)); got != 33 {
		t.Errorf("1/3: %d", got)
	}
	if got := ExpectedProgress(start, three, day("2027-01-03").Add(5*time.Hour)); got != 67 {
		t.Errorf("2/3: %d", got)
	}
}

func TestLikePattern(t *testing.T) {
	for in, want := range map[string]string{
		"":        "",
		"  ":      "",
		"tao":     "%tao%",
		`100%_a\`: `%100\%\_a\\%`,
	} {
		if got := likePattern(in); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
}

func valid() Fields {
	return Fields{
		Name: "Pier A", Nickname: "PIRA", IslandCode: "koh_tao", TypeCode: "pier",
		StartDate: "2027-01-01", EndDate: "2027-12-31", ValueBaht: "1500000.5", ProgressPct: 10,
	}
}

func TestValidate(t *testing.T) {
	str := func(s string) *string { return &s }
	fe := func(field, code string) FieldError { return FieldError{Field: field, Code: code} }
	cases := []struct {
		name string
		mod  func(*Fields)
		want []FieldError
	}{
		{"ok", func(*Fields) {}, nil},
		{"blank name", func(f *Fields) { f.Name = "  " }, []FieldError{fe("/name", "required")}},
		{"long name", func(f *Fields) { f.Name = strings.Repeat("a", 201) }, []FieldError{fe("/name", "too_long")}},
		{"short nickname", func(f *Fields) { f.Nickname = "AB" }, []FieldError{fe("/nickname", "too_short")}},
		{"long nickname", func(f *Fields) { f.Nickname = "ABCDE" }, []FieldError{fe("/nickname", "too_long")}},
		{"thai nickname counts runes not bytes", func(f *Fields) { f.Nickname = "ปลา" }, nil},
		{"bad island", func(f *Fields) { f.IslandCode = "mars" }, []FieldError{fe("/island_code", "invalid")}},
		{"other needs text", func(f *Fields) { f.IslandCode = "other" }, []FieldError{fe("/island_other", "required")}},
		{"text without other", func(f *Fields) { f.TypeOther = str("x") }, []FieldError{fe("/type_other", "not_allowed")}},
		{"other ok", func(f *Fields) { f.TypeCode, f.TypeOther = "other", str("marina") }, nil},
		{"end not after start", func(f *Fields) { f.EndDate = "2027-01-01" }, []FieldError{fe("/end_date", "must_be_after_start")}},
		{"bad date", func(f *Fields) { f.StartDate = "01/01/2027" }, []FieldError{fe("/start_date", "invalid")}},
		{"missing dates", func(f *Fields) { f.StartDate, f.EndDate = "", "" }, []FieldError{fe("/start_date", "required"), fe("/end_date", "required")}},
		{"zero value", func(f *Fields) { f.ValueBaht = "0" }, []FieldError{fe("/value_baht", "must_be_positive")}},
		{"negative value", func(f *Fields) { f.ValueBaht = "-5" }, []FieldError{fe("/value_baht", "must_be_positive")}},
		{"three decimals", func(f *Fields) { f.ValueBaht = "1.234" }, []FieldError{fe("/value_baht", "too_many_decimals")}},
		{"huge value", func(f *Fields) { f.ValueBaht = "10000000000000" }, []FieldError{fe("/value_baht", "out_of_range")}},
		{"fraction text", func(f *Fields) { f.ValueBaht = "1/2" }, []FieldError{fe("/value_baht", "invalid")}},
		{"progress 101", func(f *Fields) { f.ProgressPct = 101 }, []FieldError{fe("/progress_pct", "out_of_range")}},
		{"progress -1", func(f *Fields) { f.ProgressPct = -1 }, []FieldError{fe("/progress_pct", "out_of_range")}},
		{"progress 100", func(f *Fields) { f.ProgressPct = 100 }, nil},
	}
	for _, c := range cases {
		f := valid()
		c.mod(&f)
		out, err := validate(f)
		var got []FieldError
		var ve *ValidationError
		if errors.As(err, &ve) {
			got = ve.Fields
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
		if c.name == "ok" && out.ValueBaht != "1500000.50" {
			t.Errorf("value not normalised: %q", out.ValueBaht)
		}
	}
}
