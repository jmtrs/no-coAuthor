---
'@aggc/no-coauthor': patch
---

Fix false-negative `status` live check when a preserved foreign hook fails out of context.

`no-coauthor status` copied the preserved foreign `commit-msg.orig` into the isolated temp repo verbatim and ran a real `git commit`. When the foreign `.orig` is husky v9's generated wrapper (it sources `.husky/_/husky.sh`, absent from the copy), it exits non-zero; the wrapper chain runs `.orig` first (`"$DIR/commit-msg.orig" "$@" || exit $?`), so the commit aborts before the no-coauthor stripper runs — surfacing as a false-negative "live check FAILED" that says nothing about whether the stripper actually works.

The live check still goes through a real `git commit` (preserving git's cross-platform shebang handling on Windows) and still copies `commit-msg` + `commit-msg.no-coauthor`, but now replaces `commit-msg.orig` with a harmless no-op so the wrapper chain runs in order without depending on the foreign hook's runtime.
