// Package contract checks handler responses against the OpenAPI spec.
package contract

import (
	"bytes"
	"fmt"
	"io"
	"net/http"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/gorillamux"
)

// Validate reports whether resp is a response the spec declares for req:
// status, headers and JSON body. The request path includes the server prefix
// (for example /api/v1/projects).
func Validate(spec *openapi3.T, req *http.Request, resp *http.Response) error {
	router, err := gorillamux.NewRouter(spec)
	if err != nil {
		return fmt.Errorf("build router: %w", err)
	}
	route, params, err := router.FindRoute(req)
	if err != nil {
		return fmt.Errorf("find route: %w", err)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))

	return openapi3filter.ValidateResponse(req.Context(), &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{
			Request:    req,
			PathParams: params,
			Route:      route,
		},
		Status:  resp.StatusCode,
		Header:  resp.Header,
		Body:    io.NopCloser(bytes.NewReader(body)),
		Options: &openapi3filter.Options{IncludeResponseStatus: true},
	})
}
