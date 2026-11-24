package report_test

import (
	"bytes"
	"context"
	"fmt"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/webassembly"
	"github.com/moby/moby/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/jobs"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil"
	"github.com/suppakorn-tae/cre-website/backend/internal/worker/report"
	tmpl "github.com/suppakorn-tae/cre-website/backend/templates/report"
)

func startGotenberg(t *testing.T) *pdf.Client {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "gotenberg/gotenberg:8",
			ExposedPorts: []string{"3000/tcp"},
			// No usable DNS: the render only succeeds if every asset is sent.
			HostConfigModifier: func(hc *container.HostConfig) { hc.DNS = []netip.Addr{netip.MustParseAddr("127.0.0.1")} },
			WaitingFor:         wait.ForHTTP("/health").WithPort("3000/tcp").WithStartupTimeout(2 * time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start gotenberg: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(c) })
	url, err := c.PortEndpoint(ctx, "3000/tcp", "http")
	if err != nil {
		t.Fatal(err)
	}
	return pdf.New(url)
}

// pdfText returns the text of every page and the page count.
func pdfText(t *testing.T, data []byte) (string, int) {
	t.Helper()
	pool, err := webassembly.Init(webassembly.Config{MinIdle: 1, MaxIdle: 1, MaxTotal: 1})
	if err != nil {
		t.Fatalf("init pdfium: %v", err)
	}
	defer func() { _ = pool.Close() }()
	inst, err := pool.GetInstance(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := inst.OpenDocument(&requests.OpenDocument{File: &data})
	if err != nil {
		t.Fatalf("open pdf: %v", err)
	}
	defer func() { _, _ = inst.FPDF_CloseDocument(&requests.FPDF_CloseDocument{Document: doc.Document}) }()
	pc, err := inst.FPDF_GetPageCount(&requests.FPDF_GetPageCount{Document: doc.Document})
	if err != nil {
		t.Fatal(err)
	}
	var sb strings.Builder
	for i := 0; i < pc.PageCount; i++ {
		res, err := inst.GetPageText(&requests.GetPageText{
			Page: requests.Page{ByIndex: &requests.PageByIndex{Document: doc.Document, Index: i}},
		})
		if err != nil {
			t.Fatalf("extract page %d: %v", i, err)
		}
		sb.WriteString(res.Text)
	}
	return sb.String(), pc.PageCount
}

// norm drops white space and Thai combining marks. pdfium repeats stacked
// Thai clusters when it extracts text, so both sides are compared without them.
func norm(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == ' ' || r == '\n' || r == '\r' || r == '\t' || r == ' ':
		case r == 'ั' || (r >= 'ิ' && r <= 'ฺ') || (r >= '็' && r <= '๎'):
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// TestGoldenReport builds a report from stored rows in Postgres, renders it
// through Gotenberg and checks that every H and VH indicator, its advice and
// its strategy are in the extracted text.
func TestGoldenReport(t *testing.T) {
	gb := startGotenberg(t)
	db := testutil.NewDB(t)
	ctx := context.Background()

	owner := testutil.NewAccount(t, db)
	p := testutil.NewProject(t, db, owner.ID)
	v := testutil.NewVersionWithSnapshot(t, db, p.ID)

	rows, err := db.Query(ctx, `SELECT i.code FROM indicator i JOIN factor f ON f.code = i.factor_code
		ORDER BY f.sort_no, i.f_code LIMIT 4`)
	if err != nil {
		t.Fatal(err)
	}
	var codes []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			t.Fatal(err)
		}
		codes = append(codes, c)
	}
	rows.Close()

	type fx struct {
		level, rm string
		lists     []string
		strategy  string
	}
	fixtures := []fx{
		{"H", "4", []string{"RL", "RI_C"}, "REDUCE"},
		{"VH", "5", []string{"RI_E"}, "TRANSFER"},
		{"M", "3", []string{"RL"}, ""}, // advice is stored but not shown below H
		{"VL", "1", nil, ""},
	}
	for i, f := range fixtures {
		testutil.NewAnswer(t, db, v.ID, codes[i])
		testutil.NewResult(t, db, v.ID, codes[i], func(r *testutil.Result) { r.Level, r.RM = f.level, f.rm })
		for _, l := range f.lists {
			if _, err := db.Exec(ctx, `INSERT INTO result_advice_list VALUES ($1, $2, $3::advice_list)`, v.ID, codes[i], l); err != nil {
				t.Fatal(err)
			}
		}
		if f.strategy != "" {
			if _, err := db.Exec(ctx, `INSERT INTO strategy_choice (version_id, indicator_code, strategy)
				VALUES ($1, $2, $3::risk_strategy)`, v.ID, codes[i], f.strategy); err != nil {
				t.Fatal(err)
			}
		}
	}
	testutil.SubmitVersion(t, db, v.ID)
	jobID := uuid.New()
	if _, err := db.Exec(ctx, `INSERT INTO job (id, kind, requested_by) VALUES ($1, 'report', $2)`, jobID, owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO report_job (job_id, version_id, submission_no) VALUES ($1, $2, 1)`, jobID, v.ID); err != nil {
		t.Fatal(err)
	}

	up := &fakeUploader{}
	run := report.NewRunner(report.NewStore(db), gb, up)
	if err := run(ctx, jobs.Job{ID: jobID, Kind: jobs.KindReport}); err != nil {
		t.Fatalf("run: %v", err)
	}
	out, ok := up.objects["reports/"+jobID.String()+".pdf"]
	if !ok || !bytes.HasPrefix(out, []byte("%PDF-")) {
		t.Fatalf("no pdf uploaded: %v", up.objects)
	}
	text, _ := pdfText(t, out)
	got := norm(text)
	defer func() {
		if t.Failed() {
			t.Logf("extracted text (first 1500 bytes): %.1500q", text)
		}
	}()

	want := []string{"TST1", "ผลลัพธ์เป็นข้อมูลเบื้องต้นสำหรับใช้ประกอบการพิจารณาเท่านั้น", "ผู้ประเมิน", "ผู้ตรวจสอบ", "ผู้อนุมัติ", "ลดความเสี่ยง", "โอนความเสี่ยง"}
	for _, c := range codes[:2] { // H and VH: code, name and every advice item of the stored lists
		var name string
		if err := db.QueryRow(ctx, `SELECT name FROM indicator_text WHERE indicator_code = $1 AND locale = 'th'`, c).Scan(&name); err != nil {
			t.Fatal(err)
		}
		want = append(want, c, name)
	}
	adv, err := db.Query(ctx, `
		SELECT t.text FROM result_advice_list ral
		JOIN advice_item ai ON ai.indicator_code = ral.indicator_code AND ai.list = ral.list
		JOIN advice_item_text t ON t.item_id = ai.id AND t.locale = 'th'
		WHERE ral.version_id = $1 AND ral.indicator_code = ANY($2)`, v.ID, codes[:2])
	if err != nil {
		t.Fatal(err)
	}
	for adv.Next() {
		var s string
		if err := adv.Scan(&s); err != nil {
			t.Fatal(err)
		}
		want = append(want, s)
	}
	adv.Close()
	if len(want) < 12 {
		t.Fatalf("fixture has too little advice: %d expectations", len(want))
	}
	for _, w := range want {
		if !strings.Contains(got, norm(w)) {
			t.Errorf("pdf text lacks %q", w)
		}
	}
}

// TestSixtyPageReportWithinTimeout renders 55 indicators with five long
// advice items in each of the four lists and checks the PDF has at least 60
// pages and that the job finishes inside the job time-out.
func TestSixtyPageReportWithinTimeout(t *testing.T) {
	gb := startGotenberg(t)
	d := tmpl.Data{
		ProjectName: "โครงการใหญ่", Nickname: "BIG1", Island: "koh_tao", Type: "building",
		ValueBaht: 1e9, StartDate: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate: time.Date(2029, 1, 1, 0, 0, 0, 0, time.UTC), VersionNo: 1,
		SubmittedAt: time.Now(), ScoreDecimals: 2, RMDecimals: 2,
	}
	long := strings.Repeat("ผู้ที่ทำงานก่อสร้างต้องได้รับการอบรมความปลอดภัยก่อนเริ่มงานทุกครั้ง ", 6)
	for i := 0; i < 55; i++ {
		ind := tmpl.Indicator{
			Code: fmt.Sprintf("EC-%02d", i+1), Name: "ตัวชี้วัดทดสอบ", Level: "VH", Strategy: "REDUCE",
			RL: 5, RIC: 5, RIT: 5, RIE: 5, RIMax: 5, RM: 5,
		}
		for _, l := range []string{"RL", "RI_C", "RI_T", "RI_E"} {
			a := tmpl.AdviceList{List: l}
			for k := 0; k < 5; k++ {
				a.Items = append(a.Items, fmt.Sprintf("%d. %s", k+1, long))
			}
			ind.Advice = append(ind.Advice, a)
		}
		d.Indicators = append(d.Indicators, ind)
	}

	up := &fakeUploader{}
	run := report.NewRunner(fakeSource{data: d}, gb, up)
	j := jobs.Job{ID: uuid.New(), Kind: jobs.KindReport}
	start := time.Now()
	if err := run(context.Background(), j); err != nil {
		t.Fatalf("run: %v", err)
	}
	if took := time.Since(start); took > report.DefaultTimeout {
		t.Errorf("render took %s, job time-out is %s", took, report.DefaultTimeout)
	}
	_, pages := pdfText(t, up.objects["reports/"+j.ID.String()+".pdf"])
	if pages < 60 {
		t.Errorf("pages = %d, want at least 60", pages)
	}
}
