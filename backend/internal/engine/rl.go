package engine

import (
	"errors"
	"fmt"
	"math"
)

var (
	// ErrNegativeValue is returned when the indicator value is below zero or NaN.
	ErrNegativeValue = errors.New("engine: indicator value must be 0 or more")
	// ErrInvalidPattern is returned for a NULL pattern other than all five,
	// a–c only, or c–e only.
	ErrInvalidPattern = errors.New("engine: invalid threshold pattern")
	// ErrInvalidOrder is returned when thresholds are not strictly ordered
	// for their direction.
	ErrInvalidOrder = errors.New("engine: thresholds out of order")
	// ErrInvalidDirection is returned for an unknown direction.
	ErrInvalidDirection = errors.New("engine: invalid direction")
)

type point struct{ x, score float64 }

// ScoreRL returns the risk likelihood (1–5) of indicator value x. The branch
// follows the NULL pattern of t: all five thresholds, a–c only, or c–e only.
// Inverse indicators (five thresholds only) are mirrored by negating x and
// the thresholds.
func ScoreRL(x float64, t Thresholds) (float64, error) {
	if math.IsNaN(x) || x < 0 {
		return 0, ErrNegativeValue
	}
	sign := 1.0
	switch t.Direction {
	case DirectionNormal:
	case DirectionInverse:
		sign = -1
	default:
		return 0, fmt.Errorf("%w: %q", ErrInvalidDirection, t.Direction)
	}

	pts, err := points(t, sign)
	if err != nil {
		return 0, err
	}
	for i := 1; i < len(pts); i++ {
		if pts[i].x <= pts[i-1].x {
			return 0, ErrInvalidOrder
		}
	}

	v := sign * x
	if v < pts[0].x {
		return 1, nil
	}
	for i := 1; i < len(pts); i++ {
		if v <= pts[i].x {
			p, q := pts[i-1], pts[i]
			return p.score + (v-p.x)/(q.x-p.x), nil
		}
	}
	return 5, nil
}

// points maps the thresholds present in t to scale points, in the order a–e,
// with values multiplied by sign.
func points(t Thresholds, sign float64) ([]point, error) {
	has := [5]bool{t.A != nil, t.B != nil, t.C != nil, t.D != nil, t.E != nil}
	vals := [5]*float64{t.A, t.B, t.C, t.D, t.E}
	scores := [5]float64{1, 2, 3, 4, 5}
	var idx []int
	switch has {
	case [5]bool{true, true, true, true, true}:
		idx = []int{0, 1, 2, 3, 4}
	case [5]bool{true, true, true, false, false}:
		idx = []int{0, 1, 2}
	case [5]bool{false, false, true, true, true}:
		idx = []int{2, 3, 4}
	default:
		return nil, ErrInvalidPattern
	}
	if sign < 0 && len(idx) != 5 {
		return nil, fmt.Errorf("%w: inverse needs all five thresholds", ErrInvalidPattern)
	}
	pts := make([]point, len(idx))
	for i, k := range idx {
		pts[i] = point{sign * *vals[k], scores[k]}
	}
	return pts, nil
}
