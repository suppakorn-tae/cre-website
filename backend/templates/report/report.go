// Package report holds the PDF report template. All user-facing text comes
// from the Thai message catalogue (messages.th.json), never from Go code;
// dates are Buddhist era and risk levels are shown by code only.
package report

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"strconv"
	"strings"
	"time"
)

//go:embed messages.th.json
var messagesJSON []byte

//go:embed report.html.tmpl
var pageTmpl string

//go:embed style.css
var styleCSS []byte

//go:embed cre-logo-full.png
var logoPNG []byte

// Levels in display order.
var Levels = []string{"VL", "L", "M", "H", "VH"}

// adviceOrder is the order of the advice lists inside one indicator.
var adviceOrder = []string{"RL", "RI_C", "RI_T", "RI_E"}

// AdviceList is the items of one advice list ("RL", "RI_C", "RI_T", "RI_E").
type AdviceList struct {
	List  string
	Items []string
}

// Indicator is one stored result with its advice and chosen strategy.
type Indicator struct {
	Code, Name               string
	RL, RIC, RIT, RIE, RIMax float64
	RM                       float64
	Level                    string
	Advice                   []AdviceList // only filled for H and VH
	Strategy                 string       // "" when none chosen
}

// Data is everything the report shows. It is built from stored results only.
type Data struct {
	ProjectName, Nickname string
	Island, IslandOther   string // catalogue codes; IslandOther when Island is "other"
	Type, TypeOther       string
	ValueBaht             float64
	StartDate, EndDate    time.Time
	ProgressPct           int
	VersionNo             int
	SubmittedAt           time.Time
	GeneratedAt           time.Time
	ScoreDecimals         int
	RMDecimals            int
	Indicators            []Indicator
}

// thai is the Thai civil offset; the report prints dates in Thailand time.
var thai = time.FixedZone("ICT", 7*3600)

var msgs = func() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(messagesJSON, &m); err != nil {
		panic(err) // embedded file, covered by tests
	}
	return m
}()

// Messages returns a copy of the Thai catalogue.
func Messages() map[string]string {
	out := make(map[string]string, len(msgs))
	for k, v := range msgs {
		out[k] = v
	}
	return out
}

func msg(key string) (string, error) {
	v, ok := msgs[key]
	if !ok {
		return "", fmt.Errorf("report: missing message %q", key)
	}
	return v, nil
}

type levelCount struct {
	Level string
	Count int
}

type adviceView struct {
	Label template.HTML
	Items []string
}

type indicatorView struct {
	Code, Name                          string
	RL, RIC, RIT, RIE, RIMax, RM, Level string
	Advice                              []adviceView
	Strategy                            string
}

type view struct {
	ProjectName, Nickname, Island, Type, Value, Start, End string
	Progress                                               int
	VersionNo                                              int
	Submitted, Generated                                   string
	Counts                                                 []levelCount
	Total                                                  int
	AverageRM                                              string
	Indicators, HighRisk                                   []indicatorView
	Slots                                                  []string
	ResultsTitle, AdviceTitle                              string
}

// Render returns the HTML page and the assets (style sheet, logo) it links to. The
// caller adds the fonts and sends everything to the PDF adapter.
func Render(d Data) (html []byte, assets map[string][]byte, err error) {
	v, err := buildView(d)
	if err != nil {
		return nil, nil, err
	}
	var terr error
	t, err := template.New("report").Funcs(template.FuncMap{
		"t": func(k string) string {
			s, e := msg(k)
			terr = errors.Join(terr, e)
			return s
		},
		// tr is for catalogue entries that carry markup (subscripts). The
		// catalogue is embedded and trusted, never user input.
		"tr": func(k string) template.HTML {
			s, e := msg(k)
			terr = errors.Join(terr, e)
			return template.HTML(s) //nolint:gosec // embedded catalogue
		},
	}).Parse(pageTmpl)
	if err != nil {
		return nil, nil, fmt.Errorf("report: parse template: %w", err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, v); err != nil {
		return nil, nil, fmt.Errorf("report: execute template: %w", err)
	}
	if terr != nil {
		return nil, nil, terr
	}
	return buf.Bytes(), map[string][]byte{"style.css": styleCSS, "cre-logo-full.png": logoPNG}, nil
}

func buildView(d Data) (view, error) {
	var errs []error
	m := func(k string) string {
		s, e := msg(k)
		errs = append(errs, e)
		return s
	}
	f := func(x float64, dec int) string { return strconv.FormatFloat(x, 'f', dec, 64) }

	v := view{
		ProjectName: d.ProjectName, Nickname: d.Nickname,
		Island: catalogueOrOther(m, "island.", d.Island, d.IslandOther),
		Type:   catalogueOrOther(m, "type.", d.Type, d.TypeOther),
		Value:  baht(d.ValueBaht),
		Start:  beDate(m, d.StartDate, time.UTC), End: beDate(m, d.EndDate, time.UTC),
		Progress: d.ProgressPct, VersionNo: d.VersionNo,
		Submitted: beDate(m, d.SubmittedAt, thai), Generated: beDate(m, d.GeneratedAt, thai),
		Total: len(d.Indicators),
		Slots: []string{m("signature.assessor"), m("signature.reviewer"), m("signature.approver")},
	}
	counts := map[string]int{}
	var sum float64
	for _, i := range d.Indicators {
		counts[i.Level]++
		sum += i.RM
		iv := indicatorView{
			Code: i.Code, Name: i.Name, Level: i.Level,
			RL: f(i.RL, d.ScoreDecimals), RIC: f(i.RIC, d.ScoreDecimals), RIT: f(i.RIT, d.ScoreDecimals),
			RIE: f(i.RIE, d.ScoreDecimals), RIMax: f(i.RIMax, d.ScoreDecimals), RM: f(i.RM, d.RMDecimals),
		}
		v.Indicators = append(v.Indicators, iv)
		if i.Level != "H" && i.Level != "VH" {
			continue
		}
		iv.Strategy = m("strategy.none")
		if i.Strategy != "" {
			iv.Strategy = m("strategy." + i.Strategy)
		}
		for _, l := range adviceOrder {
			for _, a := range i.Advice {
				if a.List == l && len(a.Items) > 0 {
					iv.Advice = append(iv.Advice, adviceView{Label: template.HTML(m("advice." + l)), Items: a.Items})
				}
			}
		}
		v.HighRisk = append(v.HighRisk, iv)
	}
	v.ResultsTitle = fmt.Sprintf(m("section.results"), v.Total)
	v.AdviceTitle = fmt.Sprintf(m("section.advice"), len(v.HighRisk))
	for _, l := range Levels {
		v.Counts = append(v.Counts, levelCount{Level: l, Count: counts[l]})
	}
	if len(d.Indicators) > 0 {
		v.AverageRM = f(sum/float64(len(d.Indicators)), d.RMDecimals)
	}
	return v, errors.Join(errs...)
}

func catalogueOrOther(m func(string) string, prefix, code, other string) string {
	if code == "other" && other != "" {
		return other
	}
	return m(prefix + code)
}

// beDate formats a date as "24 พฤศจิกายน พ.ศ. 2569"; zero time gives "-".
func beDate(m func(string) string, t time.Time, loc *time.Location) string {
	if t.IsZero() {
		return "-"
	}
	t = t.In(loc)
	return fmt.Sprintf(m("date.format"), t.Day(), m("month."+strconv.Itoa(int(t.Month()))), t.Year()+543)
}

// baht formats an amount with thousands separators and two decimals.
func baht(x float64) string {
	s := strconv.FormatFloat(x, 'f', 2, 64)
	intPart, frac, _ := strings.Cut(s, ".")
	neg := strings.HasPrefix(intPart, "-")
	intPart = strings.TrimPrefix(intPart, "-")
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	out := b.String() + "." + frac
	if neg {
		out = "-" + out
	}
	return out
}
