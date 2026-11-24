package engine

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

// Golden expectations in testdata/golden.json are produced by
// testdata/gen_golden.py from the formulas in the risk-engine document, not
// by this package.

type goldenExpect struct {
	RL     float64  `json:"rl"`
	RIC    float64  `json:"ri_c"`
	RIT    float64  `json:"ri_t"`
	RIE    float64  `json:"ri_e"`
	RIMax  float64  `json:"ri_max"`
	RM     float64  `json:"rm"`
	Level  string   `json:"level"`
	Advice []string `json:"advice"`
}

type goldenCase struct {
	Name      string       `json:"name"`
	Indicator string       `json:"indicator"`
	X         float64      `json:"x"`
	Y1        float64      `json:"y1"`
	Y2        float64      `json:"y2"`
	Y3        []string     `json:"y3"`
	Expect    goldenExpect `json:"expect"`
}

type goldenScores struct {
	Name   string       `json:"name"`
	RL     float64      `json:"rl"`
	RIC    float64      `json:"ri_c"`
	RIT    float64      `json:"ri_t"`
	RIE    float64      `json:"ri_e"`
	Expect goldenExpect `json:"expect"`
}

type goldenFile struct {
	Cases  []goldenCase   `json:"cases"`
	Worked []goldenCase   `json:"worked"`
	Scores []goldenScores `json:"scores"`
}

type thresholdRow struct {
	A *float64 `json:"a"`
	B *float64 `json:"b"`
	C *float64 `json:"c"`
	D *float64 `json:"d"`
	E *float64 `json:"e"`
}

type thresholdFile struct {
	RIC        map[string]float64      `json:"ri_c"`
	RIT        map[string]float64      `json:"ri_t"`
	Indicators map[string]thresholdRow `json:"indicators"`
}

func readJSON(t testing.TB, path string, v any) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
}

func (r thresholdRow) toThresholds() Thresholds {
	th := Thresholds{A: r.A, B: r.B, C: r.C, D: r.D, E: r.E, Direction: DirectionNormal}
	if r.A != nil && r.E != nil && *r.A > *r.E {
		th.Direction = DirectionInverse
	}
	return th
}

func table(m map[string]float64) ImpactTable {
	return ImpactTable{A: m["a"], B: m["b"], C: m["c"], D: m["d"], E: m["e"]}
}

func loadSnapshot(t *testing.T, code string, tf thresholdFile) Snapshot {
	t.Helper()
	row, ok := tf.Indicators[code]
	if !ok {
		t.Fatalf("%s: indicator missing from testdata/thresholds.json", code)
	}
	return Snapshot{
		Thresholds:    row.toThresholds(),
		ImpactC:       table(tf.RIC),
		ImpactT:       table(tf.RIT),
		ScoreDecimals: DefaultScoreDecimals,
		RMDecimals:    DefaultRMDecimals,
	}
}

func options(in []string) []Option {
	out := make([]Option, len(in))
	for i, o := range in {
		out[i] = Option(o)
	}
	return out
}

func adviceKeys(in []AdviceList) []string {
	out := make([]string, len(in))
	for i, a := range in {
		out[i] = string(a)
	}
	return out
}

func compare(t *testing.T, label string, got Result, want goldenExpect) {
	t.Helper()
	gotE := goldenExpect{
		RL: got.RL, RIC: got.RIC, RIT: got.RIT, RIE: got.RIE, RIMax: got.RIMax,
		RM: got.RM, Level: string(got.Level), Advice: adviceKeys(got.Advice),
	}
	if want.Advice == nil {
		want.Advice = []string{}
	}
	if !reflect.DeepEqual(gotE, want) {
		t.Errorf("%s:\n  expected %+v\n  actual   %+v", label, want, gotE)
	}
}

func TestScoreGolden(t *testing.T) {
	var g goldenFile
	var tf thresholdFile
	readJSON(t, filepath.Join("testdata", "golden.json"), &g)
	readJSON(t, filepath.Join("testdata", "thresholds.json"), &tf)

	perIndicator := map[string]int{}
	for _, c := range append(slices.Clone(g.Cases), g.Worked...) {
		perIndicator[c.Indicator]++
		snap := loadSnapshot(t, c.Indicator, tf)
		got, err := Score(Input{X: c.X, Y1Pct: c.Y1, Y2Pct: c.Y2, Y3: options(c.Y3)}, snap)
		if err != nil {
			t.Errorf("%s [%s]: unexpected error: %v", c.Indicator, c.Name, err)
			continue
		}
		compare(t, c.Indicator+" ["+c.Name+"]", got, c.Expect)
	}

	if len(tf.Indicators) != 55 {
		t.Fatalf("thresholds.json has %d indicators, want 55", len(tf.Indicators))
	}
	for code := range tf.Indicators {
		if perIndicator[code] < 3 {
			t.Errorf("%s: %d golden cases, want at least 3", code, perIndicator[code])
		}
	}
}

// The score-level cases (advice table, RM grid, level borders) skip the
// likelihood and impact scoring and feed scores to ComputeRM and SelectAdvice.
func TestGoldenScores(t *testing.T) {
	var g goldenFile
	readJSON(t, filepath.Join("testdata", "golden.json"), &g)
	for _, c := range g.Scores {
		rm, err := ComputeRM(c.RL, c.RIC, c.RIT, c.RIE, DefaultScoreDecimals, DefaultRMDecimals)
		if err != nil {
			t.Errorf("[%s]: unexpected error: %v", c.Name, err)
			continue
		}
		got := Result{RMResult: rm, Advice: SelectAdvice(string(rm.Level), rm.RL, rm.RIC, rm.RIT, rm.RIE)}
		compare(t, "["+c.Name+"]", got, c.Expect)
	}
}

// thresholds.json must match the seed file in the specs, when present.
func TestThresholdsMatchSeed(t *testing.T) {
	seedPath := filepath.Join("..", "..", "..", "docs", "specs", "risk-engine", "cre-indicators.json")
	if _, err := os.Stat(seedPath); err != nil {
		t.Skipf("seed file not available: %v", err)
	}
	var seed struct {
		RIC        map[string]float64 `json:"ri_c_thresholds"`
		RIT        map[string]float64 `json:"ri_t_thresholds"`
		Indicators []struct {
			GroupID string   `json:"group_id"`
			A       *float64 `json:"a"`
			B       *float64 `json:"b"`
			C       *float64 `json:"c"`
			D       *float64 `json:"d"`
			E       *float64 `json:"e"`
		} `json:"indicators"`
	}
	readJSON(t, seedPath, &seed)
	var tf thresholdFile
	readJSON(t, filepath.Join("testdata", "thresholds.json"), &tf)

	if !reflect.DeepEqual(seed.RIC, tf.RIC) || !reflect.DeepEqual(seed.RIT, tf.RIT) {
		t.Error("impact tables differ from the seed file")
	}
	if len(seed.Indicators) != len(tf.Indicators) {
		t.Fatalf("seed has %d indicators, thresholds.json %d", len(seed.Indicators), len(tf.Indicators))
	}
	for _, ind := range seed.Indicators {
		want := thresholdRow{ind.A, ind.B, ind.C, ind.D, ind.E}
		if !reflect.DeepEqual(want, tf.Indicators[ind.GroupID]) {
			t.Errorf("%s: thresholds differ from the seed file", ind.GroupID)
		}
	}
}

func TestScoreErrors(t *testing.T) {
	snap := Snapshot{
		Thresholds:    Thresholds{A: F(1), B: F(2), C: F(3), D: F(4), E: F(5), Direction: DirectionNormal},
		ImpactC:       ImpactTable{A: 9.58, B: 23.92, C: 47.5, D: 61.42, E: 80},
		ImpactT:       ImpactTable{A: 13.79, B: 23.33, C: 46.67, D: 60.83, E: 79.33},
		ScoreDecimals: DefaultScoreDecimals,
		RMDecimals:    DefaultRMDecimals,
	}
	ok := Input{X: 2, Y1Pct: 10, Y2Pct: 10, Y3: []Option{OptionB}}
	tests := []struct {
		name string
		mod  func(*Input)
		want error
	}{
		{"negative x", func(i *Input) { i.X = -1 }, ErrNegativeValue},
		{"negative y1", func(i *Input) { i.Y1Pct = -1 }, ErrImpactPercent},
		{"negative y2", func(i *Input) { i.Y2Pct = -1 }, ErrImpactPercent},
		{"no options", func(i *Input) { i.Y3 = nil }, ErrNoOptions},
		{"A with B", func(i *Input) { i.Y3 = []Option{OptionA, OptionB} }, ErrOptionAExclusive},
	}
	for _, tc := range tests {
		in := ok
		tc.mod(&in)
		if _, err := Score(in, snap); !errors.Is(err, tc.want) {
			t.Errorf("%s: error = %v, want %v", tc.name, err, tc.want)
		}
	}
	if _, err := Score(ok, snap); err != nil {
		t.Errorf("valid input: %v", err)
	}
}

// fuzzLevel classifies RM from the borders in the document, independently of
// the engine's own classifier.
func fuzzLevel(rm float64) RiskLevel {
	switch {
	case rm >= 4.5:
		return LevelVH
	case rm >= 3.5:
		return LevelH
	case rm >= 2.5:
		return LevelM
	case rm >= 1.5:
		return LevelL
	default:
		return LevelVL
	}
}

func FuzzScore(f *testing.F) {
	var tf thresholdFile
	readJSON(f, filepath.Join("testdata", "thresholds.json"), &tf)
	codes := make([]string, 0, len(tf.Indicators))
	for c := range tf.Indicators {
		codes = append(codes, c)
	}
	slices.Sort(codes)
	ic, it := table(tf.RIC), table(tf.RIT)

	// Seed corpus: indicator index, x, y1, y2 and a bitmask of options A..I.
	f.Add(uint8(0), 0.0, 0.0, 0.0, uint16(1))
	f.Add(uint8(1), 8.68, 24.44, 48.03, uint16(1<<2|1<<5|1<<7))
	f.Add(uint8(10), 1e9, 1e9, 1e9, uint16(1<<8))
	f.Add(uint8(54), 3.5, 47.5, 46.67, uint16(1<<4))
	f.Add(uint8(30), 0.0, 100.0, 100.0, uint16(1<<1|1<<3))
	f.Add(uint8(200), -1.0, 5.0, 5.0, uint16(0))
	f.Add(uint8(7), math.NaN(), math.Inf(1), 1.0, uint16(0x1ff))

	f.Fuzz(func(t *testing.T, idx uint8, x, y1, y2 float64, mask uint16) {
		code := codes[int(idx)%len(codes)]
		snap := Snapshot{
			Thresholds:    tf.Indicators[code].toThresholds(),
			ImpactC:       ic,
			ImpactT:       it,
			ScoreDecimals: DefaultScoreDecimals,
			RMDecimals:    DefaultRMDecimals,
		}
		var opts []Option
		for i, o := range []Option{OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG, OptionH, OptionI} {
			if mask&(1<<i) != 0 {
				opts = append(opts, o)
			}
		}
		res, err := Score(Input{X: x, Y1Pct: y1, Y2Pct: y2, Y3: opts}, snap)
		if err != nil {
			return
		}
		within := func(v float64) bool { return v >= 1 && v <= 5 }
		if !within(res.RL) || !within(res.RIC) || !within(res.RIT) || !within(res.RIE) || !within(res.RIMax) || !within(res.RM) {
			t.Fatalf("%s: score out of [1,5]: %+v", code, res)
		}
		if res.RIMax != math.Max(res.RIC, math.Max(res.RIT, res.RIE)) {
			t.Fatalf("%s: RI_max is not the largest impact: %+v", code, res)
		}
		if res.Level != fuzzLevel(res.RM) {
			t.Fatalf("%s: level %s inconsistent with RM %v", code, res.Level, res.RM)
		}
		if (res.Level == LevelH || res.Level == LevelVH) == (len(res.Advice) == 0) {
			t.Fatalf("%s: advice %v inconsistent with level %s", code, res.Advice, res.Level)
		}
	})
}
