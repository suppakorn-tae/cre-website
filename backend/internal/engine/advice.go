package engine

// AdviceList identifies one advice list. Values match the advice_list enum
// in the database and the AdviceList schema in the OpenAPI contract.
type AdviceList string

// Advice list keys, one per score that can drive advice.
const (
	AdviceListRL  AdviceList = "RL"
	AdviceListRIC AdviceList = "RI_C"
	AdviceListRIT AdviceList = "RI_T"
	AdviceListRIE AdviceList = "RI_E"
)

// Risk level values (risk_level enum) that trigger advice.
const (
	adviceLevelH  = "H"
	adviceLevelVH = "VH"
)

// SelectAdvice returns the advice list keys for an indicator (BR-05 to BR-07).
//
// level is the risk_level enum value. Advice exists only for "H" and "VH";
// any other level returns nil. rl, ric, rit and rie must already be rounded
// to the score precision, the same values used to compute RM, because the
// comparisons use rounded scores (BR-06).
//
// If rl >= RI_max the result is [RL]. Otherwise every impact equal to RI_max
// is returned, ordered RI_C, RI_T, RI_E (BR-07).
func SelectAdvice(level string, rl, ric, rit, rie float64) []AdviceList {
	if level != adviceLevelH && level != adviceLevelVH {
		return nil
	}
	impactMax := ric
	if rit > impactMax {
		impactMax = rit
	}
	if rie > impactMax {
		impactMax = rie
	}
	if rl >= impactMax {
		return []AdviceList{AdviceListRL}
	}
	var out []AdviceList
	if ric == impactMax {
		out = append(out, AdviceListRIC)
	}
	if rit == impactMax {
		out = append(out, AdviceListRIT)
	}
	if rie == impactMax {
		out = append(out, AdviceListRIE)
	}
	return out
}
