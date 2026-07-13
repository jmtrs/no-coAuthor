# @aggc/no-coauthor

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
