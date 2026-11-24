// Package catalogue serves the indicator catalogue from memory.
//
// Each api replica keeps one immutable Snapshot, loaded lazily from Postgres.
// An admin edit calls Service.Invalidate, which drops the local snapshot and
// publishes on Valkey; every replica that hears the message drops its own
// snapshot and loads the new one (Architecture v2.3, indicator constants).
package catalogue

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
)

// DefaultLocale is the locale every text must exist in; other locales fall
// back to it per text (FR-56).
const DefaultLocale = "th"

// Impact table codes.
const (
	ImpactCost = "RI_C"
	ImpactTime = "RI_T"
)

// Text is one string per locale. A missing locale falls back to DefaultLocale.
type Text map[string]string

// In returns the text in locale, or in DefaultLocale when that is missing.
func (t Text) In(locale string) string {
	if v, ok := t[locale]; ok {
		return v
	}
	return t[DefaultLocale]
}

// Ptr is like In but returns nil when the text is absent in both locales.
func (t Text) Ptr(locale string) *string {
	if v, ok := t[locale]; ok {
		return &v
	}
	if v, ok := t[DefaultLocale]; ok {
		return &v
	}
	return nil
}

// Dimension is EC, SO or EV with its factors.
type Dimension struct {
	Code    string
	Name    Text
	Factors []Factor
}

// Factor groups indicators.
type Factor struct {
	Code       string
	Name       Text
	Indicators []Indicator
}

// Indicator is one catalogue indicator with its thresholds.
type Indicator struct {
	Code       string
	Thresholds engine.Thresholds
	Name       Text
	Unit       Text
	QuestionX  Text
	QuestionY1 Text
	QuestionY2 Text
	QuestionY3 Text
}

// RiEOption is one option A to I of the environmental impact question.
type RiEOption struct {
	Code        string
	Score       int
	IsExclusive bool
	Label       Text
}

// ImpactTable holds the RI_C or RI_T scale points a to e.
type ImpactTable struct {
	A, B, C, D, E float64
}

// AdviceItem is one advice text at a position of a list.
type AdviceItem struct {
	ID       string
	Position int
	Text     Text
}

// AdviceKey identifies one advice list of an indicator.
type AdviceKey struct{ Indicator, List string }

// Snapshot is the whole catalogue at one moment. It is immutable once built:
// readers share it without locking.
type Snapshot struct {
	Dimensions []Dimension
	RiEOptions []RiEOption
	Impact     map[string]ImpactTable
	// Islands and ProjectTypes are codes in display order, `other` last.
	Islands      []string
	ProjectTypes []string

	advice     map[AdviceKey][]AdviceItem
	indicators map[string]*Indicator
	version    string
}

// Version is a content hash: equal on every replica holding the same data,
// different after an edit. It is the basis of the HTTP ETag.
func (s *Snapshot) Version() string { return s.version }

// Thresholds returns the current thresholds of an indicator, for the scoring
// engine and for version snapshots.
func (s *Snapshot) Thresholds(indicatorCode string) (engine.Thresholds, bool) {
	ind, ok := s.indicators[indicatorCode]
	if !ok {
		return engine.Thresholds{}, false
	}
	return ind.Thresholds, true
}

// AllThresholds returns the thresholds of every indicator, keyed by code.
func (s *Snapshot) AllThresholds() map[string]engine.Thresholds {
	out := make(map[string]engine.Thresholds, len(s.indicators))
	for code, ind := range s.indicators {
		out[code] = ind.Thresholds
	}
	return out
}

// ImpactTable returns the RI_C or RI_T table.
func (s *Snapshot) ImpactTable(code string) (ImpactTable, bool) {
	t, ok := s.Impact[code]
	return t, ok
}

// Advice returns the advice items of an indicator and list (RL, RI_C, RI_T,
// RI_E) in position order, with text resolved to locale.
func (s *Snapshot) Advice(indicatorCode, list, locale string) []string {
	items := s.advice[AdviceKey{indicatorCode, list}]
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.Text.In(locale))
	}
	return out
}

// NewSnapshot indexes the data and computes its version.
func NewSnapshot(dims []Dimension, opts []RiEOption, impact map[string]ImpactTable,
	advice map[AdviceKey][]AdviceItem, islands, projectTypes []string,
) (*Snapshot, error) {
	s := &Snapshot{
		Dimensions: dims, RiEOptions: opts, Impact: impact, advice: advice,
		Islands: islands, ProjectTypes: projectTypes,
		indicators: map[string]*Indicator{},
	}
	for di := range dims {
		for fi := range dims[di].Factors {
			inds := dims[di].Factors[fi].Indicators
			for ii := range inds {
				s.indicators[inds[ii].Code] = &inds[ii]
			}
		}
	}
	// Maps marshal with sorted keys, so the hash is stable. Advice keys are
	// flattened because JSON object keys must be strings.
	flat := map[string][]AdviceItem{}
	for k, v := range advice {
		flat[k.Indicator+"|"+k.List] = v
	}
	b, err := json.Marshal(struct {
		D    []Dimension
		O    []RiEOption
		I    map[string]ImpactTable
		A    map[string][]AdviceItem
		L, T []string
	}{dims, opts, impact, flat, islands, projectTypes})
	if err != nil {
		return nil, fmt.Errorf("catalogue: hash snapshot: %w", err)
	}
	sum := sha256.Sum256(b)
	s.version = hex.EncodeToString(sum[:])
	return s, nil
}
