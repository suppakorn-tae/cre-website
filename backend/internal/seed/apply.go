package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Beginner starts a transaction; *pgx.Conn and *pgxpool.Pool satisfy it.
type Beginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Apply inserts the catalogue in one transaction. Every row is insert-if-
// absent, so rows an admin has edited are never overwritten. Seeded rows
// leave updated_by NULL. An advice list that already has items is left
// untouched as a whole, so an admin who removed or reordered items does not
// get seed items back.
func Apply(ctx context.Context, db Beginner, c *Catalogue) (err error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("seed: begin: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if err = apply(ctx, tx, c); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("seed: commit: %w", err)
	}
	return nil
}

func apply(ctx context.Context, tx pgx.Tx, c *Catalogue) error {
	exec := func(sql string, args ...any) error {
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			return fmt.Errorf("%s: %w", firstLine(sql), err)
		}
		return nil
	}

	if err := exec(`INSERT INTO locale (code, is_default) VALUES ($1, true) ON CONFLICT DO NOTHING`, Locale); err != nil {
		return err
	}
	for n, d := range c.Dimensions {
		if err := exec(`INSERT INTO dimension (code, sort_no) VALUES ($1, $2) ON CONFLICT DO NOTHING`, d.Code, n+1); err != nil {
			return err
		}
		if err := exec(`INSERT INTO dimension_text (dimension_code, locale, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			d.Code, Locale, d.NameTH); err != nil {
			return err
		}
	}
	for _, f := range c.Factors {
		if err := exec(`INSERT INTO factor (code, dimension_code, sort_no) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			f.Code, f.DimensionCode, f.No); err != nil {
			return err
		}
		if err := exec(`INSERT INTO factor_text (factor_code, locale, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			f.Code, Locale, f.NameTH); err != nil {
			return err
		}
	}
	for _, o := range c.RIEOptions {
		if err := exec(`INSERT INTO ri_e_option (code, score, is_exclusive) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			o.Code, o.Score, o.Code == "A"); err != nil {
			return err
		}
		if err := exec(`INSERT INTO ri_e_option_text (option_code, locale, label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			o.Code, Locale, o.LabelTH); err != nil {
			return err
		}
	}
	for _, t := range []struct {
		code  string
		table Table
	}{{"RI_C", c.RIC}, {"RI_T", c.RIT}} {
		if err := exec(`INSERT INTO impact_table (code, a, b, c, d, e)
			VALUES ($1::impact_code, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric)
			ON CONFLICT DO NOTHING`,
			t.code, t.table.A.String(), t.table.B.String(), t.table.C.String(),
			t.table.D.String(), t.table.E.String()); err != nil {
			return err
		}
	}
	for _, i := range c.Indicators {
		if err := applyIndicator(ctx, tx, exec, i); err != nil {
			return err
		}
	}
	return nil
}

func applyIndicator(ctx context.Context, tx pgx.Tx, exec func(string, ...any) error, i Indicator) error {
	dir, err := i.Direction()
	if err != nil {
		return err
	}
	if err := exec(`INSERT INTO indicator (code, factor_code, f_code, direction, a, b, c, d, e)
		VALUES ($1, $2, $3, $4::indicator_direction, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9::numeric)
		ON CONFLICT DO NOTHING`,
		i.Code, i.FactorCode, i.FCode, dir,
		numArg(i.A), numArg(i.B), numArg(i.C), numArg(i.D), numArg(i.E)); err != nil {
		return err
	}
	if err := exec(`INSERT INTO indicator_text
		(indicator_code, locale, name, unit, question_x, question_y1, question_y2, question_y3)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
		i.Code, Locale, i.NameTH, i.UnitTH, i.QuestionX, i.QuestionY1, i.QuestionY2, i.QuestionY3); err != nil {
		return err
	}
	for _, list := range AdviceLists {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM advice_item WHERE indicator_code = $1 AND list = $2::advice_list`,
			i.Code, list).Scan(&n); err != nil {
			return fmt.Errorf("count advice %s %s: %w", i.Code, list, err)
		}
		if n > 0 {
			continue
		}
		for pos, text := range i.Advice[list] {
			var id string
			if err := tx.QueryRow(ctx, `INSERT INTO advice_item (id, indicator_code, list, position)
				VALUES (gen_random_uuid(), $1, $2::advice_list, $3) RETURNING id`,
				i.Code, list, pos+1).Scan(&id); err != nil {
				return fmt.Errorf("insert advice_item %s %s %d: %w", i.Code, list, pos+1, err)
			}
			if err := exec(`INSERT INTO advice_item_text (item_id, locale, text) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
				id, Locale, text); err != nil {
				return err
			}
		}
	}
	return nil
}

// numArg maps a missing threshold to a NULL argument, never 0.
func numArg(p *json.Number) any {
	if p == nil {
		return nil
	}
	return p.String()
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	line, _, _ := strings.Cut(s, "\n")
	return line
}
