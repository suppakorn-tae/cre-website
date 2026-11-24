package engine

// Input is the answer set of one indicator. Cost and time impacts are
// percentages (0 or more); unit conversion is done before the engine
// (risk-engine v1.1, Inputs).
type Input struct {
	// X is the likelihood value in the indicator's own unit.
	X float64
	// Y1Pct is the cost impact as a percentage of project value.
	Y1Pct float64
	// Y2Pct is the time impact as a percentage of project duration.
	Y2Pct float64
	// Y3 is the set of ticked environmental options.
	Y3 []Option
}

// Snapshot holds everything the engine reads for one version: the indicator's
// RL thresholds, the shared RI_C and RI_T tables and the rounding precision.
// The engine reads nothing else, so a result depends on the snapshot only.
type Snapshot struct {
	Thresholds    Thresholds
	ImpactC       ImpactTable
	ImpactT       ImpactTable
	ScoreDecimals int // p_s, see DefaultScoreDecimals
	RMDecimals    int // p_m, see DefaultRMDecimals
}

// Result is the full outcome for one indicator: the rounded scores, RI_max,
// RM, the level and the advice list keys to show (empty below H).
type Result struct {
	RMResult
	Advice []AdviceList
}

// Score computes RL, RI_C, RI_T, RI_E, RI_max, RM, the level and the advice
// list keys for one indicator. It is pure: no I/O, clock or shared state.
func Score(input Input, snap Snapshot) (Result, error) {
	rl, err := ScoreRL(input.X, snap.Thresholds)
	if err != nil {
		return Result{}, err
	}
	ric, err := ScoreRIC(input.Y1Pct, snap.ImpactC)
	if err != nil {
		return Result{}, err
	}
	rit, err := ScoreRIT(input.Y2Pct, snap.ImpactT)
	if err != nil {
		return Result{}, err
	}
	rie, err := ScoreRIE(input.Y3)
	if err != nil {
		return Result{}, err
	}
	rm, err := ComputeRM(rl, ric, rit, rie, snap.ScoreDecimals, snap.RMDecimals)
	if err != nil {
		return Result{}, err
	}
	return Result{
		RMResult: rm,
		Advice:   SelectAdvice(string(rm.Level), rm.RL, rm.RIC, rm.RIT, rm.RIE),
	}, nil
}
