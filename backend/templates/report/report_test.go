package report_test

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/templates/report"
)

func sample() report.Data {
	return report.Data{
		ProjectName: "อาคารพักอาศัย", Nickname: "TST1", Island: "koh_tao", Type: "building",
		ValueBaht: 100000000, StartDate: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:     time.Date(2028, 12, 31, 0, 0, 0, 0, time.UTC),
		ProgressPct: 40, VersionNo: 2,
		SubmittedAt:   time.Date(2026, 11, 24, 18, 0, 0, 0, time.UTC), // 01:00 on the 25th in Thailand
		GeneratedAt:   time.Date(2026, 11, 25, 3, 0, 0, 0, time.UTC),
		ScoreDecimals: 2, RMDecimals: 2,
		Indicators: []report.Indicator{
			{
				Code: "EC-HS-2", Name: "ตัวชี้วัดแรก", RL: 3, RIC: 4, RIT: 2, RIE: 3, RIMax: 4, RM: 4, Level: "H",
				Advice: []report.AdviceList{
					{List: "RI_C", Items: []string{"ข้อหนึ่งของต้นทุน"}},
					{List: "RL", Items: []string{"ข้อ ก", "ข้อ ข", "ข้อ ค", "ข้อ ง", "ข้อ จ"}},
				},
				Strategy: "REDUCE",
			},
			{
				Code: "SO-1", Name: "ตัวชี้วัดต่ำ", RL: 1, RIC: 1, RIT: 1, RIE: 1, RIMax: 1, RM: 1, Level: "VL",
				Advice: []report.AdviceList{{List: "RL", Items: []string{"ไม่ควรแสดง"}}},
			},
			{Code: "EV-9", Name: "ตัวชี้วัดสูงมาก", RL: 5, RIC: 5, RIT: 5, RIE: 5, RIMax: 5, RM: 5, Level: "VH"},
		},
	}
}

func TestRenderContent(t *testing.T) {
	html, assets, err := report.Render(sample())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := assets["style.css"]; !ok {
		t.Error("style.css asset missing")
	}
	s := string(html)
	for _, want := range []string{
		"อาคารพักอาศัย", "เกาะเต่า", "100,000,000.00",
		"25 พฤศจิกายน พ.ศ. 2569", // submitted: Thailand date, Buddhist era
		"1 มกราคม พ.ศ. 2570",
		"ตัวชี้วัดแรก", "ข้อหนึ่งของต้นทุน", "ข้อ จ", "ลดความเสี่ยง",
		"ผลลัพธ์เป็นข้อมูลเบื้องต้นสำหรับใช้ประกอบการพิจารณาเท่านั้น",
		"ผู้ประเมิน", "ผู้ตรวจสอบ", "ผู้อนุมัติ",
		"ยังไม่ได้เลือกกลยุทธ์", // the VH indicator has no strategy
		"คำแนะนำเพื่อลดโอกาสเกิดความเสี่ยง", "คำแนะนำเพื่อลดผลกระทบด้านต้นทุน",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %q", want)
		}
	}
	if strings.Contains(s, "ไม่ควรแสดง") {
		t.Error("advice of a low-risk indicator is shown")
	}
	if strings.Index(s, "คำแนะนำเพื่อลดโอกาสเกิดความเสี่ยง") > strings.Index(s, "คำแนะนำเพื่อลดผลกระทบด้านต้นทุน") {
		t.Error("advice lists are not in RL, RI_C order")
	}
	if strings.Contains(s, "2026") || strings.Contains(s, "2027") {
		t.Error("a Common Era year is shown")
	}
}

func TestRenderOtherIslandAndNoHighRisk(t *testing.T) {
	d := sample()
	d.Island, d.IslandOther = "other", "เกาะทดสอบ"
	d.Indicators = d.Indicators[1:2]
	html, _, err := report.Render(d)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"เกาะทดสอบ", "ไม่มีตัวชี้วัดระดับ H หรือ VH"} {
		if !strings.Contains(string(html), want) {
			t.Errorf("html lacks %q", want)
		}
	}
}

func TestRenderUnknownCodeFails(t *testing.T) {
	d := sample()
	d.Island = "atlantis"
	if _, _, err := report.Render(d); err == nil {
		t.Fatal("expected a missing message error")
	}
}

func TestCatalogueHasNoSpecCodes(t *testing.T) {
	re := regexp.MustCompile(`\b(UC|FR|BR|NFR|AD)-\d+`)
	for k, v := range report.Messages() {
		if re.MatchString(v) {
			t.Errorf("message %q contains a spec code: %q", k, v)
		}
	}
}

func TestRenderLevelSummaryChips(t *testing.T) {
	html, _, err := report.Render(sample())
	if err != nil {
		t.Fatal(err)
	}
	s := string(html)
	prev := -1
	for _, l := range []string{"VL", "L", "M", "H", "VH"} {
		chip := `<span class="chip lvl-` + l + `">` + l + ` `
		i := strings.Index(s, chip)
		if i < 0 {
			t.Fatalf("no chip for level %s", l)
		}
		if i < prev {
			t.Errorf("chip %s is out of VL to VH order", l)
		}
		prev = i
	}
	if !strings.Contains(s, `<span class="chip lvl-VH">VH 1</span>`) {
		t.Error("VH chip does not carry its count")
	}
	if !strings.Contains(s, `<span class="chip lvl-VL">VL 1</span>`) {
		t.Error("VL chip does not carry its count")
	}
	if strings.Contains(s, "<td class=\"lvl lvl-VL\">VL</td><td class=\"num\">1</td>") {
		t.Error("the one-row-per-level summary table is still there")
	}
}

func TestRenderUsesSubscriptsNotCodes(t *testing.T) {
	html, _, err := report.Render(sample())
	if err != nil {
		t.Fatal(err)
	}
	s := string(html)
	if strings.Contains(s, "RI_") {
		t.Error("an internal RI_ code is shown")
	}
	for _, want := range []string{"RI<sub>C</sub>", "RI<sub>T</sub>", "RI<sub>E</sub>", "RI<sub>max</sub>"} {
		if !strings.Contains(s, want) {
			t.Errorf("html lacks %q", want)
		}
	}
}

func TestRenderSectionOrderAndNotes(t *testing.T) {
	html, _, err := report.Render(sample())
	if err != nil {
		t.Fatal(err)
	}
	s := string(html)
	order := []string{
		"<h2>1. ข้อมูลโครงการ", "<h2>2. สรุประดับความเสี่ยง", "<h2>3. ผล 3 ตัวชี้วัด",
		"<h2>4. คำแนะนำและกลยุทธ์ (2 ตัวชี้วัด H / VH)", "<h2>5. หมายเหตุ", "<h2>6. การลงนาม",
	}
	prev := -1
	for _, h := range order {
		i := strings.Index(s, h)
		if i < 0 {
			t.Fatalf("html lacks heading %q", h)
		}
		if i < prev {
			t.Errorf("heading %q is out of order", h)
		}
		prev = i
	}
	const disclaimer = "ผลลัพธ์เป็นข้อมูลเบื้องต้นสำหรับใช้ประกอบการพิจารณาเท่านั้น"
	if n := strings.Count(s, disclaimer); n != 1 {
		t.Errorf("disclaimer appears %d times, want once", n)
	}
	if strings.Index(s, disclaimer) > strings.Index(s, "<h2>6. การลงนาม") {
		t.Error("disclaimer is after the signatures")
	}
	if !strings.Contains(s, `<p class="subtitle">TST1 &middot; เกาะเต่า &middot; เวอร์ชัน 2</p>`) {
		t.Error("subtitle under the title is missing")
	}
}
