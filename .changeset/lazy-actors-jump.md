---
"@aggc/no-coauthor": minor
---

Add `no-coauthor status` (and `status --global`) to check the hook is
installed, managed by no-coauthor, executable, and actually strips a
synthetic AI trailer right now — catches silent breakage from another tool
(e.g. a hook manager reinstalling) overwriting the hook after install.

Also fix a real-world DoS-lite bug: a very long `Co-Authored-By` line (no
newline required) made the Node hook's matching regex do quadratic-time
work, hanging `git commit` for minutes on an adversarial or buggy-tool
generated line. Lines over 500 chars are now skipped for trailer matching
(no legitimate trailer is remotely that long). The POSIX hook was
unaffected — real `grep -E` uses a linear-time engine.

Added an end-to-end test that drives a real `git commit` through a wrapped
foreign hook to prove it still runs and can still block a commit, and that
no-coauthor's stripping still applies on top when it doesn't.
