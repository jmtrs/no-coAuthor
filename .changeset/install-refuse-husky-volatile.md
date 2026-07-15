---
'@aggc/no-coauthor': patch
---

`install` now refuses to write into husky's volatile `.husky/_` directory.

husky v9 points `core.hooksPath` at `.husky/_` and regenerates that directory on every `pnpm`/`npm install` (its `prepare` script). no-coauthor previously wrote its wrapper into `.husky/_/commit-msg` — silently non-durable, wiped the next time someone ran install. `status` would then report the hook missing with no clue why.

`install` now detects that volatile dir (`.husky/_` under the worktree root, or the older husky v8 `husky.sh` marker) and REFUSES rather than reporting success for a hook that will vanish. The message points the user at the durable alternative: chain no-coauthor from the user-authored `.husky/commit-msg` (which husky never overwrites), e.g. by appending `"$HOME/.git-hooks/commit-msg" "$1"` after the existing commit-msg command.
