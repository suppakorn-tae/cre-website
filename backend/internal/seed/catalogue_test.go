package seed

import (
	"strings"
	"testing"
)

func TestLoadEmbedded(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Dimensions) != 3 || len(c.Factors) != 11 || len(c.Indicators) != 55 || len(c.RIEOptions) != 9 {
		t.Fatalf("counts: %d dimensions, %d factors, %d indicators, %d ri_e options",
			len(c.Dimensions), len(c.Factors), len(c.Indicators), len(c.RIEOptions))
	}
	for _, i := range c.Indicators {
		for _, l := range AdviceLists {
			if n := len(i.Advice[l]); n < 1 || n > 5 {
				t.Errorf("%s %s: %d advice items", i.Code, l, n)
			}
		}
	}
}

func TestMissingThresholdsStayNil(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	// a, b missing (c-e only) or d, e missing (a-c only).
	wantNoAB := map[string]bool{"EC-HS-1": true, "EC-HS-3": true, "SO-PL-1": true, "EV-EV-2": true, "EV-EV-3": true}
	wantNoDE := map[string]bool{"EC-HS-2": true, "EC-HS-5": true}
	for _, i := range c.Indicators {
		switch {
		case wantNoAB[i.Code]:
			if i.A != nil || i.B != nil || i.C == nil || i.D == nil || i.E == nil {
				t.Errorf("%s: want a, b nil and c-e set", i.Code)
			}
		case wantNoDE[i.Code]:
			if i.A == nil || i.B == nil || i.C == nil || i.D != nil || i.E != nil {
				t.Errorf("%s: want d, e nil and a-c set", i.Code)
			}
		default:
			if i.A == nil || i.B == nil || i.C == nil || i.D == nil || i.E == nil {
				t.Errorf("%s: want all thresholds set", i.Code)
			}
		}
	}
}

func TestDirection(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	inverse := 0
	for _, i := range c.Indicators {
		d, err := i.Direction()
		if err != nil {
			t.Fatal(err)
		}
		if d == "inverse" {
			inverse++
		}
	}
	if inverse != 4 {
		t.Errorf("inverse indicators = %d, want 4", inverse)
	}
}

func TestParseRejects(t *testing.T) {
	cases := map[string]string{
		"unknown field":  `{"nope":1}`,
		"not json":       `[`,
		"unknown factor": `{"indicators":[{"group_id":"X-1","factor_code":"NO","a":1,"b":2,"c":3,"d":4,"e":5,"advice":{}}]}`,
		"empty advice":   `{"factors":[{"code":"F","dimension_code":"D"}],"dimensions":[{"code":"D"}],"indicators":[{"group_id":"X-1","factor_code":"F","a":1,"b":2,"c":3,"d":4,"e":5,"advice":{"RL":[],"RI_C":["x"],"RI_T":["x"],"RI_E":["x"]}}]}`,
		"non monotonic":  `{"factors":[{"code":"F","dimension_code":"D"}],"dimensions":[{"code":"D"}],"indicators":[{"group_id":"X-1","factor_code":"F","a":1,"b":3,"c":2,"d":4,"e":5,"advice":{"RL":["x"],"RI_C":["x"],"RI_T":["x"],"RI_E":["x"]}}]}`,
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Parse([]byte(in)); err == nil {
				t.Fatal("want error")
			} else if strings.TrimSpace(err.Error()) == "" {
				t.Fatal("empty error")
			}
		})
	}
}
