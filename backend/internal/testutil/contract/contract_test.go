package contract_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/suppakorn-tae/cre-website/backend/internal/testutil/contract"
)

const fixture = `
openapi: 3.1.0
info: {title: t, version: "1"}
servers: [{url: /api/v1}]
paths:
  /things/{id}:
    get:
      operationId: get-thing
      parameters:
        - {name: id, in: path, required: true, schema: {type: string}}
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [name]
                properties: {name: {type: string}}
        "404":
          description: missing
          content:
            application/json:
              schema:
                type: object
                required: [error]
                properties:
                  error:
                    type: object
                    required: [code, message]
                    properties: {code: {type: string}, message: {type: string}}
`

func spec(t *testing.T) *openapi3.T {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData([]byte(fixture))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func respond(status int, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	rec.Header().Set("Content-Type", "application/json")
	rec.WriteHeader(status)
	_, _ = rec.WriteString(body)
	return rec
}

func TestValidateResponse(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/things/42", nil)
	cases := []struct {
		name    string
		status  int
		body    string
		wantErr bool
	}{
		{"matching 200", 200, `{"name":"a"}`, false},
		{"matching error envelope", 404, `{"error":{"code":"not_found","message":"x"}}`, false},
		{"missing required field", 200, `{}`, true},
		{"error without envelope", 404, `{"message":"nope"}`, true},
		{"undeclared status", 500, `{}`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := contract.Validate(spec(t), req, respond(tc.status, tc.body).Result())
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

func TestValidateUnknownRoute(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/unknown", nil)
	err := contract.Validate(spec(t), req, respond(200, `{}`).Result())
	if err == nil || !strings.Contains(err.Error(), "route") {
		t.Fatalf("want route error, got %v", err)
	}
}
