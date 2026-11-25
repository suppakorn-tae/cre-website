// Package dashboard is the Dashboard Service (UC-20, BR-26): KPI cards, the
// level distribution, H/VH per project and the panel behind each KPI card.
// Figures come from stored risk_result rows of each project's latest
// submitted version; nothing is recalculated. Every method takes the owner id
// and sees only that account's non-deleted projects and versions.
package dashboard

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal"
	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
)

// Service reads the dashboard figures.
type Service struct {
	q *sqlc.Queries
}

// New returns a Service.
func New(db dal.DBTX) *Service {
	return &Service{q: sqlc.New(db)}
}

// Kpis are the four KPI cards. TotalValueBaht is exact decimal text.
type Kpis struct {
	ProjectCount, VersionCount, HVhIndicatorCount, IslandCount int
	TotalValueBaht                                             string
}

// LevelCounts is the number of scored indicators per risk level.
type LevelCounts struct{ VL, L, M, H, VH int }

// ProjectRisk is the H and VH count of one project's latest submitted version.
type ProjectRisk struct {
	ProjectID       uuid.UUID
	Name, Nickname  string
	VersionID       uuid.UUID
	VersionNo       int
	HCount, VhCount int
}

// Summary is the figures of GET /dashboard.
type Summary struct {
	Kpis         Kpis
	Levels       LevelCounts
	ProjectRisks []ProjectRisk
}

// Summary returns the KPI cards, level distribution and H/VH per project.
func (s *Service) Summary(ctx context.Context, owner uuid.UUID) (Summary, error) {
	k, err := s.q.DashboardKpis(ctx, owner)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: kpis: %w", err)
	}
	lv, err := s.q.DashboardLevelCounts(ctx, owner)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: levels: %w", err)
	}
	pr, err := s.q.DashboardProjectRisks(ctx, owner)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: project risks: %w", err)
	}
	out := Summary{
		Kpis: Kpis{
			ProjectCount: int(k.ProjectCount), VersionCount: int(k.VersionCount),
			HVhIndicatorCount: int(k.HVhIndicatorCount), IslandCount: int(k.IslandCount),
			TotalValueBaht: k.TotalValueBaht,
		},
		ProjectRisks: make([]ProjectRisk, 0, len(pr)),
	}
	for _, r := range lv {
		n := int(r.N)
		switch r.Level {
		case sqlc.RiskLevelVL:
			out.Levels.VL = n
		case sqlc.RiskLevelL:
			out.Levels.L = n
		case sqlc.RiskLevelM:
			out.Levels.M = n
		case sqlc.RiskLevelH:
			out.Levels.H = n
		case sqlc.RiskLevelVH:
			out.Levels.VH = n
		}
	}
	for _, r := range pr {
		out.ProjectRisks = append(out.ProjectRisks, ProjectRisk{
			ProjectID: r.ProjectID, Name: r.Name, Nickname: r.Nickname, VersionID: r.VersionID,
			VersionNo: int(r.VersionNo), HCount: int(r.HCount), VhCount: int(r.VhCount),
		})
	}
	return out, nil
}

// ProjectItem is one row of the projects panel. HVhCount, AvgRM (exact
// decimal text) and LatestSubmittedVersionID are nil until a version has been
// submitted; AvgRM is also nil when no indicator is scored.
type ProjectItem struct {
	ProjectID                 uuid.UUID
	Name, Nickname            string
	IslandCode, TypeCode      string
	IslandOther, TypeOther    *string
	ValueBaht                 string
	ProgressPct, VersionCount int
	LatestVersionID           uuid.UUID
	LatestVersionNo           int
	LatestVersionStatus       string
	LatestSubmittedVersionID  *uuid.UUID
	HVhCount                  *int
	AvgRM                     *string
}

// ProjectsParams selects one page of the projects panel. Q is raw search text.
type ProjectsParams struct {
	Q              string
	Page, PageSize int
}

// ProjectsPage is one page of the projects panel and the total match count.
type ProjectsPage struct {
	Items []ProjectItem
	Total int
}

// Projects returns one page of the caller's projects with a live version,
// newest first, filtered by Q over name, nickname and island (code, Thai name or free text).
func (s *Service) Projects(ctx context.Context, owner uuid.UUID, p ProjectsParams) (ProjectsPage, error) {
	args := sqlc.DashboardProjectsPanelParams{
		OwnerID: owner, Q: likePattern(p.Q), IslandCodes: islandCodesByName(p.Q),
		PageLimit: int32(p.PageSize), PageOffset: int32((p.Page - 1) * p.PageSize), //nolint:gosec // bounded by the handler
	}
	rows, err := s.q.DashboardProjectsPanel(ctx, args)
	if err != nil {
		return ProjectsPage{}, fmt.Errorf("dashboard: projects: %w", err)
	}
	out := ProjectsPage{Items: make([]ProjectItem, 0, len(rows))}
	for _, r := range rows {
		out.Total = int(r.Total)
		it := ProjectItem{
			ProjectID: r.ID, Name: r.Name, Nickname: r.Nickname, IslandCode: r.IslandCode,
			TypeCode: r.TypeCode, ValueBaht: r.ValueBaht, ProgressPct: int(r.ProgressPct),
			VersionCount: int(r.VersionCount), LatestVersionID: r.LatestVersionID,
			LatestVersionNo: int(r.LatestVersionNo), LatestVersionStatus: string(r.LatestVersionStatus),
		}
		if r.IslandOther.Valid {
			it.IslandOther = &r.IslandOther.String
		}
		if r.TypeOther.Valid {
			it.TypeOther = &r.TypeOther.String
		}
		if r.Submitted {
			id, n := r.LatestSubmittedVersionID, int(r.HVhCount)
			it.LatestSubmittedVersionID, it.HVhCount = &id, &n
			if r.AvgRm != "" {
				it.AvgRM = &r.AvgRm
			}
		}
		out.Items = append(out.Items, it)
	}
	if len(rows) == 0 && p.Page > 1 {
		// A page past the end carries no total; ask for it on page one.
		args.PageLimit, args.PageOffset = 1, 0
		first, err := s.q.DashboardProjectsPanel(ctx, args)
		if err != nil {
			return ProjectsPage{}, fmt.Errorf("dashboard: projects total: %w", err)
		}
		if len(first) > 0 {
			out.Total = int(first[0].Total)
		}
	}
	return out, nil
}

// TopIndicator is an indicator ranked by projects with it at H or VH.
type TopIndicator struct {
	Rank                      int
	IndicatorCode, FactorCode string
	HCount, VhCount           int
}

// TopIndicators returns the Top 10 indicators most often H or VH. Ties: more
// VH first, then indicator code.
func (s *Service) TopIndicators(ctx context.Context, owner uuid.UUID) ([]TopIndicator, error) {
	rows, err := s.q.DashboardTopIndicators(ctx, owner)
	if err != nil {
		return nil, fmt.Errorf("dashboard: top indicators: %w", err)
	}
	out := make([]TopIndicator, len(rows))
	for i, r := range rows {
		out[i] = TopIndicator{
			Rank: i + 1, IndicatorCode: r.IndicatorCode, FactorCode: r.FactorCode,
			HCount: int(r.HCount), VhCount: int(r.VhCount),
		}
	}
	return out, nil
}

// IslandProject is a project in an island group. HVhCount is nil until a
// version has been submitted.
type IslandProject struct {
	ProjectID       uuid.UUID
	Name, Nickname  string
	ProgressPct     int
	LatestVersionID uuid.UUID
	HVhCount        *int
}

// IslandGroup is the caller's projects on one island.
type IslandGroup struct {
	IslandCode string
	Projects   []IslandProject
}

// Islands returns the caller's projects grouped by island, in island order.
func (s *Service) Islands(ctx context.Context, owner uuid.UUID) ([]IslandGroup, error) {
	rows, err := s.q.DashboardIslands(ctx, owner)
	if err != nil {
		return nil, fmt.Errorf("dashboard: islands: %w", err)
	}
	out := []IslandGroup{}
	for _, r := range rows {
		if n := len(out); n == 0 || out[n-1].IslandCode != r.IslandCode {
			out = append(out, IslandGroup{IslandCode: r.IslandCode, Projects: []IslandProject{}})
		}
		g := &out[len(out)-1]
		ip := IslandProject{
			ProjectID: r.ProjectID, Name: r.Name, Nickname: r.Nickname,
			ProgressPct: int(r.ProgressPct), LatestVersionID: r.LatestVersionID,
		}
		if r.Submitted {
			n := int(r.HVhCount)
			ip.HVhCount = &n
		}
		g.Projects = append(g.Projects, ip)
	}
	return out, nil
}

// islandNameTH is the Thai island name per code, copied from
// web/messages/th/projects.json (a test keeps the two equal). The island
// table holds codes only, so the Thai half of the search lives here.
var islandNameTH = map[string]string{
	"koh_tao": "เกาะเต่า", "koh_samui": "เกาะสมุย", "koh_phangan": "เกาะพะงัน",
	"koh_phi_phi": "เกาะพีพี", "koh_lanta": "เกาะลันตา", "koh_chang": "เกาะช้าง",
	"koh_kood": "เกาะกูด", "other": "อื่น ๆ",
}

// islandCodesByName returns the codes of the islands whose Thai name contains
// the search text. It is never nil, so the query gets an empty array.
func islandCodesByName(q string) []string {
	q = strings.ToLower(strings.TrimSpace(q))
	codes := []string{}
	if q == "" {
		return codes
	}
	for code, name := range islandNameTH {
		if strings.Contains(strings.ToLower(name), q) {
			codes = append(codes, code)
		}
	}
	return codes
}

// likePattern turns search text into an ILIKE pattern, escaping wildcards.
// Empty text gives "" which the query reads as "no filter".
func likePattern(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}
