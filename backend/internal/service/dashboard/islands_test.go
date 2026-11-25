package dashboard

import (
	"encoding/json"
	"os"
	"testing"
)

// The island Thai names live in the web catalogue; the search copy must not
// drift from it.
func TestIslandNamesMatchTheWebCatalogue(t *testing.T) {
	data, err := os.ReadFile("../../../../web/messages/th/projects.json")
	if err != nil {
		t.Fatal(err)
	}
	var cat struct {
		Islands map[string]string `json:"islands"`
	}
	if err := json.Unmarshal(data, &cat); err != nil {
		t.Fatal(err)
	}
	if len(cat.Islands) != len(islandNameTH) {
		t.Fatalf("catalogue has %d islands, search has %d", len(cat.Islands), len(islandNameTH))
	}
	for code, name := range cat.Islands {
		if islandNameTH[code] != name {
			t.Errorf("island %q: search has %q, catalogue %q", code, islandNameTH[code], name)
		}
	}
}

func TestIslandCodesForSearch(t *testing.T) {
	for q, want := range map[string]int{"สมุย": 1, "เกาะ": 7, "เกาะ ": 7, "ภูเก็ต": 0, "": 0} {
		if got := islandCodesByName(q); len(got) != want {
			t.Errorf("islandCodesByName(%q) = %v, want %d codes", q, got, want)
		}
	}
}
