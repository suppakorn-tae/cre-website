// Package seed loads the indicator catalogue (dimensions, factors,
// indicators, thresholds, impact tables, RI_E options and advice) from
// cre-indicators.json into an empty or partly filled database.
package seed

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	embedded "github.com/suppakorn-tae/cre-website/backend/seed"
)

// Locale is the only locale the seed provides. It is the default locale.
const Locale = "th"

// AdviceLists are the four advice lists per indicator, in storage order.
var AdviceLists = []string{"RL", "RI_C", "RI_T", "RI_E"}

// Catalogue is the content of cre-indicators.json.
type Catalogue struct {
	Dimensions []Dimension `json:"dimensions"`
	Factors    []Factor    `json:"factors"`
	RIC        Table       `json:"ri_c_thresholds"`
	RIT        Table       `json:"ri_t_thresholds"`
	RIEOptions []RIEOption `json:"ri_e_options"`
	Indicators []Indicator `json:"indicators"`
}

// Dimension is one of EC, SO, EV.
type Dimension struct {
	Code   string `json:"code"`
	NameTH string `json:"name_th"`
	NameEN string `json:"name_en"`
}

// Factor groups five indicators.
type Factor struct {
	Code          string `json:"code"`
	DimensionCode string `json:"dimension_code"`
	No            int    `json:"no"`
	NameTH        string `json:"name_th"`
	NameEN        string `json:"name_en"`
}

// Table is an RI_C or RI_T impact table. Numbers stay as text so they reach
// numeric columns without float rounding.
type Table struct {
	A json.Number `json:"a"`
	B json.Number `json:"b"`
	C json.Number `json:"c"`
	D json.Number `json:"d"`
	E json.Number `json:"e"`
}

// RIEOption is one y3 option. Option A is exclusive.
type RIEOption struct {
	Code    string `json:"code"`
	LabelTH string `json:"label_th"`
	Score   int    `json:"score"`
}

// Indicator is one of the 55 indicators. A null threshold stays nil.
type Indicator struct {
	Code       string              `json:"group_id"`
	FCode      string              `json:"f_code"`
	FactorCode string              `json:"factor_code"`
	NameTH     string              `json:"name_th"`
	NameEN     string              `json:"name_en"`
	UnitTH     string              `json:"unit_th"`
	UnitEN     string              `json:"unit_en"`
	A          *json.Number        `json:"a"`
	B          *json.Number        `json:"b"`
	C          *json.Number        `json:"c"`
	D          *json.Number        `json:"d"`
	E          *json.Number        `json:"e"`
	QuestionX  string              `json:"question_x"`
	QuestionY1 string              `json:"question_y1"`
	QuestionY2 string              `json:"question_y2"`
	QuestionY3 string              `json:"question_y3"`
	Advice     map[string][]string `json:"advice"`
}

// Direction returns "normal" when the set thresholds ascend and "inverse"
// when they descend. The seed file does not carry the direction.
func (i Indicator) Direction() (string, error) {
	var vals []float64
	for _, p := range []*json.Number{i.A, i.B, i.C, i.D, i.E} {
		if p == nil {
			continue
		}
		f, err := p.Float64()
		if err != nil {
			return "", fmt.Errorf("indicator %s: %w", i.Code, err)
		}
		vals = append(vals, f)
	}
	if len(vals) < 3 {
		return "", fmt.Errorf("indicator %s: fewer than three thresholds", i.Code)
	}
	asc, desc := true, true
	for k := 1; k < len(vals); k++ {
		asc = asc && vals[k-1] < vals[k]
		desc = desc && vals[k-1] > vals[k]
	}
	switch {
	case asc:
		return "normal", nil
	case desc:
		return "inverse", nil
	}
	return "", fmt.Errorf("indicator %s: thresholds are not strictly monotonic", i.Code)
}

// Parse decodes and validates a seed file.
func Parse(data []byte) (*Catalogue, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	dec.DisallowUnknownFields()
	var c Catalogue
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("decode seed: %w", err)
	}
	if err := c.validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

// Load parses the embedded cre-indicators.json.
func Load() (*Catalogue, error) { return Parse(embedded.IndicatorsJSON) }

func (c *Catalogue) validate() error {
	var errs []error
	dims := map[string]bool{}
	for _, d := range c.Dimensions {
		dims[d.Code] = true
	}
	facs := map[string]bool{}
	for _, f := range c.Factors {
		if !dims[f.DimensionCode] {
			errs = append(errs, fmt.Errorf("factor %s: unknown dimension %q", f.Code, f.DimensionCode))
		}
		facs[f.Code] = true
	}
	seen := map[string]bool{}
	for _, i := range c.Indicators {
		if seen[i.Code] {
			errs = append(errs, fmt.Errorf("indicator %s: duplicate", i.Code))
		}
		seen[i.Code] = true
		if !facs[i.FactorCode] {
			errs = append(errs, fmt.Errorf("indicator %s: unknown factor %q", i.Code, i.FactorCode))
		}
		if _, err := i.Direction(); err != nil {
			errs = append(errs, err)
		}
		if len(i.Advice) != len(AdviceLists) {
			errs = append(errs, fmt.Errorf("indicator %s: want advice lists %v", i.Code, AdviceLists))
		}
		for _, l := range AdviceLists {
			if n := len(i.Advice[l]); n < 1 || n > 5 {
				errs = append(errs, fmt.Errorf("indicator %s: advice list %s has %d items, want 1-5", i.Code, l, n))
			}
			for _, t := range i.Advice[l] {
				if strings.TrimSpace(t) == "" {
					errs = append(errs, fmt.Errorf("indicator %s: blank advice text in %s", i.Code, l))
				}
			}
		}
	}
	return errors.Join(errs...)
}
