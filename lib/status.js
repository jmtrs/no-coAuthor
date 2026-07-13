'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var MANAGED = require('./install').MANAGED

var gitUtils = require('./git-utils')
var gitConfig = gitUtils.gitConfig
var gitRoot = gitUtils.gitRoot
var gitCommonDir = gitUtils.gitCommonDir

function resolveHooksDir(isGlobal) {
  if (isGlobal) {
    var g = gitConfig('--global core.hooksPath')
    return g ? (path.isAbsolute(g) ? g : path.join(os.homedir(), g)) : path.join(os.homedir(), '.git-hooks')
  }
  var root = gitRoot()
  var local = gitConfig('--local core.hooksPath')
  return local ? (path.isAbsolute(local) ? local : path.join(root, local)) : path.join(gitCommonDir(), 'hooks')
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
// matters: git has its own cross-platform shebang handling, so a Node hook
// (`#!/usr/bin/env node`) or a wrapper shell script both just work the same
// way they do in production, without us needing to reimplement interpreter
// resolution.
//
// We point a disposable repo's `core.hooksPath` at an ISOLATED copy of just
// the commit-msg family (commit-msg, plus its wrapper siblings commit-msg.orig
// and commit-msg.no-coauthor when present), not the real hooksDir. Two
// reasons: (1) a wrapped foreign hook's wrapper script locates its sibling
// files relative to its OWN path at run time, so we copy those siblings
// alongside it rather than running commit-msg bare; and (2) a repo's
// hooksPath dir commonly bundles OTHER hooks — a `pre-commit` running
// pnpm/lint-staged, a `pre-push`, etc. — that fail inside this bare temp
// repo (no package.json, no staged files) and abort the commit before
// commit-msg ever runs. Pointing at the real dir made those unrelated
// failures read as a no-coauthor live-check failure: a false negative.
// Isolating the family exercises exactly commit-msg, nothing else.
function copyHookFamily(destDir, srcDir, names) {
  names.forEach(function (name) {
    var src = path.join(srcDir, name)
    try {
      var mode = fs.statSync(src).mode & 0o777
      fs.copyFileSync(src, path.join(destDir, name))
      fs.chmodSync(path.join(destDir, name), mode)
    } catch (e) {
      // Missing sibling (e.g. no foreign hook was wrapped) is expected; skip.
    }
  })
}

function verifyLiveHook(hooksDir) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-'))
  var hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-hooks-'))
  try {
    copyHookFamily(hookDir, hooksDir, ['commit-msg', 'commit-msg.orig', 'commit-msg.no-coauthor'])
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
    execFileSync('git', ['config', 'core.hooksPath', hookDir], { cwd: dir })
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
    try {
      fs.rmSync(hookDir, { recursive: true, force: true })
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
        'global core.hooksPath (' + globalHp + ') shadows this local install — git uses the global path instead, so this hook never runs (skipping live check, it would be moot)'
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
