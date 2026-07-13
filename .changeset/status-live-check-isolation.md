---
'@aggc/no-coauthor': minor
---

Fix `status` false negative when a repo's `core.hooksPath` dir bundles other hooks.

The live check pointed a throwaway repo's `core.hooksPath` at the real hooks directory. If that directory also contained a `pre-commit` (e.g. running `pnpm validate:staged` / lint-staged), `pre-push`, or any other hook that fails inside the bare temp repo (no `package.json`, no staged files), git aborted the commit before `commit-msg` ran — and `status` reported `✘ live check FAILED` even though the no-coauthor hook was correctly installed and working. This affected any repo that keeps its own hooks in the same `.githooks` (or custom hooksPath) directory no-coauthor installs into.

The live check now copies only the `commit-msg` family (`commit-msg` plus its wrapper siblings `commit-msg.orig` / `commit-msg.no-coauthor` when present) into an isolated temp directory and runs there, so sibling hooks no longer interfere. The no-coauthor hook itself is unchanged.
