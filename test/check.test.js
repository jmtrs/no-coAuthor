'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

function mkRepo() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-check-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  return dir
}

function commit(dir, subject, body) {
  var args = ['commit', '-q', '--allow-empty', '-m', subject]
  if (body) args.push('-m', body)
  execFileSync('git', args, { cwd: dir })
}

// lib/check.js calls process.exit(), so it can't be require()'d in-process
// without killing the test runner. Run it out-of-process via the CLI, the
// same way CI would.
function runCheckCli(dir, range) {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  var args = [bin, 'check']
  if (range) args.push(range)
  try {
    var out = execFileSync('node', args, { cwd: dir, encoding: 'utf8' })
    return { code: 0, out: out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

test('check: passes on a clean commit range', function () {
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: clean')
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 0)
  assert.match(r.out, /no AI co-author trailers found/)
})

test('check: fails and names the offending commit when an AI trailer is in range', function () {
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: with ai trailer', 'Co-Authored-By: Claude <noreply@anthropic.com>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 1)
  assert.match(r.out, /found AI co-author trailers in 1 commit/)
  assert.match(r.out, /noreply@anthropic\.com/)
})

test('check: passes when the only trailer in range is a human co-author', function () {
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: with human co-author', 'Co-Authored-By: Jane Doe <jane@example.com>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 0)
})

test('check: scans every commit across a wider range, not just the tip', function () {
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: clean commit')
  commit(dir, 'feat: with ai trailer', 'Co-Authored-By: Oz <oz-agent@warp.dev>')
  commit(dir, 'feat: another clean commit')
  var r = runCheckCli(dir, 'HEAD~3..HEAD')
  assert.equal(r.code, 1)
  assert.match(r.out, /oz-agent@warp\.dev/)
})

test('check: default range (no arg) checks just HEAD~1..HEAD', function () {
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: with ai trailer, but two commits back', 'Co-Authored-By: Claude <noreply@anthropic.com>')
  commit(dir, 'feat: clean HEAD')
  var r = runCheckCli(dir)
  assert.equal(r.code, 0, 'default range should not see the offending commit two back')
})

test('check: respects .no-coauthorrc.json custom patterns', function () {
  var dir = mkRepo()
  fs.writeFileSync(path.join(dir, '.no-coauthorrc.json'), JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] }))
  commit(dir, 'chore: base')
  commit(dir, 'feat: with custom bot trailer', 'Co-Authored-By: MyAgent <bot@mycorp.ai>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 1)
  assert.match(r.out, /bot@mycorp\.ai/)
})

test('check: exits 2 with a clear error on an invalid range', function () {
  var dir = mkRepo()
  commit(dir, 'chore: only commit')
  var r = runCheckCli(dir, 'not-a-real-ref..HEAD')
  assert.equal(r.code, 2)
  assert.match(r.out, /failed to read git log/)
})
