package engine

import (
	"errors"
	"math"
	"testing"
)

func five(d Direction, a, b, c, dd, e float64) Thresholds {
	return Thresholds{F(a), F(b), F(c), F(dd), F(e), d}
}

func TestScoreRL(t *testing.T) {
	normal := five(DirectionNormal, 1, 2, 4, 8, 16)
	inverse := five(DirectionInverse, 16, 8, 4, 2, 1)
	abc := Thresholds{A: F(1), B: F(3), C: F(7), Direction: DirectionNormal}
	cde := Thresholds{C: F(2), D: F(6), E: F(8), Direction: DirectionNormal}

	tests := []struct {
		name string
		x    float64
		th   Thresholds
		want float64
	}{
		{"normal zero", 0, normal, 1},
		{"normal below a", 0.5, normal, 1},
		{"normal at a", 1, normal, 1},
		{"normal a-b", 1.5, normal, 1.5},
		{"normal at b", 2, normal, 2},
		{"normal b-c", 3, normal, 2.5},
		{"normal at c", 4, normal, 3},
		{"normal c-d", 6, normal, 3.5},
		{"normal at d", 8, normal, 4},
		{"normal d-e", 12, normal, 4.5},
		{"normal at e", 16, normal, 5},
		{"normal above e", 100, normal, 5},

		{"inverse above a", 20, inverse, 1},
		{"inverse at a", 16, inverse, 1},
		{"inverse a-b", 12, inverse, 1.5},
		{"inverse at b", 8, inverse, 2},
		{"inverse b-c", 6, inverse, 2.5},
		{"inverse at c", 4, inverse, 3},
		{"inverse c-d", 3, inverse, 3.5},
		{"inverse at d", 2, inverse, 4},
		{"inverse d-e", 1.5, inverse, 4.5},
		{"inverse at e", 1, inverse, 5},
		{"inverse below e", 0, inverse, 5},

		{"abc zero", 0, abc, 1},
		{"abc at a", 1, abc, 1},
		{"abc a-b", 2, abc, 1.5},
		{"abc at b", 3, abc, 2},
		{"abc b-c", 5, abc, 2.5},
		{"abc at c", 7, abc, 3},
		{"abc above c", 7.01, abc, 5},

		{"cde zero", 0, cde, 1},
		{"cde below c", 1.99, cde, 1},
		{"cde at c", 2, cde, 3},
		{"cde c-d", 4, cde, 3.5},
		{"cde at d", 6, cde, 4},
		{"cde d-e", 7, cde, 4.5},
		{"cde at e", 8, cde, 5},
		{"cde above e", 9, cde, 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ScoreRL(tc.x, tc.th)
			if err != nil {
				t.Fatal(err)
			}
			if math.Abs(got-tc.want) > 1e-9 {
				t.Fatalf("ScoreRL(%v) = %v, want %v", tc.x, got, tc.want)
			}
		})
	}
}

func TestScoreRLSpecExample(t *testing.T) {
	th := five(DirectionNormal, 2.96, 6.71, 11.04, 16, 20)
	got, err := ScoreRL(8.68, th)
	if err != nil {
		t.Fatal(err)
	}
	if r := math.Round(got*100) / 100; r != 2.45 {
		t.Fatalf("got %v, want 2.45", got)
	}
}

func TestScoreRLErrors(t *testing.T) {
	ok := five(DirectionNormal, 1, 2, 3, 4, 5)
	tests := []struct {
		name string
		x    float64
		th   Thresholds
		want error
	}{
		{"negative", -1, ok, ErrNegativeValue},
		{"nan", math.NaN(), ok, ErrNegativeValue},
		{"bad direction", 1, five("sideways", 1, 2, 3, 4, 5), ErrInvalidDirection},
		{"empty direction", 1, Thresholds{A: F(1), B: F(2), C: F(3), D: F(4), E: F(5)}, ErrInvalidDirection},
		{"all nil", 1, Thresholds{Direction: DirectionNormal}, ErrInvalidPattern},
		{"only c", 1, Thresholds{C: F(1), Direction: DirectionNormal}, ErrInvalidPattern},
		{"a b d e", 1, Thresholds{A: F(1), B: F(2), D: F(4), E: F(5), Direction: DirectionNormal}, ErrInvalidPattern},
		{"a-d", 1, Thresholds{A: F(1), B: F(2), C: F(3), D: F(4), Direction: DirectionNormal}, ErrInvalidPattern},
		{"inverse abc", 1, Thresholds{A: F(7), B: F(3), C: F(1), Direction: DirectionInverse}, ErrInvalidPattern},
		{"inverse cde", 1, Thresholds{C: F(7), D: F(3), E: F(1), Direction: DirectionInverse}, ErrInvalidPattern},
		{"normal decreasing", 1, five(DirectionNormal, 5, 4, 3, 2, 1), ErrInvalidOrder},
		{"inverse increasing", 1, five(DirectionInverse, 1, 2, 3, 4, 5), ErrInvalidOrder},
		{"equal thresholds", 1, five(DirectionNormal, 1, 1, 3, 4, 5), ErrInvalidOrder},
		{"abc unordered", 1, Thresholds{A: F(3), B: F(2), C: F(5), Direction: DirectionNormal}, ErrInvalidOrder},
		{"cde unordered", 1, Thresholds{C: F(3), D: F(2), E: F(5), Direction: DirectionNormal}, ErrInvalidOrder},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ScoreRL(tc.x, tc.th); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}
