package pdf_test

import (
	"bytes"
	"context"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/webassembly"
	"github.com/moby/moby/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	adapter "github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
	"github.com/suppakorn-tae/cre-website/backend/templates/fonts"
)

const thaiSample = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<link rel="stylesheet" href="style.css"></head>
<body>
<h1>รายงานความเสี่ยง</h1>
<p>ผู้ที่ทำงานก่อสร้างต้องได้รับการอบรมความปลอดภัย</p>
<p>งบประมาณ ฿1,250,000</p>
<p>วันที่ 24 พฤศจิกายน พ.ศ. 2569</p>
</body></html>`

const sampleCSS = `
@font-face { font-family: "Sarabun"; font-weight: 400; src: url("Sarabun-Regular.ttf"); }
@font-face { font-family: "Sarabun"; font-weight: 700; src: url("Sarabun-Bold.ttf"); }
body { font-family: "Sarabun", sans-serif; font-size: 14pt; }
h1 { font-weight: 700; }
`

func startGotenberg(t *testing.T) string {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "gotenberg/gotenberg:8",
			ExposedPorts: []string{"3000/tcp"},
			// No usable DNS: any attempt to fetch from the internet fails, so
			// the render only succeeds if every asset is in the request.
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
	return url
}

func extractText(t *testing.T, data []byte) string {
	t.Helper()
	pool, err := webassembly.Init(webassembly.Config{MinIdle: 1, MaxIdle: 1, MaxTotal: 1})
	if err != nil {
		t.Fatalf("init pdfium: %v", err)
	}
	defer func() { _ = pool.Close() }()
	instance, err := pool.GetInstance(time.Minute)
	if err != nil {
		t.Fatalf("pdfium instance: %v", err)
	}
	doc, err := instance.OpenDocument(&requests.OpenDocument{File: &data})
	if err != nil {
		t.Fatalf("open pdf: %v", err)
	}
	defer func() { _, _ = instance.FPDF_CloseDocument(&requests.FPDF_CloseDocument{Document: doc.Document}) }()

	res, err := instance.GetPageText(&requests.GetPageText{
		Page: requests.Page{ByIndex: &requests.PageByIndex{Document: doc.Document, Index: 0}},
	})
	if err != nil {
		t.Fatalf("extract text: %v", err)
	}
	return res.Text
}

func TestGotenbergRendersThai(t *testing.T) {
	url := startGotenberg(t)
	c := adapter.New(url)

	if err := c.Ready(context.Background()); err != nil {
		t.Fatalf("ready: %v", err)
	}

	assets := fonts.Files()
	assets["style.css"] = []byte(sampleCSS)

	out, err := c.Render(context.Background(), []byte(thaiSample), assets, adapter.Options{})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF-")) {
		t.Fatalf("not a pdf: %q", out[:min(8, len(out))])
	}
	if !bytes.Contains(out, []byte("Sarabun")) {
		t.Error("Sarabun font is not embedded in the PDF")
	}

	// pdfium repeats some stacked Thai clusters when it extracts text, so
	// assert on phrases that come out clean plus the presence of tone marks,
	// not on the whole document. poppler's pdftotext returns the exact text.
	text := strings.Join(strings.Fields(extractText(t, out)), "")
	for _, want := range []string{
		"รายงานความเสี่ย",
		"ความปลอดภัย",
		"฿1,250,000",
		"วันที่24พฤศจิกายนพ.ศ.2569",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("extracted text lacks %q; got %q", want, text)
		}
	}
	for _, mark := range []rune{'\u0e48', '\u0e49'} { // mai ek, mai tho
		if !strings.ContainsRune(text, mark) {
			t.Errorf("extracted text lacks tone mark %U", mark)
		}
	}
}
