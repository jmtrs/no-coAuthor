# @aggc/no-coauthor

## 2.0.0

### Major Changes

- [#8](https://github.com/jmtrs/no-coAuthor/pull/8) [`a7f0802`](https://github.com/jmtrs/no-coAuthor/commit/a7f0802d00c58555b42fa3f1f325a6001061c061) Thanks [@jmtrs](https://github.com/jmtrs)! - Security hardening pass.

  - **BREAKING**: Repo-local `.no-coauthorrc.json` is now **ignored by default**. A cloned repo could previously ship a config that silently stripped real human co-author attribution — defeating the tool's own purpose. Set `NO_COAUTHOR_TRUST_REPO=1` to opt back in (e.g. in CI, for a team-shared config you control). Home-dir (`~`) config is still always honored. Migration: if you relied on a committed `.no-coauthorrc.json`, set `NO_COAUTHOR_TRUST_REPO=1` in your environment.
  - Fix **command injection** in the global installer path: git invocations now use `execFileSync` argv arrays instead of building a shell string. A `core.hooksPath` or `$HOME` value containing `$(...)` was previously executed by the shell.
  - Fix **silent destruction of a foreign commit-msg hook** on re-install: if another tool (husky, lefthook, a teammate) overwrote the no-coauthor wrapper, re-running install used to overwrite that hook with no backup. The older preserved hook now rolls to `commit-msg.orig.1` and the current foreign hook becomes the live `.orig`; nothing is lost.
  - Add a **ReDoS length guard** to the POSIX fallback hook (the Node hook already had one): lines over 500 chars are no longer matched, preventing a `git commit` hang on a single long adversarial `Co-Authored-By` line.
  - `check` now uses a **NUL record separator** instead of `0x1e`, so a commit message containing control bytes can no longer corrupt SHA/body parsing and let an AI trailer slip past CI enforcement.
  - A `Co-Authored-By` trailer with **trailing whitespace** (e.g. committed with `--cleanup=verbatim`) is now stripped instead of escaping the `>`-anchored match.
  - The example CI workflow passes GitHub context through `env:` instead of inline `${{ }}`, making it injection-proof by construction if adapted.

## 1.5.1

### Patch Changes

- [`dbeada4`](https://github.com/jmtrs/no-coAuthor/commit/dbeada4230c9e6d265e357ecc18ff68019195aea) Thanks [@jmtrs](https://github.com/jmtrs)! - Fix a crash running `install`/`uninstall`/`status` from a git worktree or
  submodule: `.git` there is a text file pointing elsewhere, not a directory,
  so `path.join(root, '.git', 'hooks')` threw `ENOTDIR` trying to mkdir into
  it. Now resolved via `git rev-parse --git-common-dir`, which correctly
  points at the main repo's shared hooks directory (confirmed empirically:
  git invokes hooks from there regardless of which worktree you commit from)
  for the normal case, worktrees, and submodules alike. Also strengthens the
  `--global` install warning: it affects every repo on the machine without
  its own local `core.hooksPath`, not just the one you're standing in.

## 1.5.0

### Minor Changes

- [`fba7ef1`](https://github.com/jmtrs/no-coAuthor/commit/fba7ef16392a9724ccc33376eab2ac1fefb7e12a) Thanks [@jmtrs](https://github.com/jmtrs)! - Add `no-coauthor check [range]` and `examples/reject-ai-coauthor.yml`: a
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

## 1.4.0

### Minor Changes

- [`04e2cc1`](https://github.com/jmtrs/no-coAuthor/commit/04e2cc19e275b68fcb141d3be0f1177c35f6c35f) Thanks [@jmtrs](https://github.com/jmtrs)! - Add `NO_COAUTHOR_DISABLE=1` to disable just this hook for one commit or a
  whole shell session, without touching a preserved foreign hook — unlike
  `git commit --no-verify`, which skips every hook including any wrapped one.
  Supported by both the Node and POSIX hooks, documented in `--help` and the
  README under a new "Temporarily disabling" section.

## 1.3.1

### Patch Changes

- [`8df911e`](https://github.com/jmtrs/no-coAuthor/commit/8df911e0d4a5dfafc0d216a491e0cb4006af9862) Thanks [@jmtrs](https://github.com/jmtrs)! - Fix `status` printing a contradictory "✔ live check passed" line right
  before reporting that a global `core.hooksPath` shadows the local install
  (making the local hook provably correct yet irrelevant, since git never
  invokes it). The shadow check now runs first and skips the moot live check
  instead. Also documents in the README that `status`'s live check only
  exercises built-in patterns, not custom `.no-coauthorrc.json` entries.

## 1.3.0

### Minor Changes

- [`616d089`](https://github.com/jmtrs/no-coAuthor/commit/616d08925f011c319cdf15969eafa16697273b00) Thanks [@jmtrs](https://github.com/jmtrs)! - Add `no-coauthor status` (and `status --global`) to check the hook is
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

### Patch Changes

- [`0409b6f`](https://github.com/jmtrs/no-coAuthor/commit/0409b6f2eb15f59cec8126d3c0cf493fbf2a15fb) Thanks [@jmtrs](https://github.com/jmtrs)! - Polish README (Quick start section, fixed Architecture diagram alignment,
  Contributing/Releasing sections updated for the Changesets workflow) and add
  a `sync-install-sh` script so regenerating the embedded POSIX hook in
  install.sh is a documented, runnable command instead of an ad hoc snippet.

## 1.2.1

### Patch Changes

- [`7640943`](https://github.com/jmtrs/no-coAuthor/commit/7640943ec13df752c67dd67ff3656e1e5b9fa952) Thanks [@jmtrs](https://github.com/jmtrs)! - Include CHANGELOG.md in the published package, add a `prepublishOnly` test
  guard, and add a differential test suite that checks every entry in
  lib/patterns.js strips identically under the Node and POSIX hooks (catches
  POSIX-translation regressions like the earlier Gemini/Bard bug
  automatically, without needing a hand-written case per pattern).

## 1.2.0

### Minor Changes

- [`2863326`](https://github.com/jmtrs/no-coAuthor/commit/28633262844ef9752fe18716ba31e5b304118637) Thanks [@jmtrs](https://github.com/jmtrs)! - Add detection for Codex, Cursor Agent, Devin, Sourcegraph Cody, Augment,
  Replit, and several other AI tools; fix two correctness bugs in the POSIX
  shell fallback hook (missing case-insensitive matching, and a `\w`/`\s`
  bracket-expression translation bug that silently broke Gemini/Bard
  detection).
