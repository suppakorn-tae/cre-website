package assessments_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/suppakorn-tae/cre-website/backend/internal/http/handler/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/http/middleware"
	svc "github.com/suppakorn-tae/cre-website/backend/internal/service/assessments"
	"github.com/suppakorn-tae/cre-website/backend/internal/service/session"
	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

var (
	ansProject = uuid.MustParse("22222222-2222-4222-8222-222222222222")
	oldVer     = uuid.MustParse("33333333-3333-4333-8333-333333333331")
	newVer     = uuid.MustParse("33333333-3333-4333-8333-333333333332")
)

// answerFake knows two versions of one ansProject: oldVer is read-only, newVer is
// editable. It runs the real validation, so the 422 shape is the real one.
type answerFake struct{ saved []svc.AnswerInput }

func (f *answerFake) check(o, p, v uuid.UUID) (bool, error) {
	if o != owner || p != ansProject || (v != oldVer && v != newVer) {
		return false, svc.ErrAnswerVersionNotFound
	}
	return v == newVer, nil
}

func (f *answerFake) List(_ context.Context, o, p, v uuid.UUID) (svc.AnswerList, error) {
	ed, err := f.check(o, p, v)
	return svc.AnswerList{VersionID: v, Editable: ed, Items: f.items()}, err
}

func (f *answerFake) Upsert(_ context.Context, o, p, v uuid.UUID, in []svc.AnswerInput, prefix func(int) string) (svc.AnswerList, error) {
	ed, err := f.check(o, p, v)
	if err != nil {
		return svc.AnswerList{}, err
	}
	if !ed {
		return svc.AnswerList{}, svc.ErrAnswerNotEditable
	}
	if fields := svc.ValidateAnswers(in, prefix); len(fields) > 0 {
		return svc.AnswerList{}, &svc.AnswerValidationError{Fields: fields}
	}
	f.saved = in
	return svc.AnswerList{VersionID: v, Editable: true, Items: f.items()}, nil
}

func (f *answerFake) items() []svc.Answer {
	out := make([]svc.Answer, len(f.saved))
	for i, a := range f.saved {
		out[i] = svc.Answer{
			AnswerInput: a, UpdatedAt: time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC),
			Complete: a.X != nil && a.Y1 != nil && a.Y2 != nil && len(a.Y3) > 0,
		}
	}
	return out
}

// answersSpec loads the root contract with the answers paths added, the way
// contracts/bundle.mjs does, without needing node.
func answersSpec(t *testing.T) *openapi3.T {
	t.Helper()
	root, err := filepath.Abs("../../../../../contracts/openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(root)
	if err != nil {
		t.Fatal(err)
	}
	const base = "/projects/{project_id}/versions/{version_id}/answers"
	esc := func(p string) string { return strings.NewReplacer("/", "~1").Replace(p) }
	paths := "paths:\n"
	for _, p := range []string{base, base + "/{indicator_code}"} {
		paths += "  " + p + ":\n    $ref: paths/assessments.yaml#/" + esc(p) + "\n"
	}
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	spec, err := loader.LoadFromDataWithPath([]byte(strings.Replace(string(data), "paths: {}", paths, 1)), &url.URL{Path: filepath.ToSlash(root)})
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return spec
}

// call sends a request as owner, checks the response against the contract
// and returns it with its body.
func callAnswers(t *testing.T, f *answerFake, method, path, body string) (int, string) {
	t.Helper()
	ss, err := session.New(session.Config{Secret: []byte(strings.Repeat("k", 32))}, accounts{}, noCache{})
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1", func(r chi.Router) { assessments.MountAnswers(r, f, middleware.Session(ss)) })
	req := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	token, _ := ss.Issue(owner.String(), 1, false)
	req.AddCookie(&http.Cookie{Name: session.CookieName, Value: token})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	if err := contract.Validate(answersSpec(t), req, resp); err != nil {
		t.Fatalf("response does not match the OpenAPI contract: %v", err)
	}
	return resp.StatusCode, rec.Body.String()
}

func answersPath(v uuid.UUID, tail string) string {
	return "/projects/" + ansProject.String() + "/versions/" + v.String() + "/answers" + tail
}

func TestPatchSavesAndEchoesAsEntered(t *testing.T) {
	f := &answerFake{}
	code, body := callAnswers(t, f, http.MethodPatch, answersPath(newVer, ""), `{"answers":[
		{"indicator_code":"EC-HS-2","x":0.1,"y1":{"value":12.5,"unit":"percent"},"y2":{"value":30,"unit":"day"},"y3":["B","C"]},
		{"indicator_code":"EC-HS-3"}]}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, body %s", code, body)
	}
	if *f.saved[0].X != 0.1 {
		t.Fatalf("x widened badly: %v", *f.saved[0].X)
	}
	var out struct{ Items []map[string]any }
	_ = json.Unmarshal([]byte(body), &out)
	if len(out.Items) != 2 || out.Items[0]["complete"] != true || out.Items[1]["complete"] != false || out.Items[0]["x"] != 0.1 {
		t.Fatalf("body = %s", body)
	}
}

func TestInvalidAnswersGet422WithFieldErrors(t *testing.T) {
	cases := map[string]string{
		"/answers/0/x":              `{"indicator_code":"EC-HS-2","x":-1}`,
		"/answers/0/y1/value":       `{"indicator_code":"EC-HS-2","y1":{"value":101,"unit":"percent"}}`,
		"/answers/0/y2/value":       `{"indicator_code":"EC-HS-2","y2":{"value":100.5,"unit":"percent"}}`,
		"/answers/0/y3":             `{"indicator_code":"EC-HS-2","y3":["A","B"]}`,
		"/answers/0/y1/unit":        `{"indicator_code":"EC-HS-2","y1":{"value":1,"unit":"day"}}`,
		"/answers/0/indicator_code": `{"indicator_code":"bad"}`,
	}
	for field, answer := range cases {
		code, body := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(newVer, ""), `{"answers":[`+answer+`]}`)
		if code != http.StatusUnprocessableEntity || !strings.Contains(body, `"field":"`+field+`"`) {
			t.Errorf("%s: status %d body %s", field, code, body)
		}
	}
}

func TestPutValidatesAndMatchesPath(t *testing.T) {
	code, body := callAnswers(t, &answerFake{}, http.MethodPut, answersPath(newVer, "/EC-HS-2"), `{"indicator_code":"EC-HS-2","x":-3}`)
	if code != 422 || !strings.Contains(body, `"field":"/x"`) {
		t.Fatalf("status %d body %s", code, body)
	}
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPut, answersPath(newVer, "/EC-HS-2"), `{"indicator_code":"EC-HS-3"}`); code != 422 {
		t.Fatalf("mismatch status = %d", code)
	}
	if code, body := callAnswers(t, &answerFake{}, http.MethodPut, answersPath(newVer, "/EC-HS-2"), `{"indicator_code":"EC-HS-2","x":5}`); code != 200 || !strings.Contains(body, `"x":5`) {
		t.Fatalf("status %d body %s", code, body)
	}
}

func TestOlderVersionIs409AndForeignIs404(t *testing.T) {
	one := `{"answers":[{"indicator_code":"EC-HS-2"}]}`
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(oldVer, ""), one); code != http.StatusConflict {
		t.Fatalf("older: status = %d", code)
	}
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(uuid.New(), ""), one); code != http.StatusNotFound {
		t.Fatalf("unknown: status = %d", code)
	}
	if code, _ := callAnswers(t, &answerFake{}, http.MethodGet, "/projects/"+uuid.NewString()+"/versions/"+newVer.String()+"/answers", ""); code != http.StatusNotFound {
		t.Fatalf("foreign ansProject: status = %d", code)
	}
}

func TestMalformedAndOversizedBodies(t *testing.T) {
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(newVer, ""), `{"answers":`); code != http.StatusBadRequest {
		t.Fatalf("malformed: status = %d", code)
	}
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(newVer, ""), `{"answers":[]}`); code != http.StatusUnprocessableEntity {
		t.Fatalf("empty batch: status = %d", code)
	}
	items := strings.TrimSuffix(strings.Repeat(`{"indicator_code":"EC-HS-2"},`, 56), ",")
	if code, _ := callAnswers(t, &answerFake{}, http.MethodPatch, answersPath(newVer, ""), `{"answers":[`+items+`]}`); code != http.StatusUnprocessableEntity {
		t.Fatalf("56 answers: status = %d", code)
	}
}

func TestListAnswers(t *testing.T) {
	f := &answerFake{saved: []svc.AnswerInput{{IndicatorCode: "EC-HS-2", X: new(float64)}}}
	for v, want := range map[uuid.UUID]string{newVer: `"editable":true`, oldVer: `"editable":false`} {
		code, body := callAnswers(t, f, http.MethodGet, answersPath(v, ""), "")
		if code != 200 || !strings.Contains(body, want) {
			t.Fatalf("status %d body %s", code, body)
		}
	}
}
