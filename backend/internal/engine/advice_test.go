package engine

import (
	"reflect"
	"testing"
)

func TestSelectAdvice(t *testing.T) {
	tests := []struct {
		name  string
		level string
		rl    float64
		ric   float64
		rit   float64
		rie   float64
		want  []AdviceList
	}{
		{"VL level has no advice", "VL", 5, 5, 5, 5, nil},
		{"L level has no advice", "L", 5, 1, 1, 1, nil},
		{"M level has no advice", "M", 3.4, 3, 2, 1, nil},
		{"unknown level has no advice", "", 5, 1, 1, 1, nil},
		{"RL wins when greater than all impacts", "H", 4, 3, 2, 1, []AdviceList{AdviceListRL}},
		{"RL wins on equality with RI_max", "VH", 4.5, 4.5, 4.5, 4.5, []AdviceList{AdviceListRL}},
		{"single impact RI_C", "H", 2, 4, 3, 1, []AdviceList{AdviceListRIC}},
		{"single impact RI_T", "H", 2, 3, 4, 1, []AdviceList{AdviceListRIT}},
		{"single impact RI_E", "VH", 2, 3, 1, 5, []AdviceList{AdviceListRIE}},
		{"tie RI_C and RI_T", "H", 2, 4, 4, 1, []AdviceList{AdviceListRIC, AdviceListRIT}},
		{"tie RI_C and RI_E", "H", 2, 4, 1, 4, []AdviceList{AdviceListRIC, AdviceListRIE}},
		{"tie RI_T and RI_E", "H", 2, 1, 4, 4, []AdviceList{AdviceListRIT, AdviceListRIE}},
		{"three-way tie keeps C, T, E order", "VH", 3, 5, 5, 5, []AdviceList{AdviceListRIC, AdviceListRIT, AdviceListRIE}},
		// The caller passes rounded scores: 3.84 and 3.76 both round to 3.8,
		// so the tie exists only because of rounding.
		{"tie that exists only because of rounding", "H", 3, 3.8, 3.8, 3.5, []AdviceList{AdviceListRIC, AdviceListRIT}},
		{"RL ties RI_max after rounding", "H", 3.8, 3.8, 3.5, 3.5, []AdviceList{AdviceListRL}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := SelectAdvice(tc.level, tc.rl, tc.ric, tc.rit, tc.rie)
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("SelectAdvice() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAdviceListValuesMatchEnum(t *testing.T) {
	want := map[AdviceList]string{
		AdviceListRL: "RL", AdviceListRIC: "RI_C", AdviceListRIT: "RI_T", AdviceListRIE: "RI_E",
	}
	for k, v := range want {
		if string(k) != v {
			t.Errorf("%q != %q", k, v)
		}
	}
}
