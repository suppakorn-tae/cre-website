package main

import (
	"context"
	"testing"
)

func TestSeedCatalogue(t *testing.T) {
	url, conn := startPostgres(t)
	ctx := context.Background()
	if err := runAndSeed([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}

	want := map[string]int{
		`SELECT count(*) FROM indicator`:                                    55,
		`SELECT count(*) FROM indicator_text WHERE locale = 'th'`:           55,
		`SELECT count(*) FROM impact_table`:                                 2,
		`SELECT count(*) FROM dimension`:                                    3,
		`SELECT count(*) FROM factor`:                                       11,
		`SELECT count(*) FROM ri_e_option`:                                  9,
		`SELECT count(*) FROM ri_e_option WHERE is_exclusive`:               1,
		`SELECT count(*) FROM advice_item`:                                  55 * 4 * 3,
		`SELECT count(*) FROM advice_item_text WHERE locale = 'th'`:         55 * 4 * 3,
		`SELECT count(*) FROM advice_item WHERE updated_by IS NOT NULL`:     0,
		`SELECT count(*) FROM indicator WHERE updated_by IS NOT NULL`:       0,
		`SELECT count(*) FROM impact_table WHERE updated_by IS NOT NULL`:    0,
		`SELECT count(*) FROM locale WHERE code = 'th' AND is_default`:      1,
		`SELECT count(*) FROM indicator WHERE direction = 'inverse'`:        4,
		`SELECT count(*) FROM indicator WHERE num_nulls(a, b, c, d, e) > 0`: 7,
	}
	for q, n := range want {
		if got := count(t, conn, q); got != n {
			t.Errorf("%s = %d, want %d", q, got, n)
		}
	}

	// Every advice list has 1-5 items.
	if n := count(t, conn, `SELECT count(*) FROM (
		SELECT indicator_code, list FROM advice_item GROUP BY 1, 2
		HAVING count(*) NOT BETWEEN 1 AND 5) x`); n != 0 {
		t.Errorf("%d advice lists outside 1-5 items", n)
	}
	if n := count(t, conn, `SELECT count(*) FROM (SELECT DISTINCT indicator_code, list FROM advice_item) x`); n != 220 {
		t.Errorf("advice lists = %d, want 220", n)
	}

	// Indicators with three thresholds hold NULL, never 0.
	for _, code := range []string{"EC-HS-1", "EC-HS-3", "SO-PL-1", "EV-EV-2", "EV-EV-3"} {
		if n := count(t, conn, `SELECT count(*) FROM indicator WHERE code = '`+code+`'
			AND a IS NULL AND b IS NULL AND c IS NOT NULL AND d IS NOT NULL AND e IS NOT NULL`); n != 1 {
			t.Errorf("%s: want a and b NULL", code)
		}
	}
	for _, code := range []string{"EC-HS-2", "EC-HS-5"} {
		if n := count(t, conn, `SELECT count(*) FROM indicator WHERE code = '`+code+`'
			AND d IS NULL AND e IS NULL AND a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL`); n != 1 {
			t.Errorf("%s: want d and e NULL", code)
		}
	}

	// An admin edit survives a rerun, and nothing is duplicated.
	if _, err := conn.Exec(ctx, `UPDATE advice_item_text SET text = 'แก้ไขโดยผู้ดูแล'
		WHERE item_id = (SELECT id FROM advice_item WHERE indicator_code = 'EC-MG-1' AND list = 'RL' AND position = 1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `UPDATE indicator SET c = 4.6 WHERE code = 'EC-MG-1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `UPDATE impact_table SET c = 50 WHERE code = 'RI_C'`); err != nil {
		t.Fatal(err)
	}
	// An admin removed one item from a list: the seed does not bring it back.
	if _, err := conn.Exec(ctx, `DELETE FROM advice_item WHERE indicator_code = 'EC-MG-1' AND list = 'RL' AND position = 3`); err != nil {
		t.Fatal(err)
	}
	if err := runAndSeed([]string{"up"}, url); err != nil {
		t.Fatal(err)
	}
	for q, n := range map[string]int{
		`SELECT count(*) FROM advice_item_text WHERE text = 'แก้ไขโดยผู้ดูแล'`: 1,
		`SELECT count(*) FROM indicator WHERE code = 'EC-MG-1' AND c = 4.6`:    1,
		`SELECT count(*) FROM impact_table WHERE code = 'RI_C' AND c = 50`:     1,
		`SELECT count(*) FROM advice_item`:                                     55*4*3 - 1,
		`SELECT count(*) FROM indicator`:                                       55,
	} {
		if got := count(t, conn, q); got != n {
			t.Errorf("after rerun: %s = %d, want %d", q, got, n)
		}
	}
}
