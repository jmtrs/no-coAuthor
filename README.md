# no-coauthor

[![CI](https://github.com/jmtrs/no-coAuthor/actions/workflows/ci.yml/badge.svg)](https://github.com/jmtrs/no-coAuthor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40aggc%2Fno-coauthor.svg)](https://www.npmjs.com/package/@aggc/no-coauthor)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/%40aggc%2Fno-coauthor.svg)](package.json)

A `commit-msg` git hook that strips AI `Co-Authored-By:` trailers from commit
messages — while **preserving human co-authors** and every other trailer
(`Signed-off-by`, `Refs`, `Closes`, …).

It runs inside git, not inside the AI tool, so it catches the trailer
regardless of which tool added it or whether that tool's own "disable
attribution" setting actually works.

> Fork of [`0xdsgnrd/no-coAuthor`](https://github.com/0xdsgnrd/no-coAuthor) —
> full credit to the original author for the concept and initial
> implementation. This fork adds email-based detection (not just names),
> `core.hooksPath` support, non-destructive install/uninstall, a POSIX shell
> fallback for machines without Node.js, a user config file, an automated
> test suite, and cross-platform CI. Published on npm as
> [`@aggc/no-coauthor`](https://www.npmjs.com/package/@aggc/no-coauthor); the
> installed hook and CLI command are still called `no-coauthor`.

## Quick start

```bash
npx @aggc/no-coauthor install
```

That's it — every commit in this repo now has AI `Co-Authored-By:` trailers
stripped automatically, human co-authors untouched. See
[Install](#install) for the global, curl, and no-Node.js variants.

## Table of contents

- [Quick start](#quick-start)
- [Why](#why)
- [How it decides what to strip](#how-it-decides-what-to-strip)
- [Covered tools](#covered-tools)
- [Install](#install)
- [Uninstall](#uninstall)
- [How install works (non-destructive)](#how-install-works-non-destructive)
- [Configuration](#configuration)
- [Temporarily disabling](#temporarily-disabling)
- [Server-side enforcement](#server-side-enforcement)
- [CLI reference](#cli-reference)
- [Architecture](#architecture)
- [Cross-platform](#cross-platform)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Releasing](#releasing)
- [Credits](#credits)
- [License](#license)

## Why

AI coding assistants (Claude Code, Copilot, Cursor, Codex, Gemini, Oz/Warp, …)
inject `Co-Authored-By:` trailers into commits. Some tools expose a setting to
disable this, but those settings are unreliable in practice: Claude Code's
`attribution` setting is intermittently ignored, Cursor has re-enabled it
across updates, and tools like Copilot Agent or Gemini Code Assist offer no
setting at all.

`no-coauthor` is a git-level safety net that works regardless of the tool,
its version, or its settings. Use it **together with** your tool's built-in
setting when one exists — prevention at the source plus enforcement at the
commit boundary. Belt and suspenders.

## How it decides what to strip

A `Co-Authored-By: Name <email>` line is removed when **any** of these rules
match (all matching is case-insensitive and anchored to the trailer line):

| Rule | Condition | Example |
|---|---|---|
| **A. Bot address** | The `<email>` matches a known bot address/domain (`copilot@github.com`, `noreply@anthropic.com`, `oz-agent@warp.dev`, `…+copilot@users.noreply.github.com`, …). High confidence — no human co-author uses these. | `Co-Authored-By: Claude <noreply@anthropic.com>` |
| **B. Name + bot-shaped email** | The name matches a known AI tool name **and** the email is bot-shaped (`noreply`, `users.noreply.github.com`, `[bot]`). | `Co-Authored-By: gemini-code-assist[bot] <176…@users.noreply.github.com>` |
| **C. Name + tool domain** | The name matches a known AI tool name **and** the email domain is a known AI-tool domain (`anthropic.com`, `cursor.com`, `warp.dev`, …). Catches non-noreply bot addresses. | `Co-Authored-By: Oz <oz-agent@warp.dev>` |

A **name match alone never strips a line**. This is what keeps a human
literally named "Claude", "Cody", or "Devin" intact:

```
Co-Authored-By: Claude <noreply@anthropic.com>       → stripped (A, B)
Co-Authored-By: Oz <oz-agent@warp.dev>                → stripped (A, C)
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> → stripped (A, B — model-suffixed names too)
Co-Authored-By: Claude Smith <claude@gmail.com>       → KEPT (human, unrelated email)
Co-Authored-By: Jane <jane@cursor.com>                → KEPT (same domain, non-AI name)
Co-Authored-By: Pat <pat@google.com>                  → KEPT (google.com deliberately excluded, see Limitations)
```

Everything else in the commit message — `Signed-off-by:`, `Refs:`, `Closes:`,
free text, other trailers — is left untouched. Removal is line-based and
collapses any blank line left behind so the trailer block stays valid for
git's trailer parser.

## Covered tools

| Tool | Detected via |
|---|---|
| Claude / Claude Code (Anthropic) | `noreply@anthropic.com`, name match |
| GitHub Copilot | `copilot@github.com`, `*copilot*@users.noreply.github.com`, `[bot]` forms |
| OpenAI Codex | `noreply@openai.com`, `codex@openai.com`, GitHub noreply form |
| ChatGPT / GPT (OpenAI) | `@chatgpt.com`, name match |
| Cursor (incl. Cursor Agent / background agents) | `noreply@cursor.com`/`.sh`, `cursoragent@cursor.com` |
| Gemini / Bard / Gemini Code Assist (Google) | `gemini*@google.com`, `bard*@google.com`, `[bot]` forms |
| Oz (Warp) | `oz-agent@warp.dev` |
| Codeium / Windsurf | `noreply@codeium.com`, `noreply@windsurf.com` |
| Tabnine | `noreply@tabnine.com` |
| Amazon Q / CodeWhisperer | name match (`amazon-q`, `amazonq`, `CodeWhisperer`) |
| Aider | `noreply@aider.chat`/`.ai` |
| Zed AI | `noreply@zed.dev` |
| Cody (Sourcegraph) | `noreply@sourcegraph.com` |
| Devin (Cognition) | `noreply@cognition.ai`/`.dev` |
| Augment Code | `noreply@augmentcode.com` |
| Replit Agent / Ghostwriter | `noreply@replit.com` |
| Cline, Continue, Llama, Tabby, Bolt, v0, Lovable, Goose, OpenHands, Plandex, Qoder, Jules | name match |

This list is best-effort and evolves as tools change their default trailers.
Missing one? Add it locally via [config](#configuration) — no code change
needed — or open a PR against `lib/patterns.js`.

## Install

### npm (recommended — Node.js hook with config-file support)

```bash
# Per-project (inside a git repo)
npx @aggc/no-coauthor install

# Every repo on this machine
npx @aggc/no-coauthor install --global
```

`--global` sets git's own `core.hooksPath` globally, so it affects **every
repo on the machine that doesn't already set its own local
`core.hooksPath`** — not just repos you plan to use it with. If you have
older per-project hooks (e.g. a husky v4-style setup that writes straight
into `.git/hooks` instead of setting `core.hooksPath`), they'll stop running
silently. Run `npx @aggc/no-coauthor status` in any repo you're unsure about
to check.

### curl (no Node.js required — POSIX shell hook)

```bash
# Per-project
curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh

# Global
curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh -s -- --global
```

### POSIX shell hook via npm

```bash
npx @aggc/no-coauthor install --no-node
```

## Uninstall

```bash
npx @aggc/no-coauthor uninstall          # per-project
npx @aggc/no-coauthor uninstall --global # global
```

## How install works (non-destructive)

- **No existing `commit-msg` hook** → writes ours (standalone).
- **Existing foreign hook** → preserved as `commit-msg.orig` and replaced with
  a small shell `commit-msg` wrapper that runs the previous hook **then**
  no-coauthor. Your existing hook keeps working unmodified.
- **Already installed** → updated in place (idempotent — safe to re-run).
- **`core.hooksPath`-aware** — if the repo sets a local `core.hooksPath`
  (e.g. `.githooks`), the hook is installed **there**, not in `.git/hooks`
  (which git would otherwise ignore). If a global `core.hooksPath` would
  shadow a per-project install, you get a warning with the fix.
- **Worktree- and submodule-safe** — `install`/`uninstall`/`status` resolve
  the hooks directory through `git rev-parse --git-common-dir` rather than
  assuming `<repo>/.git` is a directory (it's a text file pointing elsewhere
  in both). Installing from a linked worktree writes to the main repo's
  shared hooks dir — the same place git itself reads hooks from for every
  worktree — so one install covers all of them.

Uninstall restores the preserved foreign hook if one exists, otherwise
removes the no-coauthor hook cleanly.

Run `npx @aggc/no-coauthor status` any time to confirm the hook is still
there and actually stripping trailers — see [CLI reference](#cli-reference).

## Configuration

Optional `.no-coauthorrc.json` adds custom patterns on top of the built-ins.
Entries are treated as **literal strings** and escaped automatically, so no
regex knowledge is required:

```json
{
  "names": ["MyAgent"],
  "emails": ["bot@myteam.ai"],
  "domains": ["myteam.ai"]
}
```

The Node.js hook and the `check` command read this at runtime. There are two
locations, with **different trust levels**:

- **`~/.no-coauthorrc.json`** — your own machine, always honored.
- **`./.no-coauthorrc.json`** (repo root) — **ignored by default**. A cloned
  repo could ship a config that silently strips real human co-author
  attribution, which is exactly what this tool exists to prevent. To honor a
  repo-root config you control (e.g. a team-shared one in CI), opt in with:

```bash
export NO_COAUTHOR_TRUST_REPO=1
```

The POSIX fallback hook does not read either file — it is fully
self-contained by design, with no filesystem reads beyond the commit message
itself.

## Temporarily disabling

Two ways to skip stripping, for different scopes:

```bash
# Skip every hook for one commit (git's own escape hatch) — also skips any
# OTHER hook this may be wrapping (see [How install works](#how-install-works-non-destructive)).
git commit --no-verify -m "..."

# Skip only no-coauthor for one commit — any wrapped hook still runs.
NO_COAUTHOR_DISABLE=1 git commit -m "..."

# Skip only no-coauthor for a whole shell session.
export NO_COAUTHOR_DISABLE=1
```

`NO_COAUTHOR_DISABLE` is checked first thing in both the Node and POSIX
hooks, before any matching happens. Prefer it over `--no-verify` whenever a
foreign hook is wrapped and you still want that one to run.

## Server-side enforcement

**The commit-msg hook is a client-side, opt-in safety net, not a security
boundary.** Anything running on the committer's own machine — including an
AI agent with shell access — can skip it: `--no-verify`, `NO_COAUTHOR_DISABLE=1`,
or just never running `install` in the first place. No local git hook can be
made bypass-proof against the same machine it runs on; that's true of this
tool and of every other commit-msg hook (husky, pre-commit, lint-staged, …)
equally, not a no-coauthor-specific weakness.

If your threat model includes an agent that might *deliberately* re-add
attribution rather than just doing it by unreliable default, the hook alone
isn't enough — you need a check that runs somewhere the committer doesn't
control: **CI, as a required PR status check.**

```bash
npx @aggc/no-coauthor check <range>   # exit 1 if any commit in <range> has an AI trailer
npx @aggc/no-coauthor check           # defaults to HEAD~1..HEAD
```

`check` reuses the exact same detection logic as the hooks (same
`lib/patterns.js`, same `.no-coauthorrc.json`), so it can never flag
something the hook wouldn't also have stripped, or vice versa. Copy
[`examples/reject-ai-coauthor.yml`](examples/reject-ai-coauthor.yml) into
your repo's `.github/workflows/` — it computes the commit range from the
PR's base/head SHAs, so it works the same regardless of which branch a PR
targets or is opened from, not just `main`.

A failing check does **not** block a merge by itself — add a branch
protection rule (or ruleset) on your target branch(es) requiring that job to
pass, and restrict who can bypass required checks. That combination — hook
for the common case, required CI check for the case where someone tries to
route around it — is what actually can't be defeated from a local shell.

## CLI reference

```
$ npx @aggc/no-coauthor <command> [options]

Commands
  install             Install hook in current repo
  install --global    Install as global git hook
  install --no-node   Install POSIX shell hook (no Node.js needed)
  uninstall           Remove hook from current repo
  uninstall --global  Remove global git hook
  status              Check the hook is installed and actually stripping trailers
  status --global     Check the global hook instead of the local one
  check [range]       Scan already-made commits for AI trailers (default: HEAD~1..HEAD)
                      For CI use — see [Server-side enforcement](#server-side-enforcement)

Options
  --no-node           Use POSIX shell hook instead of Node.js
  -h, --help          Show help
  -v, --version       Show version
```

`status` exists because this tool's whole job is to run invisibly on every
commit — if something else later overwrites `.git/hooks/commit-msg` (a hook
manager like husky/lefthook reinstalling, a manual edit, a fresh `git init`
template), no-coauthor silently stops working with **zero visible signal**,
which is exactly the failure mode it exists to prevent. `status` checks the
hook file is present, is ours, is executable, and then actually **runs it**
against a synthetic AI trailer to confirm it still strips correctly — not
just that a plausible-looking file exists:

```bash
$ npx @aggc/no-coauthor status
no-coauthor: checking local hook at /path/to/repo/.git/hooks
✔ commit-msg hook is installed and managed by no-coauthor
✔ /path/to/repo/.git/hooks/commit-msg is executable
✔ live check: a synthetic AI trailer was stripped and a human trailer was kept
```

## Architecture

```
bin/no-coauthor.js       CLI entry point (install / uninstall / --help / --version)
lib/git-utils.js         Shared git plumbing (gitConfig, gitRoot, gitCommonDir) used
                         by install/uninstall/status to resolve the hooks dir —
                         worktree/submodule-safe (see How install works above)
lib/install.js           Non-destructive install: standalone, wrap, or update-in-place
lib/uninstall.js         Restores a preserved foreign hook, or removes ours cleanly
lib/status.js            Checks the hook is installed, managed, executable, and
                         actually strips a synthetic AI trailer right now
lib/check.js             Server-side companion: scans a git revision range of
                         already-made commits for AI trailers (reuses strip.js)
lib/hook.js              Builds the self-contained Node.js commit-msg hook that gets
                         written to disk (inlines strip.js + patterns.js — no
                         runtime dependency on this package once installed)
lib/hook-posix.js        Builds the POSIX /bin/sh commit-msg hook from the same
                         patterns.js source (JS regex fragments transliterated
                         to POSIX ERE character classes)
lib/patterns.js          Single source of truth for bot emails, tool domains,
                         and AI tool names — both hooks are generated from this
lib/strip.js             Core matching/stripping logic (rules A/B/C), shared by
                         the Node hook builder and the test suite
install.sh               Standalone POSIX installer for the curl one-liner;
                         embeds a copy of the hook-posix.js output
scripts/sync-install-sh.js  Regenerates that embedded copy after a
                         lib/patterns.js change (`npm run sync-install-sh`)
examples/reject-ai-coauthor.yml  Copy-paste GitHub Actions workflow wired to
                         `no-coauthor check` — see Server-side enforcement above
```

Both hook implementations are generated from `lib/patterns.js`, so a tool
added there is picked up by the Node hook, the POSIX hook, and (after
regeneration) `install.sh` alike. `test/install.test.js` asserts the
`install.sh` embedded hook body stays byte-identical to `lib/hook-posix.js`'s
output, so the two can't silently drift.

## Cross-platform

- **Node.js hook** (default) — Linux, macOS, and Windows (Git for
  Windows / Git Bash).
- **POSIX shell hook** (fallback) — anywhere with `/bin/sh`, `grep -E`, and
  `awk`; no Node.js required.

CI (`.github/workflows/ci.yml`) runs the full test suite on Ubuntu, macOS,
and Windows against Node 18 / 20 / 22, plus a dedicated end-to-end job that
installs the POSIX hook with real `sh`/`grep`/`awk` and performs an actual
`git commit`.

## Limitations

- `status`'s live check only exercises the built-in patterns (a synthetic
  Claude/Anthropic trailer) — it does not know about your
  `.no-coauthorrc.json` custom patterns, so a working `status` doesn't
  guarantee a misconfigured custom pattern is actually matching.
- Lines longer than 500 chars are never treated as a `Co-Authored-By`
  trailer and are left untouched (no real one gets remotely close — this
  bound exists to keep the Node hook's regex matching from doing
  quadratic-time work on an adversarial or buggy-tool-generated giant line).
- The POSIX fallback is best-effort: it compiles all patterns into one
  combined ERE and does not read the config file. Prefer the Node hook when
  possible; use `--no-node` only when Node.js is unavailable.
- `google.com` is intentionally **not** listed as an AI-tool domain (rule C)
  — it's too broad and would risk stripping real Google employees. Gemini/Bard
  bot accounts are still caught by their specific addresses (rule A).
- A human co-author who shares a tool-company domain **and** happens to have
  an AI tool name (e.g. an Anthropic employee literally named "Claude") would
  be stripped by rule C. This is an accepted, rare trade-off — narrow it with
  [config](#configuration) if it matters to you.
- Detection is pattern-based against known trailer shapes. A tool that starts
  emitting a previously-unseen bot address/domain won't be caught until
  patterns.js is updated (or you add it via config).

## Contributing

Bug reports and new tool patterns are welcome.

```bash
npm test                  # full suite: strip logic, install/uninstall, POSIX hook, sh -n
npm run sync-install-sh   # regenerate install.sh after touching lib/patterns.js
npx changeset             # record a changelog entry for your change (patch/minor/major + summary)
```

If you add or change a pattern in `lib/patterns.js`:

1. Add a `strip.test.js` case for both the strip and the preserve side.
2. Run `npm run sync-install-sh` so the curl installer matches — CI fails the
   build otherwise (`test/install.test.js` checks they're byte-identical).
3. `test/posix-parity.test.js` automatically checks your new pattern strips
   correctly under the POSIX hook too; no extra test needed for that part.
4. `npx changeset` before opening the PR — merging to `main` won't publish
   anything by itself, but a maintainer merging the resulting "Version
   Packages" PR will (see [Releasing](#releasing)).

### Releasing

This repo publishes via [Changesets](https://github.com/changesets/changesets):
every push to `main` with a pending changeset opens/updates a "Version
Packages" PR; merging that PR bumps the version, updates `CHANGELOG.md`, and
publishes to npm automatically (`.github/workflows/release.yml`).

## Credits

Originally created by [0xdsgnrd](https://github.com/0xdsgnrd) —
[`0xdsgnrd/no-coAuthor`](https://github.com/0xdsgnrd/no-coAuthor). This fork
builds on that work; see the [table of contents](#table-of-contents) above
for everything added on top.

## License

MIT — see [LICENSE](LICENSE).
