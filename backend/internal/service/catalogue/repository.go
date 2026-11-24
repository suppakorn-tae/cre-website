package catalogue

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/engine"
)

// Repository loads the whole catalogue.
type Repository interface {
	Load(ctx context.Context) (*Snapshot, error)
}

// TxBeginner starts transactions with options; *pgxpool.Pool satisfies it.
type TxBeginner interface {
	BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error)
}

// PGRepository reads the catalogue tables through sqlc.
type PGRepository struct{ DB TxBeginner }

var _ Repository = PGRepository{}

// Load reads every catalogue table in one repeatable-read transaction, so an
// edit committed halfway cannot produce a snapshot that mixes old and new.
func (r PGRepository) Load(ctx context.Context) (*Snapshot, error) {
	tx, err := r.DB.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("catalogue: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlc.New(tx)

	dims, err := q.ListCatalogueDimensions(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: dimensions: %w", err)
	}
	factors, err := q.ListCatalogueFactors(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: factors: %w", err)
	}
	inds, err := q.ListCatalogueIndicators(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: indicators: %w", err)
	}
	opts, err := q.ListCatalogueRiEOptions(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: ri_e options: %w", err)
	}
	impact, err := q.ListCatalogueImpactTables(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: impact tables: %w", err)
	}
	advice, err := q.ListCatalogueAdvice(ctx)
	if err != nil {
		return nil, fmt.Errorf("catalogue: advice: %w", err)
	}
	return build(dims, factors, inds, opts, impact, advice)
}

// build groups the flat rows (one per locale of text, already in display
// order) into the nested snapshot.
func build(
	dims []sqlc.ListCatalogueDimensionsRow,
	factors []sqlc.ListCatalogueFactorsRow,
	inds []sqlc.ListCatalogueIndicatorsRow,
	opts []sqlc.ListCatalogueRiEOptionsRow,
	impact []sqlc.ListCatalogueImpactTablesRow,
	advice []sqlc.ListCatalogueAdviceRow,
) (*Snapshot, error) {
	var dimOut []Dimension
	dimIdx := map[string]int{}
	for _, r := range dims {
		i, ok := dimIdx[r.Code]
		if !ok {
			i = len(dimOut)
			dimIdx[r.Code] = i
			dimOut = append(dimOut, Dimension{Code: r.Code, Name: Text{}})
		}
		dimOut[i].Name[r.Locale] = r.Name
	}

	type pos struct{ d, f int }
	facIdx := map[string]pos{}
	for _, r := range factors {
		p, ok := facIdx[r.Code]
		if !ok {
			d, found := dimIdx[r.DimensionCode]
			if !found {
				return nil, fmt.Errorf("catalogue: factor %s: unknown dimension %s", r.Code, r.DimensionCode)
			}
			p = pos{d, len(dimOut[d].Factors)}
			facIdx[r.Code] = p
			dimOut[d].Factors = append(dimOut[d].Factors, Factor{Code: r.Code, Name: Text{}})
		}
		dimOut[p.d].Factors[p.f].Name[r.Locale] = r.Name
	}

	type ipos struct{ d, f, i int }
	indIdx := map[string]ipos{}
	for _, r := range inds {
		p, ok := indIdx[r.Code]
		if !ok {
			fp, found := facIdx[r.FactorCode]
			if !found {
				return nil, fmt.Errorf("catalogue: indicator %s: unknown factor %s", r.Code, r.FactorCode)
			}
			f := &dimOut[fp.d].Factors[fp.f]
			p = ipos{fp.d, fp.f, len(f.Indicators)}
			indIdx[r.Code] = p
			f.Indicators = append(f.Indicators, Indicator{
				Code: r.Code,
				Thresholds: engine.Thresholds{
					A: num(r.A), B: num(r.B), C: num(r.C), D: num(r.D), E: num(r.E),
					Direction: engine.Direction(r.Direction),
				},
				Name: Text{}, Unit: Text{},
				QuestionX: Text{}, QuestionY1: Text{}, QuestionY2: Text{}, QuestionY3: Text{},
			})
		}
		ind := &dimOut[p.d].Factors[p.f].Indicators[p.i]
		ind.Name[r.Locale] = r.Name
		ind.Unit[r.Locale] = r.Unit
		setText(ind.QuestionX, r.Locale, r.QuestionX)
		setText(ind.QuestionY1, r.Locale, r.QuestionY1)
		setText(ind.QuestionY2, r.Locale, r.QuestionY2)
		setText(ind.QuestionY3, r.Locale, r.QuestionY3)
	}

	var optOut []RiEOption
	optIdx := map[string]int{}
	for _, r := range opts {
		i, ok := optIdx[r.Code]
		if !ok {
			i = len(optOut)
			optIdx[r.Code] = i
			optOut = append(optOut, RiEOption{
				Code: r.Code, Score: int(r.Score), IsExclusive: r.IsExclusive, Label: Text{},
			})
		}
		optOut[i].Label[r.Locale] = r.Label
	}

	impactOut := map[string]ImpactTable{}
	for _, r := range impact {
		impactOut[string(r.Code)] = ImpactTable{
			A: float(r.A), B: float(r.B), C: float(r.C), D: float(r.D), E: float(r.E),
		}
	}

	adviceOut := map[AdviceKey][]AdviceItem{}
	adviceIdx := map[string]int{} // item id -> index in its list
	for _, r := range advice {
		k := AdviceKey{r.IndicatorCode, string(r.List)}
		id := r.ID.String()
		i, ok := adviceIdx[id]
		if !ok {
			i = len(adviceOut[k])
			adviceIdx[id] = i
			adviceOut[k] = append(adviceOut[k], AdviceItem{ID: id, Position: int(r.Position), Text: Text{}})
		}
		adviceOut[k][i].Text[r.Locale] = r.Text
	}

	return NewSnapshot(dimOut, optOut, impactOut, adviceOut)
}

func setText(t Text, locale string, v pgtype.Text) {
	if v.Valid {
		t[locale] = v.String
	}
}

// num converts a nullable numeric; a NULL threshold is a nil pointer.
func num(n pgtype.Numeric) *float64 {
	if !n.Valid {
		return nil
	}
	v := float(n)
	return &v
}

func float(n pgtype.Numeric) float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}
