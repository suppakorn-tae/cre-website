package report

import (
	"testing"
	"time"
)

func TestBeDateTime(t *testing.T) {
	m := func(k string) string { return msgs[k] }
	for _, c := range []struct {
		name string
		in   time.Time
		want string
	}{
		{"midnight in Bangkok", time.Date(2026, 11, 26, 17, 0, 0, 0, time.UTC), "27 พฤศจิกายน พ.ศ. 2569 เวลา 00:00 น."},
		{"UTC evening is the next day", time.Date(2026, 11, 24, 18, 30, 0, 0, time.UTC), "25 พฤศจิกายน พ.ศ. 2569 เวลา 01:30 น."},
		{"new year rolls over", time.Date(2026, 12, 31, 20, 5, 0, 0, time.UTC), "1 มกราคม พ.ศ. 2570 เวลา 03:05 น."},
		{"just before midnight", time.Date(2026, 11, 27, 16, 59, 59, 0, time.UTC), "27 พฤศจิกายน พ.ศ. 2569 เวลา 23:59 น."},
		{"zero time", time.Time{}, "-"},
	} {
		if got := beDateTime(m, c.in, thai); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
