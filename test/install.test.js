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
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-repo-'))
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

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

test('standalone install when no commit-msg exists, then uninstall removes it', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.orig')))
  withCwd(dir, function () {
    uninstall(false)
  })
  assert.ok(!exists(path.join(hooks, 'commit-msg')))
})

test('re-install is idempotent (updated, single hook file)', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  withCwd(dir, function () {
    install(false, false)
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  withCwd(dir, function () {
    uninstall(false)
  })
})

test('foreign hook is preserved via wrapper and restored on uninstall', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  var foreign = '#!/bin/sh\necho FOREIGN RAN\n'
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreign, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(exists(path.join(hooks, 'commit-msg.orig')))
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg.orig'), 'utf8'), foreign)
  withCwd(dir, function () {
    uninstall(false)
  })
  // Foreign hook restored as commit-msg.
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg'), 'utf8'), foreign)
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.orig')))
})

test('respects local core.hooksPath (.githooks) and installs there', function () {
  var dir = mkRepo()
  var gh = path.join(dir, '.githooks')
  fs.mkdirSync(gh, { recursive: true })
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir })
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(gh, 'commit-msg')))
  assert.ok(!exists(path.join(dir, '.git', 'hooks', 'commit-msg')))
  withCwd(dir, function () {
    uninstall(false)
  })
  assert.ok(!exists(path.join(gh, 'commit-msg')))
})

test('end-to-end real git commit strips AI trailer and keeps human', function () {
  var dir = mkRepo()
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x')
  execFileSync('git', ['add', 'f.txt'], { cwd: dir })
  withCwd(dir, function () {
    install(false, false)
  })
  execFileSync(
    'git',
    ['commit', '-q', '--allow-empty', '-m', 'feat: e2e', '-m', 'Co-Authored-By: Oz <oz-agent@warp.dev>', '-m', 'Co-Authored-By: Jane Doe <jane@example.com>'],
    { cwd: dir }
  )
  var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' })
  assert.doesNotMatch(body, /oz-agent@warp\.dev/)
  assert.match(body, /jane@example\.com/)
  withCwd(dir, function () {
    uninstall(false)
  })
})
