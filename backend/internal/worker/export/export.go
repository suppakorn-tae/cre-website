// Package export builds the pseudonymised research ZIP (UC-18, FR-38,
// FR-53, BR-14). The ZIP holds one folder per pseudonym; nothing in it
// identifies a person: the research read path never selects an e-mail or a
// Google id.
package export

import (
	"archive/zip"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/runtime"
)

// Num is a decimal kept as text so no precision is lost. Empty means null.
type Num string

// MarshalJSON writes the number as a JSON number, or null when empty.
func (n Num) MarshalJSON() ([]byte, error) {
	if n == "" {
		return []byte("null"), nil
	}
	return []byte(n), nil
}

// Options are the per-job settings of an export.
type Options struct {
	All            bool // every account, not just the chosen ones
	IncludeDeleted bool // soft-deleted projects and versions too
}

// Account is what the research read path knows about an account: a
// pseudonym and the organisation, never an e-mail or a Google id.
type Account struct {
	ID           uuid.UUID `json:"-"`
	Pseudonym    string    `json:"pseudonym"`
	Organisation *string   `json:"organisation"`
}

// Threshold is one snapshot threshold row (a..e).
type Threshold struct {
	Code string `json:"code"`
	A    Num    `json:"a"`
	B    Num    `json:"b"`
	C    Num    `json:"c"`
	D    Num    `json:"d"`
	E    Num    `json:"e"`
}

// IndicatorRow is one CSV row: the answers and the result of one indicator.
// Result fields are empty while the version has no result.
type IndicatorRow struct {
	Code      string
	X         Num
	XUnit     string
	Y1        Num
	Y1Unit    string
	Y2        Num
	Y2Unit    string
	Y3Options string
	RL, RIC   Num
	RIT, RIE  Num
	RIMax, RM Num
	Level     string
	Strategy  string
}

// Version is one assessment version with its snapshot rows.
type Version struct {
	ID                uuid.UUID      `json:"id"`
	VersionNo         int            `json:"version_no"`
	Status            string         `json:"status"`
	SubmissionNo      int            `json:"submission_no"`
	SnapValueBaht     Num            `json:"snap_value_baht"`
	SnapStartDate     string         `json:"snap_start_date"`
	SnapEndDate       string         `json:"snap_end_date"`
	SnapScoreDecimals int            `json:"snap_score_decimals"`
	SnapRMDecimals    int            `json:"snap_rm_decimals"`
	ProgressAtSubmit  *int           `json:"progress_at_submit"`
	CreatedAt         time.Time      `json:"created_at"`
	SubmittedAt       *time.Time     `json:"submitted_at"`
	DeletedAt         *time.Time     `json:"deleted_at"`
	RLThresholds      []Threshold    `json:"rl_thresholds"`
	ImpactThresholds  []Threshold    `json:"impact_thresholds"`
	Rows              []IndicatorRow `json:"-"`
}

// Project is a project with its versions.
type Project struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Nickname    string     `json:"nickname"`
	IslandCode  string     `json:"island_code"`
	IslandOther *string    `json:"island_other"`
	TypeCode    string     `json:"type_code"`
	TypeOther   *string    `json:"type_other"`
	StartDate   string     `json:"start_date"`
	EndDate     string     `json:"end_date"`
	ValueBaht   Num        `json:"value_baht"`
	ProgressPct int        `json:"progress_pct"`
	Description *string    `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	DeletedAt   *time.Time `json:"deleted_at"`
	Versions    []Version  `json:"versions"`
}

// Source is the research read path.
type Source interface {
	Options(ctx context.Context, jobID uuid.UUID) (Options, error)
	Accounts(ctx context.Context, jobID uuid.UUID, all bool) ([]Account, error)
	// Projects returns the owner's projects with versions and indicator
	// rows, soft-deleted ones only when includeDeleted is set.
	Projects(ctx context.Context, owner uuid.UUID, includeDeleted bool) ([]Project, error)
}

// Store is the part of the S3 adapter the builder uses.
type Store interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
}

var csvHeader = []string{
	"indicator", "x", "x_unit", "y1", "y1_unit", "y2", "y2_unit", "y3_options",
	"rl", "ri_c", "ri_t", "ri_e", "ri_max", "rm", "level", "strategy",
}

// zipTime is the fixed entry time, so the same data gives the same bytes.
var zipTime = time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)

// Build writes the research ZIP for job to w.
func Build(ctx context.Context, src Source, job uuid.UUID, w io.Writer) error {
	opt, err := src.Options(ctx, job)
	if err != nil {
		return fmt.Errorf("export: options: %w", err)
	}
	accounts, err := src.Accounts(ctx, job, opt.All)
	if err != nil {
		return fmt.Errorf("export: accounts: %w", err)
	}
	zw := zip.NewWriter(w)
	for _, a := range accounts {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := writeJSON(zw, a.Pseudonym+"/user.json", a); err != nil {
			return err
		}
		projects, err := src.Projects(ctx, a.ID, opt.IncludeDeleted)
		if err != nil {
			return fmt.Errorf("export: projects: %w", err)
		}
		for _, p := range projects {
			dir := a.Pseudonym + "/" + safeName(p.Nickname) + "_" + p.ID.String() + "/"
			if err := writeJSON(zw, dir+"project.json", p); err != nil {
				return err
			}
			for _, v := range p.Versions {
				if err := writeCSV(zw, dir+"version-"+strconv.Itoa(v.VersionNo)+".csv", v.Rows); err != nil {
					return err
				}
			}
		}
	}
	if err := zw.Close(); err != nil {
		return fmt.Errorf("export: close zip: %w", err)
	}
	return nil
}

func entry(zw *zip.Writer, name string) (io.Writer, error) {
	return zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: zipTime})
}

func writeJSON(zw *zip.Writer, name string, v any) error {
	w, err := entry(zw, name)
	if err != nil {
		return fmt.Errorf("export: create %s: %w", name, err)
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return fmt.Errorf("export: write %s: %w", name, err)
	}
	return nil
}

// writeCSV writes UTF-8 with a byte order mark, so spreadsheet programs
// read Thai text correctly.
func writeCSV(zw *zip.Writer, name string, rows []IndicatorRow) error {
	w, err := entry(zw, name)
	if err != nil {
		return fmt.Errorf("export: create %s: %w", name, err)
	}
	if _, err := io.WriteString(w, "\xEF\xBB\xBF"); err != nil {
		return fmt.Errorf("export: write %s: %w", name, err)
	}
	cw := csv.NewWriter(w)
	_ = cw.Write(csvHeader)
	for _, r := range rows {
		_ = cw.Write([]string{
			r.Code, string(r.X), r.XUnit, string(r.Y1), r.Y1Unit, string(r.Y2), r.Y2Unit,
			r.Y3Options, string(r.RL), string(r.RIC), string(r.RIT), string(r.RIE),
			string(r.RIMax), string(r.RM), r.Level, r.Strategy,
		})
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("export: write %s: %w", name, err)
	}
	return nil
}

// safeName keeps a user-chosen nickname from adding or escaping a folder.
func safeName(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || strings.ContainsRune(`/\:*?"<>|`, r) {
			return '_'
		}
		return r
	}, s)
}

// NewRunner returns the runtime runner for export jobs. It streams the ZIP
// to exports/{id}.zip. The runtime's MarkDone sets expires_at (finish + 7
// days). Running it again overwrites the same object, so it is idempotent.
func NewRunner(src Source, store Store) runtime.Runner {
	return func(ctx context.Context, j jobs.Job) error {
		if j.Kind != jobs.KindExport {
			return fmt.Errorf("export: job %s is a %s job", j.ID, j.Kind)
		}
		pr, pw := io.Pipe()
		buildErr := make(chan error, 1)
		go func() {
			err := Build(ctx, src, j.ID, pw)
			_ = pw.CloseWithError(err) // nil closes normally
			buildErr <- err
		}()
		putErr := store.Put(ctx, jobs.ObjectKey(jobs.KindExport, j.ID), pr, -1, "application/zip")
		_ = pr.CloseWithError(putErr) // unblocks the builder if Put stopped early
		if err := <-buildErr; err != nil {
			return err
		}
		return putErr
	}
}
