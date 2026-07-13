'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

// Isolate this file's git commits from the real machine's global git config.
// Without this, a REAL active `core.hooksPath` (e.g. from a real
// `no-coauthor install --global` run on this dev machine) actually strips
// the AI trailers these tests plant via `commit()` at commit time, before
// `check` ever gets to look at the history — so these tests would silently
// verify nothing (a clean commit either way) instead of what they claim to.
// GIT_CONFIG_GLOBAL is git's own supported override (2.32+) for this.
var fakeGlobalGitConfig = path.join(os.tmpdir(), 'nc-check-test-empty-gitconfig-' + process.pid)
fs.writeFileSync(fakeGlobalGitConfig, '')
process.env.GIT_CONFIG_GLOBAL = fakeGlobalGitConfig

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
// same way CI would. `extraEnv` lets a test opt into NO_COAUTHOR_TRUST_REPO.
function runCheckCli(dir, range, extraEnv) {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  var args = [bin, 'check']
  if (range) args.push(range)
  try {
    var out = execFileSync('node', args, {
      cwd: dir,
      encoding: 'utf8',
      env: Object.assign({}, process.env, extraEnv || {})
    })
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

test('check: repo .no-coauthorrc.json is IGNORED by default (untrusted repo defense)', function () {
  // Security: a cloned repo could ship a .no-coauthorrc.json that strips real
  // human attribution. By default repo config must NOT be loaded — only the
  // user's homedir config is trusted. Here a repo config names "MyAgent", but
  // without opt-in the check must NOT recognize it (the trailer is treated as
  // a normal human co-author and the commit passes).
  var dir = mkRepo()
  fs.writeFileSync(path.join(dir, '.no-coauthorrc.json'), JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] }))
  commit(dir, 'chore: base')
  commit(dir, 'feat: with custom bot trailer', 'Co-Authored-By: MyAgent <bot@mycorp.ai>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 0, 'repo config should be ignored unless NO_COAUTHOR_TRUST_REPO is set')
})

test('check: respects .no-coauthorrc.json custom patterns when NO_COAUTHOR_TRUST_REPO=1', function () {
  var dir = mkRepo()
  fs.writeFileSync(path.join(dir, '.no-coauthorrc.json'), JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] }))
  commit(dir, 'chore: base')
  commit(dir, 'feat: with custom bot trailer', 'Co-Authored-By: MyAgent <bot@mycorp.ai>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD', { NO_COAUTHOR_TRUST_REPO: '1' })
  assert.equal(r.code, 1)
  assert.match(r.out, /bot@mycorp\.ai/)
})

test('check: NUL separator survives a commit message containing 0x1e/0x1f', function () {
  // Regression: the old \x1e record separator could be split by a commit body
  // containing a literal 0x1e, corrupting the sha/body parse and letting an
  // AI trailer slip through undetected (a CI-enforcement bypass). NUL cannot
  // appear in a commit body, so the check now still flags the trailer.
  var dir = mkRepo()
  commit(dir, 'chore: base')
  var msgFile = path.join(dir, 'nc-msg.txt')
  fs.writeFileSync(msgFile, 'feat: tricky\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n\nbody has \x1e RS and \x1f US bytes\n')
  execFileSync('git', ['commit', '-q', '--allow-empty', '-F', msgFile], { cwd: dir })
  var r = runCheckCli(dir, 'HEAD~1..HEAD')
  assert.equal(r.code, 1)
  assert.match(r.out, /noreply@anthropic\.com/)
})

test('check: honors HOME .no-coauthorrc.json WITHOUT the trust flag', function () {
  // Homedir config is always trusted. HOME points at a dir with custom
  // patterns; the repo dir has none; NO_COAUTHOR_TRUST_REPO is unset. The
  // custom trailer must still be flagged (proves the homedir path is read
  // independent of the repo-config gate).
  var homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-check-home-'))
  fs.writeFileSync(
    path.join(homeDir, '.no-coauthorrc.json'),
    JSON.stringify({ names: ['MyAgent'], domains: ['mycorp.ai'] })
  )
  var dir = mkRepo()
  commit(dir, 'chore: base')
  commit(dir, 'feat: with custom bot trailer', 'Co-Authored-By: MyAgent <bot@mycorp.ai>')
  var r = runCheckCli(dir, 'HEAD~1..HEAD', { HOME: homeDir, USERPROFILE: homeDir })
  assert.equal(r.code, 1, 'homedir config must be honored without the trust flag')
  assert.match(r.out, /bot@mycorp\.ai/)
})

test('check: exits 2 with a clear error on an invalid range', function () {
  var dir = mkRepo()
  commit(dir, 'chore: only commit')
  var r = runCheckCli(dir, 'not-a-real-ref..HEAD')
  assert.equal(r.code, 2)
  assert.match(r.out, /failed to read git log/)
})