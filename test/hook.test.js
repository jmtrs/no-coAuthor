'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var hookScript = require('../lib/hook')

function runHook(message, env) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-hook-'))
  try {
    var hookFile = path.join(dir, 'commit-msg')
    var msgFile = path.join(dir, 'COMMIT_EDITMSG')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    fs.writeFileSync(msgFile, message)
    execFileSync('node', [hookFile, msgFile], {
      env: Object.assign({}, process.env, { HOME: dir, NODE_PATH: '' }, env || {}),
      cwd: dir
    })
    return fs.readFileSync(msgFile, 'utf8')
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
}

test('generated hook strips Oz and keeps Jane', function () {
  var out = runHook(
    'feat: a\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\n' +
      'Co-Authored-By: Jane Doe <jane@example.com>\nSigned-off-by: Real <real@example.com>\n'
  )
  assert.doesNotMatch(out, /oz-agent@warp\.dev/)
  assert.match(out, /Jane Doe/)
  assert.match(out, /Signed-off-by: Real/)
})

test('generated hook is a no-op on a clean message', function () {
  var msg = 'chore: n\n\nBody.\n'
  var out = runHook(msg)
  assert.equal(out, msg)
})

test('generated hook IGNORES repo .no-coauthorrc.json by default (untrusted repo defense)', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-cfg-'))
  try {
    fs.writeFileSync(
      path.join(dir, '.no-coauthorrc.json'),
      JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] })
    )
    var hookFile = path.join(dir, 'commit-msg')
    var msgFile = path.join(dir, 'COMMIT_EDITMSG')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    fs.writeFileSync(msgFile, 'fix: x\n\nCo-Authored-By: MyAgent <bot@mycorp.ai>\n')
    execFileSync('node', [hookFile, msgFile], {
      env: Object.assign({}, process.env, { HOME: os.tmpdir() }),
      cwd: dir
    })
    var out = fs.readFileSync(msgFile, 'utf8')
    // Repo config is untrusted by default: MyAgent is treated as a normal
    // human co-author and the trailer is preserved.
    assert.match(out, /MyAgent <bot@mycorp\.ai>/)
    assert.equal(out, 'fix: x\n\nCo-Authored-By: MyAgent <bot@mycorp.ai>\n')
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
})

test('generated hook reads repo .no-coauthorrc.json only when NO_COAUTHOR_TRUST_REPO=1', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-cfg-trust-'))
  try {
    fs.writeFileSync(
      path.join(dir, '.no-coauthorrc.json'),
      JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] })
    )
    var hookFile = path.join(dir, 'commit-msg')
    var msgFile = path.join(dir, 'COMMIT_EDITMSG')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    fs.writeFileSync(msgFile, 'fix: x\n\nCo-Authored-By: MyAgent <bot@mycorp.ai>\n')
    execFileSync('node', [hookFile, msgFile], {
      env: Object.assign({}, process.env, { HOME: os.tmpdir(), NO_COAUTHOR_TRUST_REPO: '1' }),
      cwd: dir
    })
    var out = fs.readFileSync(msgFile, 'utf8')
    assert.doesNotMatch(out, /MyAgent/)
    assert.equal(out, 'fix: x\n')
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
})

test('generated hook honors HOME .no-coauthorrc.json WITHOUT the trust flag', function () {
  // Homedir config is the user's own machine → always trusted, regardless of
  // NO_COAUTHOR_TRUST_REPO. HOME and cwd are intentionally DIFFERENT dirs so
  // this proves the homedir path (not a leaked repo-config read) is honored.
  var homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-home-'))
  var workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-work-'))
  try {
    fs.writeFileSync(
      path.join(homeDir, '.no-coauthorrc.json'),
      JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] })
    )
    var hookFile = path.join(workDir, 'commit-msg')
    var msgFile = path.join(workDir, 'COMMIT_EDITMSG')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    fs.writeFileSync(msgFile, 'fix: x\n\nCo-Authored-By: MyAgent <bot@mycorp.ai>\n')
    execFileSync('node', [hookFile, msgFile], {
      env: Object.assign({}, process.env, { HOME: homeDir }),
      cwd: workDir
    })
    var out = fs.readFileSync(msgFile, 'utf8')
    assert.doesNotMatch(out, /MyAgent/, 'homedir config must be honored without the trust flag')
    assert.equal(out, 'fix: x\n')
  } finally {
    try {
      fs.rmSync(homeDir, { recursive: true, force: true })
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch (e) {}
  }
})

test('NO_COAUTHOR_DISABLE=1 skips stripping for that invocation', function () {
  var msg = 'fix: x\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\nCo-Authored-By: Jane Doe <jane@example.com>\n'
  var out = runHook(msg, { NO_COAUTHOR_DISABLE: '1' })
  assert.equal(out, msg, 'the message should be left completely untouched when disabled')
})

test('generated hook does not crash when message file is missing', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-missing-'))
  try {
    var hookFile = path.join(dir, 'commit-msg')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    // No file path argument → exits 0 without error.
    execFileSync('node', [hookFile], {
      env: Object.assign({}, process.env, { HOME: dir }),
      cwd: dir
    })
    assert.ok(true)
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
})
