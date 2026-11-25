package engine

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
)

// Default rounding precision (Architecture v2.3, engine settings; risk-engine
// v1.1, rounding of scores and of RM).
const (
	// DefaultScoreDecimals is p_s: decimals kept for RL, RI_C, RI_T and RI_E.
	DefaultScoreDecimals = 2
	// DefaultRMDecimals is p_m: decimals kept for RM before classification.
	DefaultRMDecimals = 3
)

// maxDecimals bounds the configurable precision to what float64 can carry.
const maxDecimals = 15

// RiskLevel is the risk level of an indicator. The values match the database
// risk_level enum and the OpenAPI RiskLevel schema.
type RiskLevel string

// Risk levels, from lowest to highest.
const (
	LevelVL RiskLevel = "VL"
	LevelL  RiskLevel = "L"
	LevelM  RiskLevel = "M"
	LevelH  RiskLevel = "H"
	LevelVH RiskLevel = "VH"
)

// Level borders on RM: halfway between the membership peaks 1..5. A value
// exactly on a border takes the higher level (risk-engine v1.1, Risk level),
// the same rule as the database check (VL if rm < 1.5, L < 2.5, M < 3.5,
// H < 4.5, else VH).
const (
	borderVLtoL = 1.5
	borderLtoM  = 2.5
	borderMtoH  = 3.5
	borderHtoVH = 4.5
)

// LevelCutoffs are the lower bounds of the levels L, M, H and VH on RM.
type LevelCutoffs struct{ L, M, H, VH float64 }

// Cutoffs returns the fixed level borders the classification uses, so a
// reader can draw them without recalculating anything.
func Cutoffs() LevelCutoffs {
	return LevelCutoffs{L: borderVLtoL, M: borderLtoM, H: borderMtoH, VH: borderHtoVH}
}

// RMResult holds the rounded scores, RI_max, the rounded RM and its level.
type RMResult struct {
	RL    float64
	RIC   float64
	RIT   float64
	RIE   float64
	RIMax float64
	RM    float64
	Level RiskLevel
}

// ComputeRM rounds the four scores to scoreDecimals, takes RI_max as the
// largest impact, computes RM = sqrt(RL x RI_max), rounds it to rmDecimals
// and classifies the rounded value.
//
// Rounding mode: half away from zero, applied to the shortest decimal form of
// the float (so 2.675 gives 2.68, not 2.67). Each input score must be finite
// and, after rounding, within [1, 5].
func ComputeRM(rl, ric, rit, rie float64, scoreDecimals, rmDecimals int) (RMResult, error) {
	if scoreDecimals < 0 || scoreDecimals > maxDecimals {
		return RMResult{}, fmt.Errorf("engine: score decimals %d out of range 0..%d", scoreDecimals, maxDecimals)
	}
	if rmDecimals < 0 || rmDecimals > maxDecimals {
		return RMResult{}, fmt.Errorf("engine: rm decimals %d out of range 0..%d", rmDecimals, maxDecimals)
	}

	scores := [4]struct {
		name string
		v    float64
	}{{"RL", rl}, {"RI_C", ric}, {"RI_T", rit}, {"RI_E", rie}}
	var r [4]float64
	for i, s := range scores {
		if math.IsNaN(s.v) || math.IsInf(s.v, 0) {
			return RMResult{}, fmt.Errorf("engine: %s is not a finite number", s.name)
		}
		r[i] = roundHalfAway(s.v, scoreDecimals)
		if r[i] < 1 || r[i] > 5 {
			return RMResult{}, fmt.Errorf("engine: %s must be within 1 to 5", s.name)
		}
	}

	riMax := math.Max(r[1], math.Max(r[2], r[3]))
	rm := roundHalfAway(math.Sqrt(r[0]*riMax), rmDecimals)

	return RMResult{
		RL:    r[0],
		RIC:   r[1],
		RIT:   r[2],
		RIE:   r[3],
		RIMax: riMax,
		RM:    rm,
		Level: classifyRM(rm),
	}, nil
}

// classifyRM maps an already rounded RM to its risk level.
func classifyRM(rm float64) RiskLevel {
	switch {
	case rm < borderVLtoL:
		return LevelVL
	case rm < borderLtoM:
		return LevelL
	case rm < borderMtoH:
		return LevelM
	case rm < borderHtoVH:
		return LevelH
	default:
		return LevelVH
	}
}

// roundHalfAway rounds v to dec decimals, ties away from zero. It works on
// the shortest decimal string of v and exact rational arithmetic, so binary
// artefacts such as 2.675 (stored as 2.67499999...) do not change the result.
func roundHalfAway(v float64, dec int) float64 {
	if v == 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	x, ok := new(big.Rat).SetString(strconv.FormatFloat(v, 'f', -1, 64))
	if !ok {
		return v
	}
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(dec)), nil)
	x.Mul(x, new(big.Rat).SetInt(scale))

	neg := x.Sign() < 0
	x.Abs(x)
	// floor(|x| + 1/2) is half away from zero.
	x.Add(x, big.NewRat(1, 2))
	q := new(big.Int).Quo(x.Num(), x.Denom())

	out := new(big.Rat).SetFrac(q, scale)
	if neg {
		out.Neg(out)
	}
	f, _ := out.Float64()
	return f
}
