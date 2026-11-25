package assessments

import (
	"errors"
	"fmt"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
)

// Units of the impact answers, as stored in the cost_unit and time_unit enums.
const (
	UnitBaht    = "baht"
	UnitDay     = "day"
	UnitPercent = "percent"
)

// ErrUnit means an impact answer carries a unit this impact does not allow.
var ErrUnit = errors.New("assessments: unknown unit")

// CostToPct turns a cost impact (y1) into a percentage of the project value
// frozen in the version snapshot. The engine takes percentages only (FR-23).
// Multiplying before dividing keeps whole-number results exact.
func CostToPct(value float64, unit string, valueBaht float64) (float64, error) {
	switch unit {
	case UnitPercent:
		return value, nil
	case UnitBaht:
		if valueBaht <= 0 {
			return 0, fmt.Errorf("%w: project value %v", ErrUnit, valueBaht)
		}
		return value * 100 / valueBaht, nil
	}
	return 0, fmt.Errorf("%w: y1 %q", ErrUnit, unit)
}

// TimeToPct turns a time impact (y2) into a percentage of the project
// duration, end minus start in days, from the version snapshot.
func TimeToPct(value float64, unit string, start, end time.Time) (float64, error) {
	switch unit {
	case UnitPercent:
		return value, nil
	case UnitDay:
		days := end.Sub(start).Hours() / 24
		if days <= 0 {
			return 0, fmt.Errorf("%w: project duration %v days", ErrUnit, days)
		}
		return value * 100 / days, nil
	}
	return 0, fmt.Errorf("%w: y2 %q", ErrUnit, unit)
}

// thresholdsFrom builds engine thresholds from a snapshot row. The snapshot
// does not store the direction; it follows from the order of the first and
// last threshold present, as the catalogue checks guarantee.
func thresholdsFrom(a, b, c, d, e *float64) engine.Thresholds {
	t := engine.Thresholds{A: a, B: b, C: c, D: d, E: e, Direction: engine.DirectionNormal}
	first, last := a, e
	if first == nil {
		first = c
	}
	if last == nil {
		last = c
	}
	if first != nil && last != nil && *first > *last {
		t.Direction = engine.DirectionInverse
	}
	return t
}
