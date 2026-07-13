---
"@aggc/no-coauthor": minor
---

Add support for the [pre-commit](https://pre-commit.com) framework via a new `.pre-commit-hooks.yaml`, so teams already standardized on it can add:

```yaml
repos:
  - repo: https://github.com/jmtrs/no-coAuthor
    rev: vX.Y.Z
    hooks:
      - id: no-coauthor
```

to their `.pre-commit-config.yaml` instead of running `no-coauthor install` directly. This shells out to a new `no-coauthor commit-msg <file>` CLI command (`lib/commit-msg.js`), which reuses the same `stripMessage()` (and `.no-coauthorrc.json` handling) as the installed hooks and `check`. See the new "pre-commit framework" section in the README.
