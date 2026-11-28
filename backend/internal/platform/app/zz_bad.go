package app

import "os/exec"

func runBad(input string) error {
	return exec.Command("sh", "-c", input).Run()
}
