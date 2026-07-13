'use strict'

var path = require('path')
var execFileSync = require('child_process').execFileSync

// All git invocations go through execFileSync with an explicit argv array.
// Never build a git command by concatenating strings into a shell: a value
// like a hooksPath containing `$(...)` would be executed by the shell. argv
// form bypasses the shell entirely, so values are always passed as literal
// arguments.

function gitConfig(scope) {
  // `scope` is a single token-group like "--global core.hooksPath". Split on
  // whitespace into argv tokens so the whole call stays shell-free.
  try {
    return execFileSync('git', ['config'].concat(String(scope).split(/\s+/).filter(Boolean)), {
      encoding: 'utf8'
    }).trim()
  } catch (e) {
    return ''
  }
}

function gitRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
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
  var out = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8', cwd: cwd }).trim()
  return path.resolve(cwd, out)
}

module.exports = { gitConfig: gitConfig, gitRoot: gitRoot, gitCommonDir: gitCommonDir }
