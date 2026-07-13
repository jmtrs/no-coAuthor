---
"@aggc/no-coauthor": minor
---

Strip known AI-generated banner/footer lines from commit bodies, not just `Co-Authored-By:` trailers.

Some tools insert a plain body line rather than (or in addition to) a trailer — e.g. Claude Code's `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Previously only the `Co-Authored-By:` trailer was stripped, leaving this banner behind. It's now removed the same way, under both the Node.js and POSIX hooks, and via `check`.

Only exact, confirmed formats are matched by default (`AI_BANNER_LINES` in `lib/patterns.js`), so ordinary commit body text that merely mentions a tool by name is left untouched. Add your own via the new `banners` field in `.no-coauthorrc.json`.

Also fixes a latent bug in `scripts/sync-install-sh.js`: it used a plain string as the `String.prototype.replace` replacement, which made JS interpret `$`-sequences (`$&`, `$'`, `$1`, ...) in the generated hook body as special replacement patterns instead of literal text — silently corrupting `install.sh` whenever a pattern's regex source happened to contain one. Fixed by switching to a replacer function.
