// Package seed embeds the catalogue seed files for internal/seed.
package seed

import _ "embed"

// IndicatorsJSON is cre-indicators.json: dimensions, factors, indicators with
// thresholds, questions and advice, the RI_C / RI_T tables and the RI_E options.
//
//go:embed cre-indicators.json
var IndicatorsJSON []byte
