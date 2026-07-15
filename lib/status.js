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

var ui = require('./ui')

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

// Proves the installed no-coauthor hook actually strips a known AI trailer
// and keeps a human one, right now, by making git run it for real — the same
// way it would during a real commit. Going through git (rather than spawning
// the file ourselves) preserves git's own cross-platform shebang handling,
// so a Node hook (`#!/usr/bin/env node`) and a POSIX hook both work exactly
// as they do in production, including on Windows where shebangs are not
// honored by the kernel.
//
// We point a disposable repo's `core.hooksPath` at an ISOLATED copy of just
// the commit-msg family (commit-msg plus its wrapper siblings), not the real
// hooksDir, for two reasons:
//
//   (1) The real hooksPath dir commonly bundles OTHER hooks — a `pre-commit`
//       running pnpm/lint-staged, a `pre-push`, etc. — that fail inside this
//       bare temp repo (no package.json, no staged files) and abort the
//       commit before commit-msg ever runs. Pointing at the real dir made
//       those unrelated failures read as a no-coauthor live-check failure:
//       a false negative.
//
//   (2) A wrapped foreign hook's wrapper locates its sibling files relative
//       to its OWN path at run time, so we copy those siblings alongside it.
//       BUT we deliberately do NOT copy commit-msg.orig verbatim: that
//       preserved foreign hook is not ours and commonly depends on its own
//       framework's runtime — husky v9's generated .husky/_/commit-msg
//       sources .husky/_/husky.sh, absent from this isolated copy, so it
//       exits non-zero and the wrapper (`"$DIR/commit-msg.orig" "$@" ||
//       exit $?`) aborts BEFORE our stripper runs. That surfaced as a
//       false-negative "live check FAILED" that said nothing about whether
//       OUR stripper works. We keep a commit-msg.orig present (so the
//       wrapper's `if [ -f ... ]` branch still fires and the chain runs in
//       order) but replace it with a harmless no-op. The system under test
//       is the no-coauthor wrapper + stripper, not the foreign hook.
function copyHook(destDir, srcDir, name) {
  var src = path.join(srcDir, name)
  try {
    var mode = fs.statSync(src).mode & 0o777
    fs.copyFileSync(src, path.join(destDir, name))
    fs.chmodSync(path.join(destDir, name), mode)
  } catch (e) {
    // Missing sibling (e.g. standalone install with no foreign hook) is
    // expected; skip.
  }
}

function verifyStripper(hooksDir) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-'))
  var hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-hooks-'))
  try {
    copyHook(hookDir, hooksDir, 'commit-msg')
    copyHook(hookDir, hooksDir, 'commit-msg.no-coauthor')
    if (fs.existsSync(path.join(hooksDir, 'commit-msg.orig'))) {
      // Neutralize the foreign hook: keep the file present (so the wrapper's
      // `if [ -f "$DIR/commit-msg.orig" ]` branch still runs and the chain
      // exercises .orig → .no-coauthor in order) but make it a no-op so it
      // cannot abort the commit out of its own missing context.
      var origInIsolated = path.join(hookDir, 'commit-msg.orig')
      fs.writeFileSync(origInIsolated, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    }
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
    ui.err('not inside a git repository')
    process.exit(1)
  }

  ui.line('checking ' + (isGlobal ? 'global' : 'local') + ' hook at ' + ui.pc.dim(hooksDir))

  var hookPath = path.join(hooksDir, 'commit-msg')
  var ncPath = path.join(hooksDir, 'commit-msg.no-coauthor')
  var origPath = path.join(hooksDir, 'commit-msg.orig')
  var ok = true

  if (!fs.existsSync(hookPath)) {
    ui.say(false, 'no commit-msg hook installed at ' + hookPath)
    ui.line('run `no-coauthor install' + (isGlobal ? ' --global' : '') + '` to install it')
    process.exit(1)
  }

  var managed = fs.readFileSync(hookPath, 'utf8').indexOf(MANAGED) >= 0
  if (!managed) {
    ui.say(false, 'commit-msg hook exists at ' + hookPath + ' but was NOT installed by no-coauthor (foreign/unmanaged)')
    ui.line('something else owns this hook now — re-run install to wrap it, or check manually')
    process.exit(1)
  }
  ui.say(true, 'commit-msg hook is installed and managed by no-coauthor')

  if (!isExecutable(hookPath)) {
    ui.say(false, hookPath + ' is not executable — git will not run it')
    ok = false
  } else {
    ui.say(true, hookPath + ' is executable')
  }

  if (fs.existsSync(origPath)) {
    ui.say(true, 'a previous foreign hook is preserved at ' + origPath + ' and runs first')
    if (!fs.existsSync(ncPath) || !isExecutable(ncPath)) {
      ui.say(false, ncPath + ' (the actual stripper) is missing or not executable — the wrapper will silently no-op')
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
      ui.say(
        false,
        'global core.hooksPath (' + globalHp + ') shadows this local install — git uses the global path instead, so this hook never runs (skipping live check, it would be moot)'
      )
      process.exit(1)
    }
  }

  // Symmetric to the local shadow check above: a GLOBAL install is correct
  // in itself, but if the current repo sets its OWN local core.hooksPath
  // (husky's .husky/_, lefthook, a teammate's config, etc.), git uses that
  // path and the global hook never runs in this repo. Surface it — a user
  // checking their setup from inside such a repo would otherwise read "all
  // good" while the global hook is silently inert here. Warn, don't fail:
  // the global install is fine; it just doesn't apply to this repo.
  if (isGlobal) {
    var localHpOverride
    try {
      localHpOverride = gitConfig('--local core.hooksPath')
    } catch (e) {
      localHpOverride = ''
    }
    if (localHpOverride) {
      ui.warn(
        'this repo overrides core.hooksPath locally (' +
          localHpOverride +
          '); the global hook at ' +
          hooksDir +
          " won't run here — run `no-coauthor install` (without --global) for a local hook in this repo"
      )
    }
  }

  var live = ok && verifyStripper(hooksDir)
  ui.say(
    live,
    live
      ? 'live check: a synthetic AI trailer was stripped and a human trailer was kept'
      : 'live check FAILED — the installed hook did not strip a known AI trailer correctly'
  )
  ok = ok && live

  process.exit(ok ? 0 : 1)
}
