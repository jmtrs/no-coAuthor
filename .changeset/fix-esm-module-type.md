---
"@aggc/no-coauthor": patch
---

Fix the Node hook crashing with "require is not defined in ES module scope" when installed into a repo whose `package.json` declares `"type": "module"` (Vite and any other ESM-first project). Node resolves an extensionless script's module type by walking up to the nearest `package.json`, which used to be the target project's own — `install`/`install --global` now also write a small `package.json` (`{"type":"commonjs"}`) into the hooks directory itself, pinning the hook's module type regardless of what the real project declares. `uninstall` removes it again, but only if it still matches exactly what we wrote.
