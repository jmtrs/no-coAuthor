---
'@aggc/no-coauthor': patch
---

`status --global` now warns when run inside a repo that overrides `core.hooksPath`.

`status --global` reported the global hook was correctly installed (✔ managed / executable / live-check) but stayed silent when the current repo set its own local `core.hooksPath` (husky's `.husky/_`, lefthook, a teammate's config): git uses the local path, so the global hook never runs in this repo. A user checking their setup from inside such a repo would read "all good" while the global hook was silently inert here.

Mirrors the existing local-install shadow check: when `--global`, read the current repo's local `core.hooksPath`, and if set, warn that the global hook won't run here — pointing at `no-coauthor install` (without `--global`) for a local hook. Warns rather than failing: the global install is correct; it just doesn't apply to this particular repo.
