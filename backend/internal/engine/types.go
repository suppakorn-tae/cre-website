// Package engine holds the pure risk scoring functions. It must not import
// dal, http or service.
package engine

// Direction tells which way risk grows along an indicator's scale.
type Direction string

const (
	// DirectionNormal means a higher value is a higher risk (a < b < c < d < e).
	DirectionNormal Direction = "normal"
	// DirectionInverse means a lower value is a higher risk (a > b > c > d > e).
	DirectionInverse Direction = "inverse"
)

// Thresholds are the five scale points a–e of one indicator. A nil pointer
// is a missing (NULL) threshold.
type Thresholds struct {
	A, B, C, D, E *float64
	Direction     Direction
}

// F returns a pointer to v, a small helper to build Thresholds.
func F(v float64) *float64 { return &v }
