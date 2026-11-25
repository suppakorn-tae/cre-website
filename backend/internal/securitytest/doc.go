// Package securitytest holds black-box security tests for the whole api: it
// builds the real router against real Postgres and Valkey and checks object
// level authorisation, CSRF and rate limits for every route of the OpenAPI
// contract. See coverage_test.go for how new routes are forced into the suite.
package securitytest
