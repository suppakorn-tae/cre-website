package engine

import (
	"math"
	"testing"
)

func TestRoundHalfAway(t *testing.T) {
	tests := []struct {
		name string
		in   float64
		dec  int
		want float64
	}{
		{"2.675 is a float artefact, not below the tie", 2.675, 2, 2.68},
		{"1.005", 1.005, 2, 1.01},
		{"negative ties go away from zero", -2.675, 2, -2.68},
		{"2.5 to integer", 2.5, 0, 3},
		{"1.4999 to integer", 1.4999, 0, 1},
		{"already short", 3.5, 3, 3.5},
		{"third decimal", 2.0005, 3, 2.001},
		{"zero", 0, 2, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := roundHalfAway(tc.in, tc.dec); got != tc.want {
				t.Fatalf("roundHalfAway(%v,%d) = %v, want %v", tc.in, tc.dec, got, tc.want)
			}
		})
	}
}

func TestClassifyRM_Boundaries(t *testing.T) {
	tests := []struct {
		rm   float64
		want RiskLevel
	}{
		{1, LevelVL},
		{1.499, LevelVL},
		{1.5, LevelL},
		{2.499, LevelL},
		{2.5, LevelM},
		{3.499, LevelM},
		{3.5, LevelH},
		{4.499, LevelH},
		{4.5, LevelVH},
		{5, LevelVH},
	}
	for _, tc := range tests {
		if got := classifyRM(tc.rm); got != tc.want {
			t.Errorf("classifyRM(%v) = %s, want %s", tc.rm, got, tc.want)
		}
	}
}

func TestComputeRM_Defaults(t *testing.T) {
	tests := []struct {
		name      string
		rl, c     float64
		it, e     float64
		wantRIMax float64
		wantRM    float64
		wantLevel RiskLevel
	}{
		{"all ones", 1, 1, 1, 1, 1, 1, LevelVL},
		{"all fives", 5, 5, 5, 5, 5, 5, LevelVH},
		{"ri max is the largest impact", 2, 1, 3, 2, 3, math.Sqrt(6), LevelL},
		// 1.5 x 1.5 = 2.25, RM = 1.5 exactly: a border goes to the higher level.
		{"rm exactly 1.5", 1.5, 1.5, 1, 1, 1.5, 1.5, LevelL},
		{"rm exactly 2.5", 2.5, 2.5, 1, 1, 2.5, 2.5, LevelM},
		{"rm exactly 3.5", 3.5, 1, 3.5, 1, 3.5, 3.5, LevelH},
		{"rm exactly 4.5", 4.5, 1, 1, 4.5, 4.5, 4.5, LevelVH},
		// 2.675 rounds to 2.68 (not 2.67).
		{"score rounding half away", 2.675, 1, 1, 1, 1, math.Sqrt(2.68), LevelL},
		{"rm just below 2.5 stays L", 2.44, 2.44, 1, 1, 2.44, 2.44, LevelL},
		// RM = 1.4996 rounds to 1.500 and is classified as L.
		{"rounded rm crosses border", 1.4996, 1.4996, 1, 1, 1.5, 1.5, LevelL},
		{"rm 2.4996 rounds up to M", 2.4996, 2.4996, 1, 1, 2.5, 2.5, LevelM},
		{"rm 3.4996 rounds up to H", 3.4996, 3.4996, 1, 1, 3.5, 3.5, LevelH},
		{"rm 4.4996 rounds up to VH", 4.4996, 4.4996, 1, 1, 4.5, 4.5, LevelVH},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ComputeRM(tc.rl, tc.c, tc.it, tc.e, DefaultScoreDecimals, DefaultRMDecimals)
			if err != nil {
				t.Fatal(err)
			}
			if got.RIMax != roundHalfAway(tc.wantRIMax, 2) {
				t.Errorf("RIMax = %v, want %v", got.RIMax, tc.wantRIMax)
			}
			if want := roundHalfAway(tc.wantRM, 3); got.RM != want {
				t.Errorf("RM = %v, want %v", got.RM, want)
			}
			if got.Level != tc.wantLevel {
				t.Errorf("Level = %s, want %s", got.Level, tc.wantLevel)
			}
		})
	}
}

func TestComputeRM_RoundedScoresReturned(t *testing.T) {
	got, err := ComputeRM(2.675, 3.014, 1.995, 2.0049, 2, 3)
	if err != nil {
		t.Fatal(err)
	}
	if got.RL != 2.68 || got.RIC != 3.01 || got.RIT != 2 || got.RIE != 2 {
		t.Fatalf("rounded scores = %+v", got)
	}
	if got.RIMax != 3.01 {
		t.Fatalf("RIMax = %v", got.RIMax)
	}
}

func TestComputeRM_NonDefaultDecimals(t *testing.T) {
	// scoreDecimals 0: 1.5 -> 2, 1.49 -> 1.
	got, err := ComputeRM(1.5, 1.49, 1, 1, 0, 3)
	if err != nil {
		t.Fatal(err)
	}
	if got.RL != 2 || got.RIMax != 1 {
		t.Fatalf("got %+v", got)
	}
	// rmDecimals 0: RM 2.4 -> 2 -> L; RM 2.5 -> 3 -> M.
	got, err = ComputeRM(2.4, 2.4, 1, 1, 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.RM != 2 || got.Level != LevelL {
		t.Fatalf("got %+v", got)
	}
	got, err = ComputeRM(2.5, 2.5, 1, 1, 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.RM != 3 || got.Level != LevelM {
		t.Fatalf("got %+v", got)
	}
	// rmDecimals 1: RM 1.46 -> 1.5 -> L; 1.44 -> 1.4 -> VL.
	got, _ = ComputeRM(1.46, 1.46, 1, 1, 2, 1)
	if got.RM != 1.5 || got.Level != LevelL {
		t.Fatalf("got %+v", got)
	}
	got, _ = ComputeRM(1.44, 1.44, 1, 1, 2, 1)
	if got.RM != 1.4 || got.Level != LevelVL {
		t.Fatalf("got %+v", got)
	}
	// rmDecimals 5 keeps RM just below the border in the lower level.
	got, _ = ComputeRM(1.4999, 1.4999, 1, 1, 4, 5)
	if got.Level != LevelVL {
		t.Fatalf("got %+v", got)
	}
}

// The DB check: VL if rm < 1.5, L < 2.5, M < 3.5, H < 4.5, else VH.
func TestComputeRM_AgreesWithDBCheck(t *testing.T) {
	dbLevel := func(rm float64) RiskLevel {
		switch {
		case rm < 1.5:
			return LevelVL
		case rm < 2.5:
			return LevelL
		case rm < 3.5:
			return LevelM
		case rm < 4.5:
			return LevelH
		}
		return LevelVH
	}
	for _, p := range []int{0, 1, 2, 3, 4} {
		for rl := 1.0; rl <= 5; rl += 0.25 {
			for ri := 1.0; ri <= 5; ri += 0.25 {
				got, err := ComputeRM(rl, ri, 1, 1, 2, p)
				if err != nil {
					t.Fatal(err)
				}
				if got.Level != dbLevel(got.RM) {
					t.Fatalf("rl=%v ri=%v p=%d: level %s, db check says %s (rm %v)", rl, ri, p, got.Level, dbLevel(got.RM), got.RM)
				}
			}
		}
	}
}

func TestComputeRM_Errors(t *testing.T) {
	bad := []struct {
		name   string
		rl, c  float64
		it, e  float64
		sd, rd int
	}{
		{"rl below 1", 0.99, 1, 1, 1, 2, 3},
		{"rl above 5", 5.01, 1, 1, 1, 2, 3},
		{"ric below 1", 1, 0, 1, 1, 2, 3},
		{"rit above 5", 1, 1, 6, 1, 2, 3},
		{"rie NaN", 1, 1, 1, math.NaN(), 2, 3},
		{"rl Inf", math.Inf(1), 1, 1, 1, 2, 3},
		{"negative score decimals", 1, 1, 1, 1, -1, 3},
		{"negative rm decimals", 1, 1, 1, 1, 2, -1},
		{"too many decimals", 1, 1, 1, 1, 2, 16},
	}
	for _, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ComputeRM(tc.rl, tc.c, tc.it, tc.e, tc.sd, tc.rd); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestComputeRM_ScoreRoundsIntoRange(t *testing.T) {
	got, err := ComputeRM(5.004, 1, 1, 1, 2, 3)
	if err != nil {
		t.Fatal(err)
	}
	if got.RL != 5 {
		t.Fatalf("RL = %v", got.RL)
	}
}
