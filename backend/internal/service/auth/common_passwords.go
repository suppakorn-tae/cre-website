package auth

import (
	_ "embed"
	"strings"
	"sync"
)

// CodePasswordTooCommon is the field error code for a password on the
// common-password list (ASVS V6.2.4).
const CodePasswordTooCommon = "password_too_common"

// commonPasswordsRaw is the embedded list, one lower-case password per line.
// Source: the 100k most used passwords list of the UK NCSC, as published in
// SecLists (MIT licence, Copyright (c) 2018 Daniel Miessler). Only entries of
// 8 to 128 ASCII characters are kept, in frequency order, the first 5,000.
//
//go:embed common_passwords.txt
var commonPasswordsRaw string

var (
	commonOnce sync.Once
	commonSet  map[string]struct{}
)

func loadCommon() {
	commonOnce.Do(func() {
		lines := strings.Split(commonPasswordsRaw, "\n")
		commonSet = make(map[string]struct{}, len(lines))
		for _, l := range lines {
			if l = strings.TrimSpace(l); l != "" {
				commonSet[l] = struct{}{}
			}
		}
	})
}

// IsCommonPassword reports whether the password is on the embedded list. The
// comparison ignores case.
func IsCommonPassword(password string) bool {
	loadCommon()
	_, ok := commonSet[strings.ToLower(password)]
	return ok
}

// commonPasswordCount is used by tests.
func commonPasswordCount() int {
	loadCommon()
	return len(commonSet)
}
