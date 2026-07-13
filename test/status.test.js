'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var install = require('../lib/install')
var uninstall = require('../lib/uninstall')

function mkRepo() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-status-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  return dir
}

function withCwd(dir, fn) {
  var prev = process.cwd()
  process.chdir(dir)
  try {
    fn()
  } finally {
    process.chdir(prev)
  }
}

// lib/status.js calls process.exit(), so it can't be require()'d in-process
// without killing the test runner. Run it out-of-process via the CLI, the
// same way a user would, and inspect the real exit code + output.
function runStatusCli(dir) {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  try {
    var out = execFileSync('node', [bin, 'status'], { cwd: dir, encoding: 'utf8' })
    return { code: 0, out: out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

test('status: fails clearly when no hook is installed', function () {
  var dir = mkRepo()
  var r = runStatusCli(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /no commit-msg hook installed/)
})

test('status: passes and live-verifies stripping after a standalone install', function () {
  var dir = mkRepo()
  withCwd(dir, function () {
    install(false, false)
  })
  var r = runStatusCli(dir)
  assert.equal(r.code, 0)
  assert.match(r.out, /managed by no-coauthor/)
  assert.match(r.out, /live check: a synthetic AI trailer was stripped/)
  withCwd(dir, function () {
    uninstall(false)
  })
})

test('status: passes when a foreign hook was preserved and wrapped', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  fs.writeFileSync(path.join(hooks, 'commit-msg'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false)
  })
  var r = runStatusCli(dir)
  assert.equal(r.code, 0)
  assert.match(r.out, /foreign hook is preserved/)
  assert.match(r.out, /live check: a synthetic AI trailer was stripped/)
  withCwd(dir, function () {
    uninstall(false)
  })
})

test('status: fails when something else overwrote the hook after install (e.g. husky)', function () {
  var dir = mkRepo()
  withCwd(dir, function () {
    install(false, false)
  })
  var hookPath = path.join(dir, '.git', 'hooks', 'commit-msg')
  fs.writeFileSync(hookPath, '#!/bin/sh\necho clobbered\n', { mode: 0o755 })
  var r = runStatusCli(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /was NOT installed by no-coauthor/)
})

// Windows has no POSIX execute-permission bit (chmod's X bits are close to
// a no-op there and fs.constants.X_OK degrades to an existence check per
// Node's docs), so this scenario can't be reproduced on it.
;(process.platform === 'win32' ? test.skip : test)('status: fails when the hook file is not executable', function () {
  var dir = mkRepo()
  withCwd(dir, function () {
    install(false, false)
  })
  var hookPath = path.join(dir, '.git', 'hooks', 'commit-msg')
  fs.chmodSync(hookPath, 0o644)
  var r = runStatusCli(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /is not executable/)
  withCwd(dir, function () {
    fs.chmodSync(hookPath, 0o755)
    uninstall(false)
  })
})

test('status: a global core.hooksPath with no local override shadows the local install, fails clearly, and skips the (moot) live check', function () {
  var dir = mkRepo()
  // A real `git config --global` write/read would touch the actual
  // developer/CI machine's ~/.gitconfig. Point HOME at a throwaway
  // directory for these child-process invocations only, so this test never
  // touches real global git state.
  var fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-fakehome-'))
  var globalHooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-globalhooks-'))
  var env = Object.assign({}, process.env, { HOME: fakeHome, USERPROFILE: fakeHome })
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  try {
    execFileSync('git', ['config', '--global', 'core.hooksPath', globalHooksDir], { cwd: dir, env: env })
    execFileSync('node', [bin, 'install'], { cwd: dir, env: env })
    var out
    var code = 0
    try {
      out = execFileSync('node', [bin, 'status'], { cwd: dir, encoding: 'utf8', env: env })
    } catch (e) {
      code = e.status
      out = (e.stdout || '') + (e.stderr || '')
    }
    assert.equal(code, 1)
    assert.match(out, /shadows this local \.git\/hooks install/)
    assert.doesNotMatch(
      out,
      /[✔✘] live check/,
      'the live check should be skipped once shadowing is detected, not run and then contradicted by the shadow warning'
    )
  } finally {
    try {
      fs.rmSync(fakeHome, { recursive: true, force: true })
    } catch (e) {}
    try {
      fs.rmSync(globalHooksDir, { recursive: true, force: true })
    } catch (e) {}
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
})
