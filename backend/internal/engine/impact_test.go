package engine

import (
	"errors"
	"math"
	"testing"
)

var (
	testImpactCost = ImpactTable{A: 9.58, B: 23.92, C: 47.5, D: 61.42, E: 80}
	testImpactTime = ImpactTable{A: 13.79, B: 23.33, C: 46.67, D: 60.83, E: 79.33}
)

func impactClose(got, want float64) bool { return math.Abs(got-want) < 1e-9 }

func TestScoreRICAndRIT(t *testing.T) {
	tests := []struct {
		name  string
		table ImpactTable
		pct   float64
		want  float64
	}{
		{"zero", testImpactCost, 0, 1},
		{"below a", testImpactCost, 5, 1},
		{"at a", testImpactCost, 9.58, 1},
		{"mid a-b", testImpactCost, (9.58 + 23.92) / 2, 1.5},
		{"at b", testImpactCost, 23.92, 2},
		{"mid b-c", testImpactCost, (23.92 + 47.5) / 2, 2.5},
		{"at c", testImpactCost, 47.5, 3},
		{"mid c-d", testImpactCost, (47.5 + 61.42) / 2, 3.5},
		{"at d", testImpactCost, 61.42, 4},
		{"mid d-e", testImpactCost, (61.42 + 80) / 2, 4.5},
		{"at e", testImpactCost, 80, 5},
		{"above e", testImpactCost, 80.01, 5},
		{"hundred", testImpactCost, 100, 5},
		{"time zero", testImpactTime, 0, 1},
		{"time at a", testImpactTime, 13.79, 1},
		{"time at b", testImpactTime, 23.33, 2},
		{"time at c", testImpactTime, 46.67, 3},
		{"time at d", testImpactTime, 60.83, 4},
		{"time at e", testImpactTime, 79.33, 5},
		{"time hundred", testImpactTime, 100, 5},
		{"above 100", testImpactCost, 150, 5},
		{"far above 100", testImpactTime, 1000, 5},
		{"spec example y1", testImpactCost, 24.44, 2 + (24.44-23.92)/(47.5-23.92)},
		{"spec example y2", testImpactTime, 16.44, 1 + (16.44-13.79)/(23.33-13.79)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ric, err := ScoreRIC(tt.pct, tt.table)
			if err != nil || !impactClose(ric, tt.want) {
				t.Fatalf("ScoreRIC(%v) = %v, %v; want %v", tt.pct, ric, err, tt.want)
			}
			rit, err := ScoreRIT(tt.pct, tt.table)
			if err != nil || !impactClose(rit, tt.want) {
				t.Fatalf("ScoreRIT(%v) = %v, %v; want %v", tt.pct, rit, err, tt.want)
			}
		})
	}
}

func TestScoreImpactRejectsBadInput(t *testing.T) {
	tests := []struct {
		name  string
		table ImpactTable
		pct   float64
		want  error
	}{
		{"negative pct", testImpactCost, -0.01, ErrImpactPercent},
		{"-Inf", testImpactCost, math.Inf(-1), ErrImpactPercent},
		{"NaN", testImpactCost, math.NaN(), ErrImpactPercent},
		{"Inf", testImpactCost, math.Inf(1), ErrImpactPercent},
		{"negative a", ImpactTable{A: -1, B: 2, C: 3, D: 4, E: 5}, 1, ErrImpactTable},
		{"equal a b", ImpactTable{A: 1, B: 1, C: 3, D: 4, E: 5}, 1, ErrImpactTable},
		{"decreasing", ImpactTable{A: 5, B: 4, C: 3, D: 2, E: 1}, 1, ErrImpactTable},
		{"NaN threshold", ImpactTable{A: 1, B: 2, C: math.NaN(), D: 4, E: 5}, 1, ErrImpactTable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ScoreRIC(tt.pct, tt.table); !errors.Is(err, tt.want) {
				t.Errorf("ScoreRIC err = %v; want %v", err, tt.want)
			}
			if _, err := ScoreRIT(tt.pct, tt.table); !errors.Is(err, tt.want) {
				t.Errorf("ScoreRIT err = %v; want %v", err, tt.want)
			}
		})
	}
}

func TestScoreRIEEachOption(t *testing.T) {
	want := map[Option]float64{
		OptionA: 1, OptionB: 1, OptionC: 1,
		OptionD: 2, OptionE: 2,
		OptionF: 3, OptionG: 4,
		OptionH: 5, OptionI: 5,
	}
	for o, w := range want {
		got, err := ScoreRIE([]Option{o})
		if err != nil || got != w {
			t.Errorf("ScoreRIE(%s) = %v, %v; want %v", o, got, err, w)
		}
	}
}

func TestScoreRIECombinations(t *testing.T) {
	tests := []struct {
		name string
		in   []Option
		want float64
	}{
		{"C F H", []Option{OptionC, OptionF, OptionH}, 5},
		{"B C", []Option{OptionB, OptionC}, 1},
		{"B E returns higher", []Option{OptionB, OptionE}, 2},
		{"E B order independent", []Option{OptionE, OptionB}, 2},
		{"D G", []Option{OptionD, OptionG}, 4},
		{"duplicates", []Option{OptionF, OptionF}, 3},
		{"duplicate A", []Option{OptionA, OptionA}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ScoreRIE(tt.in)
			if err != nil || got != tt.want {
				t.Fatalf("ScoreRIE(%v) = %v, %v; want %v", tt.in, got, err, tt.want)
			}
		})
	}
}

func TestScoreRIEErrors(t *testing.T) {
	tests := []struct {
		name string
		in   []Option
		want error
	}{
		{"nil", nil, ErrNoOptions},
		{"empty", []Option{}, ErrNoOptions},
		{"A with B", []Option{OptionA, OptionB}, ErrOptionAExclusive},
		{"B with A", []Option{OptionB, OptionA}, ErrOptionAExclusive},
		{"A with I", []Option{OptionA, OptionI}, ErrOptionAExclusive},
		{"unknown", []Option{"Z"}, ErrUnknownOption},
		{"lowercase", []Option{"b"}, ErrUnknownOption},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ScoreRIE(tt.in); !errors.Is(err, tt.want) {
				t.Fatalf("err = %v; want %v", err, tt.want)
			}
		})
	}
}
