# @aggc/no-coauthor

## 2.5.1

### Patch Changes

- [`29f03aa`](https://github.com/jmtrs/no-coAuthor/commit/29f03aa06beedb5c9d35cf500f7a4057bdae4c0f) Thanks [@jmtrs](https://github.com/jmtrs)! - Fix the Node hook crashing with "require is not defined in ES module scope" when installed into a repo whose `package.json` declares `"type": "module"` (Vite and any other ESM-first project). Node resolves an extensionless script's module type by walking up to the nearest `package.json`, which used to be the target project's own — `install`/`install --global` now also write a small `package.json` (`{"type":"commonjs"}`) into the hooks directory itself, pinning the hook's module type regardless of what the real project declares. `uninstall` removes it again, but only if it still matches exactly what we wrote.

## 2.5.0

### Minor Changes

- [#21](https://github.com/jmtrs/no-coAuthor/pull/21) [`309fe1e`](https://github.com/jmtrs/no-coAuthor/commit/309fe1e3a7e4fc418334f5dcfe1f9a6703dc3c3d) Thanks [@jmtrs](https://github.com/jmtrs)! - Add a Homebrew tap ([jmtrs/homebrew-tap](https://github.com/jmtrs/homebrew-tap)) for installing without Node.js:

  ```bash
  brew install jmtrs/tap/no-coauthor
  no-coauthor install
  ```

  The formula packages the existing `install.sh` POSIX hook byte-identical, just installed under the `no-coauthor` command name (no behavior changes). `.github/workflows/release.yml` now updates the formula's `url`/`sha256` automatically after every publish.

## 2.4.0

### Minor Changes

- [#19](https://github.com/jmtrs/no-coAuthor/pull/19) [`ec235cc`](https://github.com/jmtrs/no-coAuthor/commit/ec235cc140daff1d9bf0bf1e97919287d9a28007) Thanks [@jmtrs](https://github.com/jmtrs)! - Add support for the [pre-commit](https://pre-commit.com) framework via a new `.pre-commit-hooks.yaml`, so teams already standardized on it can add:

  ```yaml
  repos:
    - repo: https://github.com/jmtrs/no-coAuthor
      rev: vX.Y.Z
      hooks:
        - id: no-coauthor
  ```

  to their `.pre-commit-config.yaml` instead of running `no-coauthor install` directly. This shells out to a new `no-coauthor commit-msg <file>` CLI command (`lib/commit-msg.js`), which reuses the same `stripMessage()` (and `.no-coauthorrc.json` handling) as the installed hooks and `check`. See the new "pre-commit framework" section in the README.

## 2.3.0

### Minor Changes

- [#17](https://github.com/jmtrs/no-coAuthor/pull/17) [`0d7e9b5`](https://github.com/jmtrs/no-coAuthor/commit/0d7e9b5260d791ca3b8b22707f2e4aeb31698175) Thanks [@jmtrs](https://github.com/jmtrs)! - Strip known AI-generated banner/footer lines from commit bodies, not just `Co-Authored-By:` trailers.

  Some tools insert a plain body line rather than (or in addition to) a trailer. Claude Code does this by default — a survey of its docs/CLI history turned up several confirmed variants (emoji prefix optional, link optional, markdown or plain-parenthetical link when present): `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, `Generated with [Claude Code](https://claude.ai/code)`, `🤖 Generated with Claude Code`, `Generated with Claude Code (https://claude.com/claude-code)`. All are now stripped the same way `Co-Authored-By:` trailers are, under both the Node.js and POSIX hooks, and via `check`. (A survey of Copilot, Cursor, Codex CLI, Gemini CLI, Aider, Devin, Amazon Q Developer, and Windsurf found no other tool currently ships a standardized commit-body banner like this — only `Co-Authored-By:` trailers, already covered, or nothing.)

  Only exact, confirmed formats are matched by default (`AI_BANNER_LINES` in `lib/patterns.js`), so ordinary commit body text that merely mentions a tool by name is left untouched. Add your own via the new `banners` field in `.no-coauthorrc.json`.

  Also fixes a latent bug in `scripts/sync-install-sh.js`: it used a plain string as the `String.prototype.replace` replacement, which made JS interpret `$`-sequences (`$&`, `$'`, `$1`, ...) in the generated hook body as special replacement patterns instead of literal text — silently corrupting `install.sh` whenever a pattern's regex source happened to contain one. Fixed by switching to a replacer function.

## 2.2.0

### Minor Changes

- [#12](https://github.com/jmtrs/no-coAuthor/pull/12) [`9644219`](https://github.com/jmtrs/no-coAuthor/commit/9644219e6a2639e6f2303e3249ad5c00615f4a3b) Thanks [@jmtrs](https://github.com/jmtrs)! - Add consistent, color-aware console output across the whole CLI.

  `install`, `uninstall`, `status`, and `check`, plus the `--help` text, now share one styled voice (via `picocolors`): a colored `no-coauthor` tag, green/red checkmarks for pass/fail lines, and yellow for actionable warnings. The standalone `install.sh` curl installer and the rare internal-error line in the generated commit-msg hook get the same treatment, using the same color-detection rule everywhere (`NO_COLOR` wins, then `FORCE_COLOR`/`CI` force it on, then falls back to interactive-terminal detection) so a curl-installed run and the npm CLI behave identically. Piped or non-interactive output (scripts, most CI logs) stays plain text.

  (Note: this release's changelog previously — and incorrectly — repeated the 2.1.0 entry here due to a stale `.changeset` file resurrected from an abandoned branch; no `status` behavior changed again in 2.2.0 beyond what 2.1.0 already shipped.)

## 2.1.0

### Minor Changes

- [#10](https://github.com/jmtrs/no-coAuthor/pull/10) [`eb9c974`](https://github.com/jmtrs/no-coAuthor/commit/eb9c974b5808acd8c5e021682fd435ccb5f6c438) Thanks [@jmtrs](https://github.com/jmtrs)! - Fix `status` false negative when a repo's `core.hooksPath` dir bundles other hooks.

  The live check pointed a throwaway repo's `core.hooksPath` at the real hooks directory. If that directory also contained a `pre-commit` (e.g. running `pnpm validate:staged` / lint-staged), `pre-push`, or any other hook that fails inside the bare temp repo (no `package.json`, no staged files), git aborted the commit before `commit-msg` ran — and `status` reported `✘ live check FAILED` even though the no-coauthor hook was correctly installed and working. This affected any repo that keeps its own hooks in the same `.githooks` (or custom hooksPath) directory no-coauthor installs into.

  The live check now copies only the `commit-msg` family (`commit-msg` plus its wrapper siblings `commit-msg.orig` / `commit-msg.no-coauthor` when present) into an isolated temp directory and runs there, so sibling hooks no longer interfere. The no-coauthor hook itself is unchanged.

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
