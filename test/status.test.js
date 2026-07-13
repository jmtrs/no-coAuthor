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
