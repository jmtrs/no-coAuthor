'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')

var stripMessage = require('../lib/strip').stripMessage

function stripCount(msg) {
  var before = msg.split('\n').filter(function (l) {
    return /Co-Authored-By/i.test(l)
  }).length
  var out = stripMessage(msg)
  var after = out.split('\n').filter(function (l) {
    return /Co-Authored-By/i.test(l)
  }).length
  return { out: out, removed: before - after }
}

test('strips Oz (warp.dev) — the original bug', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\n')
  assert.equal(r.removed, 1)
  assert.equal(r.out, 'fix: x\n')
})

test('strips Claude noreply', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Copilot noreply github', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: GitHub Copilot <223556219+Copilot@users.noreply.github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Copilot direct address', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Copilot <copilot@github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Cursor non-noreply via name+domain', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Cursor <agent@cursor.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Gemini noreply google via name+botshape', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Gemini <noreply@google.com>\n')
  assert.equal(r.removed, 1)
})

test('preserves a human literally named Claude with a real email', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Claude Smith <claude.smith@gmail.com>\n')
  assert.equal(r.removed, 0)
  assert.match(r.out, /Claude Smith/)
})

test('preserves a Googler named Claude (no google.com in domain list)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Claude <claude@google.com>\n')
  assert.equal(r.removed, 0)
})

test('preserves a Cursor employee whose name is not an AI name', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Jane <jane@cursor.com>\n')
  assert.equal(r.removed, 0)
})

test('preserves a normal human co-author', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Jane Doe <jane@example.com>\n')
  assert.equal(r.removed, 0)
})

test('mixed: strips AI, keeps human and Signed-off-by, no blank inside trailer block', function () {
  var msg =
    'feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' +
    'Co-Authored-By: Jane Doe <jane@example.com>\nSigned-off-by: Real <real@example.com>\n'
  var out = stripMessage(msg)
  assert.doesNotMatch(out, /noreply@anthropic/)
  assert.match(out, /Jane Doe <jane@example\.com>/)
  assert.match(out, /Signed-off-by: Real/)
  // No blank line between the kept co-author and Signed-off-by.
  assert.doesNotMatch(out, /jane@example\.com>\n\nSigned-off-by/)
})

test('preserves Refs, Closes, Signed-off-by; strips only AI line', function () {
  var msg =
    'fix: y\n\nRefs CHAOS-1\nCloses CHAOS-2\nSigned-off-by: Real <real@example.com>\n' +
    'Co-Authored-By: Cursor <noreply@cursor.com>\n'
  var out = stripMessage(msg)
  assert.match(out, /Refs CHAOS-1/)
  assert.match(out, /Closes CHAOS-2/)
  assert.match(out, /Signed-off-by: Real/)
  assert.doesNotMatch(out, /noreply@cursor\.com/)
})

test('idempotent: running twice equals running once', function () {
  var msg = 'feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: Jane Doe <jane@example.com>\n'
  assert.equal(stripMessage(stripMessage(msg)), stripMessage(msg))
})

test('clean message without trailers is unchanged (single trailing newline)', function () {
  var out = stripMessage('chore: n\n\nBody line.\n')
  assert.equal(out, 'chore: n\n\nBody line.\n')
})

test('collapses multiple blank lines left after removal', function () {
  var msg = 'fix: x\n\n\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\n'
  var out = stripMessage(msg)
  assert.equal(out, 'fix: x\n')
})

test('custom extra names/domains via opts (literal, escaped)', function () {
  var out = stripMessage('fix: x\n\nCo-Authored-By: MyBot <bot@mytools.dev>\n', {
    extraNames: ['MyBot'],
    extraDomains: ['mytools.dev']
  })
  assert.equal(out, 'fix: x\n')
})

test('case-insensitive matching', function () {
  var r = stripCount('fix: x\n\nco-authored-by: claude <noreply@anthropic.com>\n')
  assert.equal(r.removed, 1)
})
