'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync
var spawnSync = require('child_process').spawnSync

// lib/commit-msg.js calls process.exit(), so it can't be require()'d
// in-process without killing the test runner. Run it out-of-process via the
// CLI, the same way pre-commit's `language: node` would invoke it.
function runCommitMsgCli(msgFile, extraEnv) {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  try {
    var out = execFileSync('node', [bin, 'commit-msg', msgFile], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, extraEnv || {})
    })
    return { code: 0, out: out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

function writeMsg(content) {
  var file = path.join(os.tmpdir(), 'nc-commit-msg-test-' + process.pid + '-' + Math.random().toString(36).slice(2))
  fs.writeFileSync(file, content)
  return file
}

test('commit-msg: strips a bot Co-Authored-By trailer, keeps a human one', function () {
  var file = writeMsg(
    'feat: e2e\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\nCo-Authored-By: Jane Doe <jane@example.com>\n'
  )
  var r = runCommitMsgCli(file)
  assert.equal(r.code, 0)
  var out = fs.readFileSync(file, 'utf8')
  assert.match(out, /jane@example\.com/)
  assert.doesNotMatch(out, /oz-agent@warp\.dev/)
})

test('commit-msg: strips a standalone AI banner line', function () {
  var file = writeMsg('feat: e2e\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n')
  var r = runCommitMsgCli(file)
  assert.equal(r.code, 0)
  var out = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(out, /Generated with/)
})

test('commit-msg: leaves a clean message untouched', function () {
  var file = writeMsg('feat: clean\n\nno trailers here\n')
  var before = fs.readFileSync(file, 'utf8')
  var r = runCommitMsgCli(file)
  assert.equal(r.code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('commit-msg: exits 0 even with no file argument (never blocks a commit)', function () {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  var r = spawnSync('node', [bin, 'commit-msg'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stderr, /no commit message file given/)
})

test('commit-msg: honors HOME .no-coauthorrc.json WITHOUT the trust flag', function () {
  var homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-commit-msg-home-'))
  fs.writeFileSync(
    path.join(homeDir, '.no-coauthorrc.json'),
    JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] })
  )
  var file = writeMsg('feat: e2e\n\nCo-Authored-By: MyAgent <bot@mycorp.ai>\n')
  var r = runCommitMsgCli(file, { HOME: homeDir, USERPROFILE: homeDir })
  assert.equal(r.code, 0)
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /bot@mycorp\.ai/)
})
