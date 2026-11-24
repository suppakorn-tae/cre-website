// Package fonts embeds the Thai fonts that are sent to Gotenberg with every
// render request. Gotenberg runs without internet access, so the fonts must
// travel with the request. All fonts are licensed under the SIL OFL 1.1; see
// OFL.txt.
package fonts

import "embed"

//go:embed *.ttf
var files embed.FS

// Files returns the embedded font files keyed by file name.
func Files() map[string][]byte {
	entries, err := files.ReadDir(".")
	if err != nil {
		panic(err) // embed guarantees the root exists
	}
	out := make(map[string][]byte, len(entries))
	for _, e := range entries {
		b, err := files.ReadFile(e.Name())
		if err != nil {
			panic(err)
		}
		out[e.Name()] = b
	}
	return out
}
