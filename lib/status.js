'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var execSync = require('child_process').execSync

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

// Runs the currently-installed hook against a synthetic commit message
// containing one known AI trailer and one human trailer, and checks both are
// handled correctly. This is the strongest check here: it proves the exact
// file git will invoke at commit time does its job right now — not just
// that some plausible-looking file happens to exist. Silent breakage (e.g.
// another tool like husky overwriting commit-msg after install) is exactly
// the failure mode `status` exists to catch, since this tool's whole job is
// to run invisibly in the background.
function verifyLiveHook(hookPath) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-'))
  try {
    var msgFile = path.join(dir, 'COMMIT_EDITMSG')
    fs.writeFileSync(
      msgFile,
      'chore: no-coauthor status check\n\n' +
        'Co-Authored-By: Claude <noreply@anthropic.com>\n' +
        'Co-Authored-By: A Human <human@example.com>\n'
    )
    execSync(JSON.stringify(hookPath) + ' ' + JSON.stringify(msgFile), { stdio: 'pipe' })
    var out = fs.readFileSync(msgFile, 'utf8')
    return out.indexOf('noreply@anthropic.com') === -1 && out.indexOf('human@example.com') !== -1
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

  var live = ok && verifyLiveHook(hookPath)
  say(
    live,
    live
      ? 'live check: a synthetic AI trailer was stripped and a human trailer was kept'
      : 'live check FAILED — the installed hook did not strip a known AI trailer correctly'
  )
  ok = ok && live

  if (!isGlobal) {
    var globalHp = gitConfig('--global core.hooksPath')
    var localHp = gitConfig('--local core.hooksPath')
    if (globalHp && !localHp) {
      say(false, 'global core.hooksPath (' + globalHp + ') shadows this local .git/hooks install — git uses the global path instead, so this hook never runs')
      ok = false
    }
  }

  process.exit(ok ? 0 : 1)
}
