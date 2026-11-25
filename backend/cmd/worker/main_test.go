package main

import "testing"

func TestSchedulerEnabled(t *testing.T) {
	cases := map[string]bool{"": true, "true": true, "1": true, "garbage": true, "false": false, "0": false, " FALSE ": false}
	for in, want := range cases {
		got := schedulerEnabled(func(string) (string, bool) { return in, in != "" })
		if got != want {
			t.Errorf("%q: got %v want %v", in, got, want)
		}
	}
}
