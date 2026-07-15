'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

// Isolate every git config read/write this file's process makes (including
// the in-process install()/uninstall() calls below, via git-utils.js's
// execSync) from whatever the real machine's ~/.gitconfig happens to have
// set — notably core.hooksPath, which a real `no-coauthor install --global`
// run on this dev machine sets persistently. Without this, these tests only
// pass by accident of the environment they happen to run in. GIT_CONFIG_GLOBAL
// is git's own supported override (2.32+) for exactly this purpose. `node
// --test` runs each file as its own process, so this doesn't leak elsewhere.
var fakeGlobalGitConfig = path.join(os.tmpdir(), 'nc-status-test-empty-gitconfig-' + process.pid)
fs.writeFileSync(fakeGlobalGitConfig, '')
process.env.GIT_CONFIG_GLOBAL = fakeGlobalGitConfig

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

// Regression: a repo whose hooksPath dir bundles OTHER hooks (a `pre-commit`
// running pnpm/lint-staged, etc.) must not make the no-coauthor live check
// fail. Before isolation, the temp repo pointed at the real hooksDir, the
// sibling pre-commit ran first (no package.json in the temp dir → non-zero
// exit) and aborted the commit before commit-msg ever ran — a false negative
// reported as "live check FAILED". The live check must isolate commit-msg.
test('status: live check still passes when sibling hooks (pre-commit) fail in the temp repo', function () {
  var dir = mkRepo()
  withCwd(dir, function () {
    install(false, false)
  })
  var hooks = path.join(dir, '.git', 'hooks')
  // A sibling hook that always fails — mirrors a pre-commit calling
  // `pnpm validate:staged` in a bare temp dir with no package.json.
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  var r = runStatusCli(dir)
  assert.equal(r.code, 0)
  assert.match(r.out, /live check: a synthetic AI trailer was stripped/)
  withCwd(dir, function () {
    uninstall(false)
  })
})

// Regression: when a foreign hook was preserved (commit-msg.orig) and would
// FAIL if run out of its own context, the live check must still PASS — our
// stripper is fine. Real-world case: husky v9. core.hooksPath points at
// .husky/_, whose commit-msg is husky's generated wrapper sourcing
// .husky/_/husky.sh; that file is absent from the self-test's isolated copy,
// so the wrapper exits non-zero. The wrapper chain runs .orig first
// (`"$DIR/commit-msg.orig" "$@" || exit $?`), so the commit aborts before the
// no-coauthor stripper ever runs — surfacing as a false-negative
// "live check FAILED". The live check must prove the stripper in isolation,
// not re-run the (context-dependent) foreign hook.
test('status: live check passes even when the preserved foreign hook (.orig) fails out of context', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  // A foreign hook that always fails — mirrors husky's generated wrapper
  // sourcing .husky/_/husky.sh in a copy that doesn't ship it.
  fs.writeFileSync(path.join(hooks, 'commit-msg'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
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
  // This test wants its OWN fake global config (resolved via HOME above),
  // not the file-level GIT_CONFIG_GLOBAL override set at the top of this
  // file for every other test — that would take precedence over HOME and
  // point every child process here right back at an empty config.
  delete env.GIT_CONFIG_GLOBAL
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
    assert.match(out, /shadows this local install/)
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

// Regression: `status --global` reports the GLOBAL hook is correctly installed
// (✔ managed), but if the current repo sets its OWN local core.hooksPath, git
// uses that path instead and the global hook never runs in this repo — yet the
// old output never said so. A user who runs `status --global` to confirm their
// setup while inside a husky/lefthook repo (local core.hooksPath = .husky/_)
// would read "✔ all good" while the global hook is silently inert here. The
// command must surface the override.
test('status --global warns when the current repo overrides core.hooksPath (the global hook never runs here)', function () {
  var dir = mkRepo()
  var fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-fakehome-'))
  var globalHooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-globalhooks-'))
  var env = Object.assign({}, process.env, { HOME: fakeHome, USERPROFILE: fakeHome })
  delete env.GIT_CONFIG_GLOBAL
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  try {
    execFileSync('git', ['config', '--global', 'core.hooksPath', globalHooksDir], { cwd: dir, env: env })
    execFileSync('node', [bin, 'install', '--global'], { cwd: dir, env: env })
    // The repo overrides with its own local core.hooksPath (e.g. husky's
    // .husky/_). git will use this, so the global hook is inert in this repo.
    execFileSync('git', ['config', '--local', 'core.hooksPath', path.join(dir, '.githooks')], { cwd: dir })
    var out
    var code = 0
    try {
      out = execFileSync('node', [bin, 'status', '--global'], { cwd: dir, encoding: 'utf8', env: env })
    } catch (e) {
      code = e.status
      out = (e.stdout || '') + (e.stderr || '')
    }
    // The global hook IS correctly installed...
    assert.equal(code, 0)
    assert.match(out, /managed by no-coauthor/)
    // ...but the command must warn that this repo overrides core.hooksPath and
    // the global hook will not run here.
    assert.match(out, /overrides core\.hooksPath/, 'should warn the repo overrides core.hooksPath')
    assert.match(out, /won't run here|will not run here/, 'should state the global hook does not run in this repo')
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
