---
"@aggc/no-coauthor": minor
---

Add `no-coauthor check [range]` and `examples/reject-ai-coauthor.yml`: a
server-side companion to the commit-msg hook. The hook is client-side and
always bypassable (`--no-verify`, `NO_COAUTHOR_DISABLE=1`, or just never
installing it) — nothing local can be made bypass-proof against the machine
it runs on. `check` scans an already-made range of commits and exits
non-zero if any contain an AI co-author trailer, reusing the exact same
detection logic as the hooks. Wired into a required PR status check (see the
new "Server-side enforcement" README section and the example workflow,
which computes its range from the PR's actual base/head SHAs so it works
for any branch, not just `main`), it's the part that can't be talked out of
failing from a local shell.
