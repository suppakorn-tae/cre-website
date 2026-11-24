package engine

import (
	"errors"
	"fmt"
	"math"
)

// Option is one environmental impact (y3) choice, A to I.
type Option string

// The y3 options. A means very little impact and is exclusive.
const (
	OptionA Option = "A"
	OptionB Option = "B"
	OptionC Option = "C"
	OptionD Option = "D"
	OptionE Option = "E"
	OptionF Option = "F"
	OptionG Option = "G"
	OptionH Option = "H"
	OptionI Option = "I"
)

// Errors returned by the impact scoring functions.
var (
	ErrImpactPercent    = errors.New("engine: impact percentage must be a finite number, 0 or more")
	ErrImpactTable      = errors.New("engine: impact table must be strictly increasing and not negative")
	ErrNoOptions        = errors.New("engine: at least one environmental option is required")
	ErrOptionAExclusive = errors.New("engine: option A cannot be combined with other options")
	ErrUnknownOption    = errors.New("engine: unknown environmental option")
)

// ImpactTable holds the shared thresholds a–e of RI_C or RI_T. Values are
// percentages, not negative and strictly increasing.
type ImpactTable struct {
	A, B, C, D, E float64
}

// impactOptionScores are the fixed RI_E scores per option.
var impactOptionScores = map[Option]float64{
	OptionA: 1, OptionB: 1, OptionC: 1,
	OptionD: 2, OptionE: 2,
	OptionF: 3, OptionG: 4,
	OptionH: 5, OptionI: 5,
}

// ScoreRIC scores the cost impact y1Pct (% of project value) on the shared
// table. The result is not rounded.
func ScoreRIC(y1Pct float64, table ImpactTable) (float64, error) {
	return scoreImpactPct(y1Pct, table)
}

// ScoreRIT scores the time impact y2Pct (% of project duration) on the shared
// table. The result is not rounded.
func ScoreRIT(y2Pct float64, table ImpactTable) (float64, error) {
	return scoreImpactPct(y2Pct, table)
}

// ScoreRIE returns the highest score among the ticked options. Option A is
// exclusive and an empty set is an error.
func ScoreRIE(options []Option) (float64, error) {
	if len(options) == 0 {
		return 0, ErrNoOptions
	}
	best := 0.0
	hasA, hasOther := false, false
	for _, o := range options {
		s, ok := impactOptionScores[o]
		if !ok {
			return 0, fmt.Errorf("%w: %q", ErrUnknownOption, string(o))
		}
		if o == OptionA {
			hasA = true
		} else {
			hasOther = true
		}
		best = math.Max(best, s)
	}
	if hasA && hasOther {
		return 0, ErrOptionAExclusive
	}
	return best, nil
}

func scoreImpactPct(pct float64, t ImpactTable) (float64, error) {
	if err := t.validate(); err != nil {
		return 0, err
	}
	// An amount converted to a percentage may exceed 100; above e it scores 5.
	if math.IsNaN(pct) || math.IsInf(pct, 0) || pct < 0 {
		return 0, fmt.Errorf("%w: %v", ErrImpactPercent, pct)
	}
	pts := [5]float64{t.A, t.B, t.C, t.D, t.E}
	if pct <= pts[0] {
		return 1, nil
	}
	for i := 1; i < len(pts); i++ {
		if pct <= pts[i] {
			return float64(i) + (pct-pts[i-1])/(pts[i]-pts[i-1]), nil
		}
	}
	return 5, nil
}

func (t ImpactTable) validate() error {
	pts := [5]float64{t.A, t.B, t.C, t.D, t.E}
	for i, p := range pts {
		if math.IsNaN(p) || math.IsInf(p, 0) || p < 0 {
			return ErrImpactTable
		}
		if i > 0 && p <= pts[i-1] {
			return ErrImpactTable
		}
	}
	return nil
}
