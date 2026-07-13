'use strict'

var path = require('path')
var execSync = require('child_process').execSync

function gitConfig(scope) {
  try {
    return execSync('git config ' + scope, { encoding: 'utf8' }).trim()
  } catch (e) {
    return ''
  }
}

function gitRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
}

// The directory git actually reads hooks from for the current repo (absent a
// core.hooksPath override). Deliberately NOT `<toplevel>/.git`: that assumes
// `.git` is a directory, which is false for worktrees and submodules — there
// it's a text file (`gitdir: /real/path`) pointing elsewhere, and
// `fs.mkdirSync(path.join(root, '.git', 'hooks'))` crashes with ENOTDIR
// (confirmed: both `git worktree add` and `git submodule add` reproduce this
// against the naive join). `--git-common-dir` is git's own answer to "where
// do I keep the data every worktree/submodule shares" — hooks are shared
// across worktrees by default (confirmed empirically: a hook placed in the
// main repo's .git/hooks fires when committing from a linked worktree) — so
// resolving through it handles the normal case, worktrees, and submodules
// uniformly, without us hand-parsing `.git` file contents ourselves.
function gitCommonDir(cwd) {
  cwd = cwd || process.cwd()
  var out = execSync('git rev-parse --git-common-dir', { encoding: 'utf8', cwd: cwd }).trim()
  return path.resolve(cwd, out)
}

module.exports = { gitConfig: gitConfig, gitRoot: gitRoot, gitCommonDir: gitCommonDir }
