---
"@aggc/no-coauthor": patch
---

Include CHANGELOG.md in the published package, add a `prepublishOnly` test
guard, and add a differential test suite that checks every entry in
lib/patterns.js strips identically under the Node and POSIX hooks (catches
POSIX-translation regressions like the earlier Gemini/Bard bug
automatically, without needing a hand-written case per pattern).
