// Package securitytest holds black-box security tests for the whole api: it
// builds the real router against real Postgres and Valkey and checks object
// level authorisation, CSRF and rate limits for every route of the OpenAPI
// contract.
//
// Every contract route must be listed as covered (full checks) or pending
// (not mounted yet). A route in neither list fails the suite, so new routes
// cannot skip security coverage. A pending route that becomes mounted does
// not fail: it is logged and gets the checks that need no fixtures, until
// its owner moves it to covered with an object path builder.
package securitytest
