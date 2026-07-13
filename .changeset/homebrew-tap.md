---
"@aggc/no-coauthor": minor
---

Add a Homebrew tap ([jmtrs/homebrew-tap](https://github.com/jmtrs/homebrew-tap)) for installing without Node.js:

```bash
brew install jmtrs/tap/no-coauthor
no-coauthor install
```

The formula packages the existing `install.sh` POSIX hook byte-identical, just installed under the `no-coauthor` command name (no behavior changes). `.github/workflows/release.yml` now updates the formula's `url`/`sha256` automatically after every publish.
