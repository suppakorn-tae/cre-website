// Package migrations embeds the versioned SQL files for cmd/migrate.
package migrations

import "embed"

// FS holds every *.sql migration in this directory.
//
//go:embed *.sql
var FS embed.FS
