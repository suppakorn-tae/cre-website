package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/audit"
)

// Advice list codes, in display order.
var AdviceLists = []string{"RL", "RI_C", "RI_T", "RI_E"}

// Item count limits of one list (BR-20).
const (
	MinAdviceItems = 1
	MaxAdviceItems = 5
)

// DefaultLocale is the locale every item must have.
const DefaultLocale = "th"

// Errors returned by AdviceService.
var (
	// ErrIndicatorNotFound means the indicator does not exist.
	ErrIndicatorNotFound = errors.New("admin: indicator not found")
)

// FieldError names one invalid field.
type FieldError struct{ Field, Code string }

// ValidationError lists every invalid field of a request.
type ValidationError []FieldError

func (v ValidationError) Error() string { return "admin: advice failed validation" }

// AdviceItem is one advice text per locale.
type AdviceItem struct {
	Text map[string]string `json:"text"`
}

// AdviceSet is the four lists of one indicator.
type AdviceSet struct {
	IndicatorCode string
	Lists         map[string][]AdviceItem
	UpdatedAt     time.Time
}

// AdviceList is one stored list.
type AdviceList struct {
	IndicatorCode string
	List          string
	Items         []AdviceItem
	UpdatedAt     time.Time
}

// Invalidator drops the catalogue cache on every replica (catalogue.Service).
type Invalidator interface {
	Invalidate(ctx context.Context) error
}

// AdviceService edits advice lists (UC-15).
type AdviceService struct {
	db    DB
	audit Auditor
	inv   Invalidator
}

// NewAdviceService returns an AdviceService.
func NewAdviceService(db DB, a Auditor, inv Invalidator) *AdviceService {
	return &AdviceService{db: db, audit: a, inv: inv}
}

// Get returns the four lists of an indicator, or ErrIndicatorNotFound.
func (s *AdviceService) Get(ctx context.Context, code string) (AdviceSet, error) {
	q := sqlc.New(s.db)
	ok, err := q.AdminAdviceIndicatorExists(ctx, code)
	if err != nil {
		return AdviceSet{}, fmt.Errorf("admin: advice exists: %w", err)
	}
	if !ok {
		return AdviceSet{}, ErrIndicatorNotFound
	}
	return loadAdvice(ctx, q, code)
}

func loadAdvice(ctx context.Context, q *sqlc.Queries, code string) (AdviceSet, error) {
	rows, err := q.AdminListAdvice(ctx, code)
	if err != nil {
		return AdviceSet{}, fmt.Errorf("admin: list advice: %w", err)
	}
	set := AdviceSet{IndicatorCode: code, Lists: map[string][]AdviceItem{}}
	for _, l := range AdviceLists {
		set.Lists[l] = []AdviceItem{}
	}
	last := map[string]int16{}
	for _, r := range rows {
		l := string(r.List)
		if last[l] != r.Position {
			last[l] = r.Position
			set.Lists[l] = append(set.Lists[l], AdviceItem{Text: map[string]string{}})
		}
		items := set.Lists[l]
		items[len(items)-1].Text[r.Locale] = r.Text
		if r.UpdatedAt.After(set.UpdatedAt) {
			set.UpdatedAt = r.UpdatedAt
		}
	}
	return set, nil
}

// Validate checks one list: 1 to 5 items, each with non-blank th text and no
// blank text in any other locale.
func Validate(items []AdviceItem) error {
	var v ValidationError
	if len(items) < MinAdviceItems || len(items) > MaxAdviceItems {
		v = append(v, FieldError{"items", "count"})
	}
	for i, it := range items {
		if strings.TrimSpace(it.Text[DefaultLocale]) == "" {
			v = append(v, FieldError{fmt.Sprintf("items[%d].text.th", i), "required"})
		}
		for loc, t := range it.Text {
			if loc != DefaultLocale && strings.TrimSpace(t) == "" {
				v = append(v, FieldError{fmt.Sprintf("items[%d].text.%s", i, loc), "blank"})
			}
		}
	}
	if len(v) > 0 {
		return v
	}
	return nil
}

// Replace swaps the whole list in one transaction, audits the old and new
// list on the same transaction, then drops the catalogue cache. actor is the
// signed-in admin; ctx must carry what audit.Record needs.
func (s *AdviceService) Replace(ctx context.Context, actor uuid.UUID, code, list string, items []AdviceItem) (AdviceList, error) {
	if err := Validate(items); err != nil {
		return AdviceList{}, err
	}
	var out AdviceList
	err := dal.WithTx(ctx, s.db, func(tx pgx.Tx) error {
		q := sqlc.New(tx)
		if err := q.AdminAdviceLock(ctx, "advice:"+code); err != nil {
			return fmt.Errorf("admin: advice lock: %w", err)
		}
		ok, err := q.AdminAdviceIndicatorExists(ctx, code)
		if err != nil {
			return fmt.Errorf("admin: advice exists: %w", err)
		}
		if !ok {
			return ErrIndicatorNotFound
		}
		before, err := loadAdvice(ctx, q, code)
		if err != nil {
			return err
		}
		al := sqlc.AdviceList(list)
		if err := q.AdminDeleteAdviceList(ctx, sqlc.AdminDeleteAdviceListParams{IndicatorCode: code, List: al}); err != nil {
			return fmt.Errorf("admin: delete advice list: %w", err)
		}
		var at time.Time
		for i, it := range items {
			id := uuid.New()
			at, err = q.AdminInsertAdviceItem(ctx, sqlc.AdminInsertAdviceItemParams{
				ID: id, IndicatorCode: code, List: al, Position: int16(i + 1),
				UpdatedBy: uuid.NullUUID{UUID: actor, Valid: true},
			})
			if err != nil {
				return fmt.Errorf("admin: insert advice item: %w", err)
			}
			for loc, t := range it.Text {
				if err := q.AdminInsertAdviceText(ctx, sqlc.AdminInsertAdviceTextParams{ItemID: id, Locale: loc, Text: t}); err != nil {
					var pg *pgconn.PgError
					if errors.As(err, &pg) && pg.Code == "23503" {
						return ValidationError{{fmt.Sprintf("items[%d].text.%s", i, loc), "unknown_locale"}}
					}
					return fmt.Errorf("admin: insert advice text: %w", err)
				}
			}
		}
		out = AdviceList{IndicatorCode: code, List: list, Items: items, UpdatedAt: at}
		return s.audit.Record(ctx, tx, audit.Entry{
			Action: audit.AdviceEdit, TargetType: "indicator", TargetID: code,
			Old: map[string]any{"list": list, "items": before.Lists[list]},
			New: map[string]any{"list": list, "items": items},
		})
	})
	if err != nil {
		return AdviceList{}, err
	}
	if err := s.inv.Invalidate(ctx); err != nil {
		// The edit is committed; other replicas catch up on their next reload.
		slog.WarnContext(ctx, "catalogue invalidation after advice edit failed", "error", err)
	}
	return out, nil
}
