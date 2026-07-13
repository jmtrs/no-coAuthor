---
"@aggc/no-coauthor": patch
---

Fix a crash running `install`/`uninstall`/`status` from a git worktree or
submodule: `.git` there is a text file pointing elsewhere, not a directory,
so `path.join(root, '.git', 'hooks')` threw `ENOTDIR` trying to mkdir into
it. Now resolved via `git rev-parse --git-common-dir`, which correctly
points at the main repo's shared hooks directory (confirmed empirically:
git invokes hooks from there regardless of which worktree you commit from)
for the normal case, worktrees, and submodules alike. Also strengthens the
`--global` install warning: it affects every repo on the machine without
its own local `core.hooksPath`, not just the one you're standing in.
