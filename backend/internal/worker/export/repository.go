package export

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// Locale is the catalogue language of the unit shown next to an input.
const Locale = "th"

// Repository is the research read path. It is separate from the user-facing
// repositories: it reads every account's data, and soft-deleted rows when
// asked, but never an e-mail, a password hash or a Google id.
type Repository struct{ db dal.DBTX }

// NewRepository returns a Repository.
func NewRepository(db dal.DBTX) *Repository { return &Repository{db: db} }

// Options reads the export job's settings.
func (r *Repository) Options(ctx context.Context, jobID uuid.UUID) (Options, error) {
	row, err := sqlc.New(r.db).GetExportJobOptions(ctx, jobID)
	if err != nil {
		return Options{}, err
	}
	return Options{All: row.Scope == sqlc.ExportScopeAll, IncludeDeleted: row.IncludeDeleted}, nil
}

// Accounts lists the accounts in scope.
func (r *Repository) Accounts(ctx context.Context, jobID uuid.UUID, all bool) ([]Account, error) {
	rows, err := sqlc.New(r.db).ListResearchAccounts(ctx, sqlc.ListResearchAccountsParams{AllAccounts: all, JobID: jobID})
	if err != nil {
		return nil, err
	}
	out := make([]Account, len(rows))
	for i, a := range rows {
		out[i] = Account{ID: a.ID, Pseudonym: a.Pseudonym, Organisation: text(a.Organisation)}
	}
	return out, nil
}

// Projects loads one owner's projects with versions, snapshot rows and
// indicator rows.
func (r *Repository) Projects(ctx context.Context, owner uuid.UUID, includeDeleted bool) ([]Project, error) {
	q := sqlc.New(r.db)
	ps, err := q.ListResearchProjects(ctx, sqlc.ListResearchProjectsParams{OwnerID: owner, IncludeDeleted: includeDeleted})
	if err != nil {
		return nil, err
	}
	out := make([]Project, 0, len(ps))
	for _, p := range ps {
		vs, err := r.versions(ctx, q, p.ID, includeDeleted)
		if err != nil {
			return nil, fmt.Errorf("project %s: %w", p.ID, err)
		}
		out = append(out, Project{
			ID: p.ID, Name: p.Name, Nickname: p.Nickname, IslandCode: p.IslandCode,
			IslandOther: text(p.IslandOther), TypeCode: p.TypeCode, TypeOther: text(p.TypeOther),
			StartDate: date(p.StartDate), EndDate: date(p.EndDate), ValueBaht: num(p.ValueBaht),
			ProgressPct: int(p.ProgressPct), Description: text(p.Description),
			CreatedAt: p.CreatedAt, DeletedAt: p.DeletedAt, Versions: vs,
		})
	}
	return out, nil
}

func (r *Repository) versions(ctx context.Context, q *sqlc.Queries, project uuid.UUID, incl bool) ([]Version, error) {
	vs, err := q.ListResearchVersions(ctx, sqlc.ListResearchVersionsParams{ProjectID: project, IncludeDeleted: incl})
	if err != nil {
		return nil, err
	}
	rls, err := q.ListResearchRlThresholds(ctx, sqlc.ListResearchRlThresholdsParams{ProjectID: project, IncludeDeleted: incl})
	if err != nil {
		return nil, err
	}
	imps, err := q.ListResearchImpactThresholds(ctx, sqlc.ListResearchImpactThresholdsParams{ProjectID: project, IncludeDeleted: incl})
	if err != nil {
		return nil, err
	}
	ind, err := q.ListResearchIndicatorRows(ctx, sqlc.ListResearchIndicatorRowsParams{Locale: Locale, ProjectID: project, IncludeDeleted: incl})
	if err != nil {
		return nil, err
	}
	out := make([]Version, len(vs))
	at := make(map[uuid.UUID]int, len(vs))
	for i, v := range vs {
		at[v.ID] = i
		out[i] = Version{
			ID: v.ID, VersionNo: int(v.VersionNo), Status: string(v.Status), SubmissionNo: int(v.SubmissionNo),
			SnapValueBaht: num(v.SnapValueBaht), SnapStartDate: date(v.SnapStartDate), SnapEndDate: date(v.SnapEndDate),
			SnapScoreDecimals: int(v.SnapScoreDecimals), SnapRMDecimals: int(v.SnapRmDecimals),
			CreatedAt: v.CreatedAt, SubmittedAt: v.SubmittedAt, DeletedAt: v.DeletedAt,
			RLThresholds: []Threshold{}, ImpactThresholds: []Threshold{},
		}
		if v.ProgressAtSubmit.Valid {
			p := int(v.ProgressAtSubmit.Int16)
			out[i].ProgressAtSubmit = &p
		}
	}
	for _, t := range rls {
		i := at[t.VersionID]
		out[i].RLThresholds = append(out[i].RLThresholds, Threshold{
			Code: t.IndicatorCode, A: num(t.A), B: num(t.B), C: num(t.C), D: num(t.D), E: num(t.E),
		})
	}
	for _, t := range imps {
		i := at[t.VersionID]
		out[i].ImpactThresholds = append(out[i].ImpactThresholds, Threshold{
			Code: string(t.ImpactCode), A: num(t.A), B: num(t.B), C: num(t.C), D: num(t.D), E: num(t.E),
		})
	}
	for _, a := range ind {
		i := at[a.VersionID]
		row := IndicatorRow{
			Code: a.IndicatorCode, X: num(a.X), XUnit: a.XUnit.String, Y1: num(a.Y1Value), Y2: num(a.Y2Value),
			Y3Options: a.Y3Options, RL: num(a.Rl), RIC: num(a.RiC), RIT: num(a.RiT), RIE: num(a.RiE),
			RIMax: num(a.RiMax), RM: num(a.Rm),
		}
		if a.Y1Unit.Valid {
			row.Y1Unit = string(a.Y1Unit.CostUnit)
		}
		if a.Y2Unit.Valid {
			row.Y2Unit = string(a.Y2Unit.TimeUnit)
		}
		if a.Level.Valid {
			row.Level = string(a.Level.RiskLevel)
		}
		if a.Strategy.Valid {
			row.Strategy = string(a.Strategy.RiskStrategy)
		}
		out[i].Rows = append(out[i].Rows, row)
	}
	return out, nil
}

func text(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func date(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}

func num(n pgtype.Numeric) Num {
	if !n.Valid {
		return ""
	}
	v, err := n.Value()
	if err != nil {
		return ""
	}
	s, _ := v.(string)
	return Num(s)
}
