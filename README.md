# no-coauthor

A git hook that strips AI co-author trailers (`Co-Authored-By:`) from commit
messages — while **preserving human co-authors** and every other trailer
(`Signed-off-by`, `Refs`, `Closes`, …).

It runs inside git, not inside the AI tool, so it catches everything regardless
of which tool added the trailer or whether that tool's disable setting works.

> Fork of [`0xdsgnrd/no-coAuthor`](https://github.com/0xdsgnrd/no-coAuthor) with
> email-based detection, `core.hooksPath` support, non-destructive install, a
> config file, tests, and cross-platform CI.

## Why

AI coding assistants (Claude Code, Copilot, Cursor, Oz/Warp, Gemini, …) inject
`Co-Authored-By:` trailers into commits. Some tools offer a setting to disable
it, but those settings are unreliable: Claude Code's `attribution` setting is
intermittently ignored, Cursor re-enables it on updates, and Copilot Agent /
Gemini Code Assist have no setting at all. `no-coauthor` is a git-level safety
net that works for every tool.

Use it **together with** your tool's built-in setting when one exists
(prevention + enforcement). Belt and suspenders.

## How it decides what to strip

A `Co-Authored-By: Name <email>` line is removed when **any** of these holds
(case-insensitive):

- **A. Bot address** — the `<email>` matches a known bot address
  (`copilot@github.com`, `noreply@anthropic.com`, `oz-agent@warp.dev`,
  `…+copilot@users.noreply.github.com`, …). High confidence: no human uses these.
- **B. Name + bot-shaped email** — the name matches a known AI tool name **and**
  the email is bot-shaped (`noreply`, `users.noreply.github.com`, `[bot]`).
- **C. Name + tool domain** — the name matches a known AI tool name **and** the
  email domain is a known AI-tool domain (`anthropic.com`, `warp.dev`,
  `cursor.com`, …). Catches non-noreply bot addresses like
  `Oz <oz-agent@warp.dev>`.

A name match **alone never strips**. This is what keeps a human literally named
"Claude" with a normal email intact:

```
Co-Authored-By: Claude <noreply@anthropic.com>   → stripped (A / B)
Co-Authored-By: Oz <oz-agent@warp.dev>           → stripped (A / C)
Co-Authored-By: Claude Smith <claude@gmail.com>  → KEPT (human)
Co-Authored-By: Jane <jane@cursor.com>           → KEPT (same domain, non-AI name)
```

Covered tools: Claude, Copilot, Cursor, Oz (Warp), GPT/ChatGPT, Gemini/Bard,
Codeium, Windsurf, Tabnine, Amazon Q, CodeWhisperer, Aider, Zed, Cody, Devin,
Cline, Continue, Llama. Add your own via [config](#configuration) without
touching code.

## Install

### npm (recommended — Node.js hook with config support)

```bash
# Per-project (inside a git repo)
npx no-coauthor install

# Every repo on your machine
npx no-coauthor install --global
```

### curl (no Node.js required — POSIX shell hook)

```bash
# Per-project
curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh

# Global
curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh -s -- --global
```

### POSIX shell hook via npm

```bash
npx no-coauthor install --no-node
```

## Uninstall

```bash
npx no-coauthor uninstall          # per-project
npx no-coauthor uninstall --global # global
```

## How install works (non-destructive)

- **No existing `commit-msg` hook** → writes ours (standalone).
- **Existing foreign hook** → preserves it as `commit-msg.orig` and installs a
  small shell `commit-msg` wrapper that runs the previous hook **then**
  no-coauthor. Your existing hook keeps working.
- **Already installed** → updates in place (idempotent).
- **`core.hooksPath` aware** — if the repo sets a local `core.hooksPath` (e.g.
  `.githooks`), the hook is installed **there**, not in `.git/hooks` (which git
  would ignore). If a global `core.hooksPath` would shadow a per-project
  install, you get a warning with the fix.

Uninstall restores the preserved foreign hook if any, otherwise removes ours.

## Configuration

Optional `.no-coauthorrc.json` (in the repo root and/or `~`) adds custom
patterns. Entries are **literal** strings (escaped automatically):

```json
{
  "names": ["MyAgent"],
  "emails": ["bot@myteam.ai"],
  "domains": ["myteam.ai"]
}
```

The Node.js hook reads this at runtime; the POSIX fallback does not (it is
self-contained).

## Cross-platform

- **Node.js hook** — the default. Works on Linux, macOS, and Windows
  (Git for Windows / Git Bash).
- **POSIX shell hook** — fallback when Node.js is unavailable. Works anywhere
  with `/bin/sh`, `grep -E`, and `awk`.

CI runs the test suite on Ubuntu, macOS, and Windows with Node 18 / 20 / 22.

## Limitations

- The POSIX fallback is best-effort: it uses a combined ERE and does not read
  the config file. Prefer the Node hook when possible.
- A human co-author who shares a tool-company domain **and** happens to have an
  AI tool as their name (e.g. an Anthropic employee named "Claude") would be
  stripped by rule C. This is an accepted, rare trade-off; use the config to
  narrow patterns if it matters to you.

## License

MIT
