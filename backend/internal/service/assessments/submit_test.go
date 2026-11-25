package assessments

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
)

func TestCostToPct(t *testing.T) {
	tests := []struct {
		name  string
		v     float64
		unit  string
		value float64
		want  float64
	}{
		{"percent kept", 85, UnitPercent, 1e8, 85},
		{"baht to percent", 30e6, UnitBaht, 1e8, 30},
		{"baht above value", 150e6, UnitBaht, 1e8, 150},
		{"zero", 0, UnitBaht, 1e8, 0},
	}
	for _, tc := range tests {
		got, err := CostToPct(tc.v, tc.unit, tc.value)
		if err != nil || got != tc.want {
			t.Errorf("%s: got %v, %v; want %v", tc.name, got, err, tc.want)
		}
	}
	for _, unit := range []string{"day", ""} {
		if _, err := CostToPct(1, unit, 1e8); !errors.Is(err, ErrUnit) {
			t.Errorf("unit %q: err = %v, want ErrUnit", unit, err)
		}
	}
}

func TestTimeToPct(t *testing.T) {
	start := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 0, 200)
	if got, err := TimeToPct(50, UnitDay, start, end); err != nil || got != 25 {
		t.Errorf("days: got %v, %v; want 25", got, err)
	}
	if got, err := TimeToPct(40, UnitPercent, start, end); err != nil || got != 40 {
		t.Errorf("percent: got %v, %v; want 40", got, err)
	}
	if _, err := TimeToPct(1, UnitBaht, start, end); !errors.Is(err, ErrUnit) {
		t.Errorf("baht: err = %v, want ErrUnit", err)
	}
	if _, err := TimeToPct(1, UnitDay, end, start); !errors.Is(err, ErrUnit) {
		t.Errorf("negative duration: err = %v, want ErrUnit", err)
	}
}

func TestThresholdsDirection(t *testing.T) {
	f := engine.F
	tests := []struct {
		name          string
		a, b, c, d, e *float64
		want          engine.Direction
	}{
		{"normal five", f(1), f(2), f(3), f(4), f(5), engine.DirectionNormal},
		{"inverse five", f(5), f(4), f(3), f(2), f(1), engine.DirectionInverse},
		{"normal a-c", f(1), f(2), f(3), nil, nil, engine.DirectionNormal},
		{"normal c-e", nil, nil, f(3), f(4), f(5), engine.DirectionNormal},
	}
	for _, tc := range tests {
		if got := thresholdsFrom(tc.a, tc.b, tc.c, tc.d, tc.e).Direction; got != tc.want {
			t.Errorf("%s: direction = %s, want %s", tc.name, got, tc.want)
		}
	}
}

type goldenCase struct {
	Name      string   `json:"name"`
	Indicator string   `json:"indicator"`
	X         float64  `json:"x"`
	Y1        float64  `json:"y1"`
	Y2        float64  `json:"y2"`
	Y3        []string `json:"y3"`
	Expect    struct {
		RL, RIC, RIT, RIE, RIMax, RM float64
		Level                        string
		Advice                       []string
	}
}

func (g *goldenCase) UnmarshalJSON(b []byte) error {
	type plain struct {
		Name      string   `json:"name"`
		Indicator string   `json:"indicator"`
		X         float64  `json:"x"`
		Y1        float64  `json:"y1"`
		Y2        float64  `json:"y2"`
		Y3        []string `json:"y3"`
		Expect    struct {
			RL     float64  `json:"rl"`
			RIC    float64  `json:"ri_c"`
			RIT    float64  `json:"ri_t"`
			RIE    float64  `json:"ri_e"`
			RIMax  float64  `json:"ri_max"`
			RM     float64  `json:"rm"`
			Level  string   `json:"level"`
			Advice []string `json:"advice"`
		} `json:"expect"`
	}
	var p plain
	if err := json.Unmarshal(b, &p); err != nil {
		return err
	}
	g.Name, g.Indicator, g.X, g.Y1, g.Y2, g.Y3 = p.Name, p.Indicator, p.X, p.Y1, p.Y2, p.Y3
	e := p.Expect
	g.Expect.RL, g.Expect.RIC, g.Expect.RIT, g.Expect.RIE = e.RL, e.RIC, e.RIT, e.RIE
	g.Expect.RIMax, g.Expect.RM, g.Expect.Level, g.Expect.Advice = e.RIMax, e.RM, e.Level, e.Advice
	return nil
}

func readJSON(t *testing.T, name string, v any) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "engine", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatal(err)
	}
}

// TestScoreAllMatchesGolden answers the engine golden cases in baht and days
// and checks the stored figures equal the golden values.
func TestScoreAllMatchesGolden(t *testing.T) {
	var g struct {
		Cases []goldenCase `json:"cases"`
	}
	var th struct {
		RIC        map[string]float64            `json:"ri_c"`
		RIT        map[string]float64            `json:"ri_t"`
		Indicators map[string]map[string]*float64 `json:"indicators"`
	}
	readJSON(t, "golden.json", &g)
	readJSON(t, "thresholds.json", &th)
	tab := func(m map[string]float64) engine.ImpactTable {
		return engine.ImpactTable{A: m["a"], B: m["b"], C: m["c"], D: m["d"], E: m["e"]}
	}
	ptr := func(m map[string]*float64, k string) *float64 { return m[k] }
	start := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	f := Frozen{
		ValueBaht: 1e8, Start: start, End: start.AddDate(0, 0, 100), Score: 2, RM: 3,
		RL: map[string]engine.Thresholds{}, ImpactC: tab(th.RIC), ImpactT: tab(th.RIT),
	}
	for code, m := range th.Indicators {
		f.RL[code] = thresholdsFrom(ptr(m, "a"), ptr(m, "b"), ptr(m, "c"), ptr(m, "d"), ptr(m, "e"))
	}
	if len(g.Cases) == 0 {
		t.Fatal("no golden cases")
	}
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-9 }
	for _, c := range g.Cases {
		// 100 days long, so y2 days equal y2 percent; 1e8 baht, so y1 baht = y1 * 1e6.
		in := Complete{
			Code: c.Indicator, X: c.X, Y1: c.Y1 * 1e6, Y1Unit: UnitBaht,
			Y2: c.Y2, Y2Unit: UnitDay, Y3: c.Y3,
		}
		got, err := ScoreAll(f, []Complete{in})
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		r, e := got[0], c.Expect
		if !near(r.Input.Y1Pct, c.Y1) || !near(r.Input.Y2Pct, c.Y2) {
			t.Errorf("%s: converted y1 %v y2 %v, want %v %v", c.Name, r.Input.Y1Pct, r.Input.Y2Pct, c.Y1, c.Y2)
		}
		advice := make([]string, len(r.Advice))
		for i, a := range r.Advice {
			advice[i] = string(a)
		}
		if e.Advice == nil {
			e.Advice = []string{}
		}
		if !near(r.RL, e.RL) || !near(r.RIC, e.RIC) || !near(r.RIT, e.RIT) || !near(r.RIE, e.RIE) ||
			!near(r.RIMax, e.RIMax) || !near(r.RM, e.RM) || string(r.Level) != e.Level ||
			!reflect.DeepEqual(advice, e.Advice) {
			t.Errorf("%s: got %+v, want %+v", c.Name, r.Result, e)
		}
	}
}

func TestScoreAllFailsOnAnyIndicator(t *testing.T) {
	f := Frozen{ValueBaht: 1e8, Start: time.Now(), End: time.Now().AddDate(0, 1, 0), RL: map[string]engine.Thresholds{}}
	if _, err := ScoreAll(f, []Complete{{Code: "XX-XX-1"}}); err == nil {
		t.Fatal("missing snapshot thresholds must fail")
	}
}
