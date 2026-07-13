'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var execSync = require('child_process').execSync
var execFileSync = require('child_process').execFileSync

var MANAGED = require('./install').MANAGED

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

function resolveHooksDir(isGlobal) {
  if (isGlobal) {
    var g = gitConfig('--global core.hooksPath')
    return g ? (path.isAbsolute(g) ? g : path.join(os.homedir(), g)) : path.join(os.homedir(), '.git-hooks')
  }
  var root = gitRoot()
  var local = gitConfig('--local core.hooksPath')
  return local ? (path.isAbsolute(local) ? local : path.join(root, local)) : path.join(root, '.git', 'hooks')
}

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch (e) {
    return false
  }
}

function say(ok, msg) {
  console.log((ok ? '✔ ' : '✘ ') + msg)
}

// Proves the hook that's actually installed at `hooksDir` works right now,
// by making git run it for real — the same way it would during a real
// commit — rather than spawning the file ourselves. That distinction
// matters on two fronts: (1) git has its own cross-platform shebang
// handling, so a Node hook (`#!/usr/bin/env node`) or a wrapper shell script
// both just work the same way they do in production, without us needing to
// reimplement interpreter resolution; and (2) a wrapped foreign hook's
// wrapper script locates its sibling files (`commit-msg.orig`,
// `commit-msg.no-coauthor`) relative to its OWN path at run time, so it has
// to be run from its real location with its real siblings intact, not
// copied elsewhere. Pointing a disposable repo's `core.hooksPath` at the
// real hooksDir gets both for free — this is exactly the mechanism the
// --global install already relies on, just aimed at an existing directory
// instead of a fresh one.
function verifyLiveHook(hooksDir) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
    execFileSync('git', ['config', 'core.hooksPath', hooksDir], { cwd: dir })
    execFileSync(
      'git',
      [
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'chore: no-coauthor status check',
        '-m',
        'Co-Authored-By: Claude <noreply@anthropic.com>',
        '-m',
        'Co-Authored-By: A Human <human@example.com>'
      ],
      { cwd: dir, stdio: 'pipe' }
    )
    var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' })
    return body.indexOf('noreply@anthropic.com') === -1 && body.indexOf('human@example.com') !== -1
  } catch (e) {
    return false
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
}

module.exports = function status(isGlobal) {
  var hooksDir
  try {
    hooksDir = resolveHooksDir(isGlobal)
  } catch (e) {
    console.error('no-coauthor: not inside a git repository')
    process.exit(1)
  }

  console.log('no-coauthor: checking ' + (isGlobal ? 'global' : 'local') + ' hook at ' + hooksDir)

  var hookPath = path.join(hooksDir, 'commit-msg')
  var ncPath = path.join(hooksDir, 'commit-msg.no-coauthor')
  var origPath = path.join(hooksDir, 'commit-msg.orig')
  var ok = true

  if (!fs.existsSync(hookPath)) {
    say(false, 'no commit-msg hook installed at ' + hookPath)
    console.log('no-coauthor: run `no-coauthor install' + (isGlobal ? ' --global' : '') + '` to install it')
    process.exit(1)
  }

  var managed = fs.readFileSync(hookPath, 'utf8').indexOf(MANAGED) >= 0
  if (!managed) {
    say(false, 'commit-msg hook exists at ' + hookPath + ' but was NOT installed by no-coauthor (foreign/unmanaged)')
    console.log('no-coauthor: something else owns this hook now — re-run install to wrap it, or check manually')
    process.exit(1)
  }
  say(true, 'commit-msg hook is installed and managed by no-coauthor')

  if (!isExecutable(hookPath)) {
    say(false, hookPath + ' is not executable — git will not run it')
    ok = false
  } else {
    say(true, hookPath + ' is executable')
  }

  if (fs.existsSync(origPath)) {
    say(true, 'a previous foreign hook is preserved at ' + origPath + ' and runs first')
    if (!fs.existsSync(ncPath) || !isExecutable(ncPath)) {
      say(false, ncPath + ' (the actual stripper) is missing or not executable — the wrapper will silently no-op')
      ok = false
    }
  }

  // Checked before the live check (not after) because a shadowed local
  // install means the file at hookPath is provably correct yet completely
  // irrelevant — git will never invoke it. Reporting "✔ live check passed"
  // right before "✘ shadowed" would read as a contradiction; skipping the
  // (also non-trivial: spins up a throwaway repo) live check here avoids it.
  if (!isGlobal) {
    var globalHp = gitConfig('--global core.hooksPath')
    var localHp = gitConfig('--local core.hooksPath')
    if (globalHp && !localHp) {
      say(
        false,
        'global core.hooksPath (' + globalHp + ') shadows this local .git/hooks install — git uses the global path instead, so this hook never runs (skipping live check, it would be moot)'
      )
      process.exit(1)
    }
  }

  var live = ok && verifyLiveHook(hooksDir)
  say(
    live,
    live
      ? 'live check: a synthetic AI trailer was stripped and a human trailer was kept'
      : 'live check FAILED — the installed hook did not strip a known AI trailer correctly'
  )
  ok = ok && live

  process.exit(ok ? 0 : 1)
}
