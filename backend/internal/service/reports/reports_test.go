package reports_test

import (
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/dal/sqlc"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/reports"
)

func TestIsCurrent(t *testing.T) {
	created := time.Date(2026, 11, 27, 10, 0, 0, 0, time.UTC)
	job := func(sub int32, changed time.Time) sqlc.FindLatestReportJobRow {
		return sqlc.FindLatestReportJobRow{CreatedAt: created, SubmissionNo: sub, InputsChangedAt: changed}
	}
	tests := []struct {
		name string
		job  sqlc.FindLatestReportJobRow
		sub  int32
		want bool
	}{
		{"nothing changed since the job", job(2, created.Add(-time.Hour)), 2, true},
		{"new submission", job(2, created.Add(-time.Hour)), 3, false},
		{"strategy or project changed after the job", job(2, created.Add(time.Second)), 2, false},
		{"changed in the same instant counts as a change", job(2, created), 2, false},
		{"one microsecond before is in the pdf", job(2, created.Add(-time.Microsecond)), 2, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := reports.IsCurrent(tt.job, tt.sub); got != tt.want {
				t.Fatalf("IsCurrent = %v, want %v", got, tt.want)
			}
		})
	}
}
