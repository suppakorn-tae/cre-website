package pdf_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/pdf"
)

func fastClient(url string, opts ...pdf.Option) *pdf.Client {
	return pdf.New(url, append([]pdf.Option{pdf.WithRetryDelay(time.Millisecond)}, opts...)...)
}

func TestRenderSendsHTMLAssetsAndLayout(t *testing.T) {
	var gotFiles = map[string]string{}
	var gotFields = map[string]string{}
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse form: %v", err)
		}
		for k, v := range r.MultipartForm.Value {
			gotFields[k] = v[0]
		}
		for _, fh := range r.MultipartForm.File["files"] {
			f, _ := fh.Open()
			b, _ := io.ReadAll(f)
			gotFiles[fh.Filename] = string(b)
		}
		_, _ = w.Write([]byte("%PDF-fake"))
	}))
	defer srv.Close()

	out, err := fastClient(srv.URL+"/").Render(context.Background(),
		[]byte("<html>สวัสดี</html>"),
		map[string][]byte{"style.css": []byte("body{}"), "f.ttf": {1, 2, 3}},
		pdf.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "%PDF-fake" {
		t.Fatalf("unexpected output %q", out)
	}
	if gotPath != "/forms/chromium/convert/html" {
		t.Errorf("path = %q", gotPath)
	}
	if gotFiles["index.html"] != "<html>สวัสดี</html>" || gotFiles["style.css"] != "body{}" || len(gotFiles["f.ttf"]) != 3 {
		t.Errorf("files = %v", gotFiles)
	}
	want := map[string]string{
		"paperWidth":        "8.2677",
		"paperHeight":       "11.6929",
		"marginTop":         "0.5906",
		"printBackground":   "true",
		"landscape":         "false",
		"waitForExpression": "document.fonts.status === 'loaded'",
	}
	for k, v := range want {
		if gotFields[k] != v {
			t.Errorf("field %s = %q, want %q", k, gotFields[k], v)
		}
	}
}

func TestRenderRetriesOnceOn5xx(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			http.Error(w, "boom", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	out, err := fastClient(srv.URL).Render(context.Background(), []byte("<p>x</p>"), nil, pdf.Options{})
	if err != nil || string(out) != "ok" {
		t.Fatalf("out=%q err=%v", out, err)
	}
	if calls.Load() != 2 {
		t.Errorf("calls = %d, want 2", calls.Load())
	}
}

func TestRenderGivesUpAfterOneRetry(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := fastClient(srv.URL).Render(context.Background(), []byte("<p>x</p>"), nil, pdf.Options{})
	if !errors.Is(err, pdf.ErrRender) {
		t.Fatalf("err = %v", err)
	}
	if calls.Load() != 2 {
		t.Errorf("calls = %d, want 2", calls.Load())
	}
}

func TestRenderDoesNotRetry4xx(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		http.Error(w, "bad", http.StatusBadRequest)
	}))
	defer srv.Close()

	_, err := fastClient(srv.URL).Render(context.Background(), []byte("<p>x</p>"), nil, pdf.Options{})
	if !errors.Is(err, pdf.ErrRender) {
		t.Fatalf("err = %v", err)
	}
	if calls.Load() != 1 {
		t.Errorf("calls = %d, want 1", calls.Load())
	}
}

func TestRenderTimesOut(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer srv.Close()

	start := time.Now()
	_, err := fastClient(srv.URL, pdf.WithTimeout(50*time.Millisecond)).
		Render(context.Background(), []byte("<p>x</p>"), nil, pdf.Options{})
	if err == nil {
		t.Fatal("want timeout error")
	}
	if time.Since(start) > time.Second {
		t.Errorf("took %v", time.Since(start))
	}
}

func TestRenderRejectsBadInput(t *testing.T) {
	c := fastClient("http://127.0.0.1:1")
	cases := map[string]struct {
		html   []byte
		assets map[string][]byte
	}{
		"empty html":     {nil, nil},
		"reserved name":  {[]byte("x"), map[string][]byte{"index.html": nil}},
		"path in name":   {[]byte("x"), map[string][]byte{"../a.css": nil}},
		"empty filename": {[]byte("x"), map[string][]byte{"": nil}},
	}
	for name, tc := range cases {
		if _, err := c.Render(context.Background(), tc.html, tc.assets, pdf.Options{}); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
}

func TestReady(t *testing.T) {
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("path = %s", r.URL.Path)
		}
		w.WriteHeader(status)
	}))
	c := fastClient(srv.URL)
	if err := c.Ready(context.Background()); err != nil {
		t.Fatalf("ready: %v", err)
	}
	status = http.StatusServiceUnavailable
	if err := c.Ready(context.Background()); err == nil {
		t.Fatal("want error on 503")
	}
	srv.Close()
	if err := c.Ready(context.Background()); err == nil {
		t.Fatal("want error when unreachable")
	}
}
