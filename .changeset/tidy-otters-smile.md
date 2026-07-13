---
"@aggc/no-coauthor": patch
---

Fix `status` printing a contradictory "✔ live check passed" line right
before reporting that a global `core.hooksPath` shadows the local install
(making the local hook provably correct yet irrelevant, since git never
invokes it). The shadow check now runs first and skips the moot live check
instead. Also documents in the README that `status`'s live check only
exercises built-in patterns, not custom `.no-coauthorrc.json` entries.
