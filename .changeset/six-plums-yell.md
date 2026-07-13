---
"@aggc/no-coauthor": minor
---

Add `NO_COAUTHOR_DISABLE=1` to disable just this hook for one commit or a
whole shell session, without touching a preserved foreign hook — unlike
`git commit --no-verify`, which skips every hook including any wrapped one.
Supported by both the Node and POSIX hooks, documented in `--help` and the
README under a new "Temporarily disabling" section.
