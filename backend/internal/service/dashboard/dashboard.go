// Package dashboard is the Dashboard Service (UC-20, BR-26): KPI cards, the
// level distribution, H/VH per project and the panel behind each KPI card.
// Figures come from stored risk_result rows of each project's latest
// submitted version; nothing is recalculated. Every method takes the owner id
// and sees only that account's non-deleted projects and versions.
package dashboard

import (
	"context"
	"fmt"

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
