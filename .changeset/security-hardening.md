---
'@aggc/no-coauthor': major
---

Security hardening pass.

- **BREAKING**: Repo-local `.no-coauthorrc.json` is now **ignored by default**. A cloned repo could previously ship a config that silently stripped real human co-author attribution — defeating the tool's own purpose. Set `NO_COAUTHOR_TRUST_REPO=1` to opt back in (e.g. in CI, for a team-shared config you control). Home-dir (`~`) config is still always honored. Migration: if you relied on a committed `.no-coauthorrc.json`, set `NO_COAUTHOR_TRUST_REPO=1` in your environment.
- Fix **command injection** in the global installer path: git invocations now use `execFileSync` argv arrays instead of building a shell string. A `core.hooksPath` or `$HOME` value containing `$(...)` was previously executed by the shell.
- Fix **silent destruction of a foreign commit-msg hook** on re-install: if another tool (husky, lefthook, a teammate) overwrote the no-coauthor wrapper, re-running install used to overwrite that hook with no backup. The older preserved hook now rolls to `commit-msg.orig.1` and the current foreign hook becomes the live `.orig`; nothing is lost.
- Add a **ReDoS length guard** to the POSIX fallback hook (the Node hook already had one): lines over 500 chars are no longer matched, preventing a `git commit` hang on a single long adversarial `Co-Authored-By` line.
- `check` now uses a **NUL record separator** instead of `0x1e`, so a commit message containing control bytes can no longer corrupt SHA/body parsing and let an AI trailer slip past CI enforcement.
- A `Co-Authored-By` trailer with **trailing whitespace** (e.g. committed with `--cleanup=verbatim`) is now stripped instead of escaping the `>`-anchored match.
- The example CI workflow passes GitHub context through `env:` instead of inline `${{ }}`, making it injection-proof by construction if adapted.
