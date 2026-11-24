// Package pdf renders HTML to PDF through Gotenberg (Chromium route).
//
// Everything the page needs (CSS, Thai fonts, images) is sent as assets in the
// same multipart request, so Gotenberg needs no internet access and no custom
// image.
package pdf

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	convertPath = "/forms/chromium/convert/html"
	healthPath  = "/health"

	// DefaultTimeout bounds one attempt (request plus body read).
	DefaultTimeout = 60 * time.Second
	// retryDelay is the pause before the single retry on a 5xx response.
	retryDelay = 500 * time.Millisecond
	// waitForFonts makes Chromium hold the print until web fonts are loaded.
	waitForFonts = "document.fonts.status === 'loaded'"

	// DefaultMarginMM is applied to any margin left at zero.
	DefaultMarginMM = 15.0
)

// ErrRender is wrapped by every error caused by Gotenberg refusing a request.
var ErrRender = errors.New("pdf: gotenberg render failed")

// Options control the page layout. The page is always A4. Zero margins fall
// back to DefaultMarginMM and background printing is on unless disabled.
type Options struct {
	// Margins in millimetres.
	MarginTopMM, MarginRightMM, MarginBottomMM, MarginLeftMM float64
	// NoPrintBackground turns background printing off.
	NoPrintBackground bool
	// Landscape prints in landscape orientation.
	Landscape bool
}

// Client talks to one Gotenberg instance.
type Client struct {
	baseURL string
	http    *http.Client
	timeout time.Duration
	delay   time.Duration
}

// Option customises a Client.
type Option func(*Client)

// WithHTTPClient replaces the HTTP client.
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.http = h } }

// WithTimeout sets the per-attempt timeout.
func WithTimeout(d time.Duration) Option { return func(c *Client) { c.timeout = d } }

// WithRetryDelay sets the pause before the retry on a 5xx response.
func WithRetryDelay(d time.Duration) Option { return func(c *Client) { c.delay = d } }

// New returns a Client for the Gotenberg instance at baseURL
// (for example http://gotenberg:3000).
func New(baseURL string, opts ...Option) *Client {
	c := &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{},
		timeout: DefaultTimeout,
		delay:   retryDelay,
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// Render converts html (served as index.html) plus its assets into a PDF.
// Asset keys are file names referenced relatively from the HTML, for example
// "style.css" or "Sarabun-Regular.ttf". A 5xx response or a network error is
// retried once; a 4xx response is not.
func (c *Client) Render(ctx context.Context, html []byte, assets map[string][]byte, opts Options) ([]byte, error) {
	body, contentType, err := buildForm(html, assets, opts)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(c.delay):
			}
		}
		out, status, err := c.post(ctx, body, contentType)
		if err == nil {
			return out, nil
		}
		lastErr = err
		if status >= 400 && status < 500 {
			return nil, err // retrying cannot help
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}

// post performs one attempt. status is 0 when no response was received.
func (c *Client) post(ctx context.Context, body []byte, contentType string) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+convertPath, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("pdf: build request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("pdf: post to gotenberg: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("pdf: read gotenberg response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		msg := strings.TrimSpace(string(data))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return nil, resp.StatusCode, fmt.Errorf("%w: status %d: %s", ErrRender, resp.StatusCode, msg)
	}
	return data, resp.StatusCode, nil
}

// Ready reports whether Gotenberg is up and healthy. The worker's /readyz
// handler calls it.
func (c *Client) Ready(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+healthPath, nil)
	if err != nil {
		return fmt.Errorf("pdf: build health request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("pdf: gotenberg not reachable: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pdf: gotenberg not ready: status %d", resp.StatusCode)
	}
	return nil
}

func buildForm(html []byte, assets map[string][]byte, opts Options) ([]byte, string, error) {
	if len(html) == 0 {
		return nil, "", errors.New("pdf: html is empty")
	}
	if _, clash := assets["index.html"]; clash {
		return nil, "", errors.New("pdf: asset name index.html is reserved")
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	if err := writeFile(w, "index.html", "text/html; charset=utf-8", html); err != nil {
		return nil, "", err
	}
	names := make([]string, 0, len(assets))
	for name := range assets {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if name == "" || strings.ContainsAny(name, "/\\\"\r\n") {
			return nil, "", fmt.Errorf("pdf: invalid asset name %q", name)
		}
		if err := writeFile(w, name, "application/octet-stream", assets[name]); err != nil {
			return nil, "", err
		}
	}

	margin := func(v float64) string {
		if v <= 0 {
			v = DefaultMarginMM
		}
		return mmToInches(v)
	}
	fields := [][2]string{
		{"paperWidth", mmToInches(210)}, // A4
		{"paperHeight", mmToInches(297)},
		{"marginTop", margin(opts.MarginTopMM)},
		{"marginRight", margin(opts.MarginRightMM)},
		{"marginBottom", margin(opts.MarginBottomMM)},
		{"marginLeft", margin(opts.MarginLeftMM)},
		{"printBackground", strconv.FormatBool(!opts.NoPrintBackground)},
		{"landscape", strconv.FormatBool(opts.Landscape)},
		{"waitForExpression", waitForFonts},
	}
	for _, f := range fields {
		if err := w.WriteField(f[0], f[1]); err != nil {
			return nil, "", fmt.Errorf("pdf: write field %s: %w", f[0], err)
		}
	}
	if err := w.Close(); err != nil {
		return nil, "", fmt.Errorf("pdf: close form: %w", err)
	}
	return buf.Bytes(), w.FormDataContentType(), nil
}

func writeFile(w *multipart.Writer, name, contentType string, data []byte) error {
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="files"; filename="%s"`, name))
	h.Set("Content-Type", contentType)
	part, err := w.CreatePart(h)
	if err != nil {
		return fmt.Errorf("pdf: create part %s: %w", name, err)
	}
	if _, err := part.Write(data); err != nil {
		return fmt.Errorf("pdf: write part %s: %w", name, err)
	}
	return nil
}

func mmToInches(mm float64) string {
	return strconv.FormatFloat(mm/25.4, 'f', 4, 64)
}
