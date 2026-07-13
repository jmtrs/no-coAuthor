# @aggc/no-coauthor

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
