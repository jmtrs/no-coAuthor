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

test('strips OpenAI Codex default trailer (noreply@openai.com)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Codex <noreply@openai.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Codex with model-suffixed name', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Codex CLI (gpt-5-codex) <noreply@openai.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Codex GitHub noreply form', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Codex <267193182+codex@users.noreply.github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Cursor cloud agent (cursoragent@cursor.com)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Cursor Agent <cursoragent@cursor.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Gemini Code Assist (gemini-code-assist@google.com)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Gemini <gemini-code-assist@google.com>\n')
  assert.equal(r.removed, 1)
})

test('strips gemini-code-assist[bot] GitHub form', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Copilot[bot] GitHub noreply form', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: GitHub Copilot <198982749+Copilot[bot]@users.noreply.github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips amazon-q[bot] GitHub form', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: amazon-q[bot] <123+amazon-q[bot]@users.noreply.github.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Devin (devin@cognition.dev)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Devin <devin@cognition.dev>\n')
  assert.equal(r.removed, 1)
})

test('strips Sourcegraph Cody', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Cody <noreply@sourcegraph.com>\n')
  assert.equal(r.removed, 1)
})

test('strips Claude with model-suffixed name (Claude Opus 4.6)', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\n')
  assert.equal(r.removed, 1)
})

test('preserves a human named Devin with a normal email', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Devin Jones <devin@gmail.com>\n')
  assert.equal(r.removed, 0)
})

test('preserves a human named Cody with a normal email', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Cody Smith <cody@gmail.com>\n')
  assert.equal(r.removed, 0)
})

test('preserves a Googler with a non-bot @google.com email', function () {
  var r = stripCount('fix: x\n\nCo-Authored-By: Pat <pat@google.com>\n')
  assert.equal(r.removed, 0)
})

test('strips a bot trailer with trailing whitespace (--cleanup=verbatim)', function () {
  // Regression: the regex used to anchor `>$`, so a trailer committed with
  // --cleanup=verbatim (which keeps trailing spaces git's default strip would
  // remove) escaped stripping. Now tolerates trailing whitespace via `>\s*$`.
  var r = stripCount('fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>   \n')
  assert.equal(r.removed, 1)
  var r2 = stripCount('fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\t\n')
  assert.equal(r2.removed, 1)
})

test('strips Claude Code banner line with emoji', function () {
  var out = stripMessage('feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n')
  assert.equal(out, 'feat: x\n')
})

test('strips Claude Code banner line without emoji', function () {
  var out = stripMessage('feat: x\n\nGenerated with [Claude Code](https://claude.com/claude-code)\n')
  assert.equal(out, 'feat: x\n')
})

test('strips legacy Claude Code banner link (claude.ai/code)', function () {
  var out = stripMessage('feat: x\n\n🤖 Generated with [Claude Code](https://claude.ai/code)\n')
  assert.equal(out, 'feat: x\n')
})

test('strips banner and trailer together, keeps human co-author', function () {
  var msg =
    'feat: x\n\nBody text.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' +
    'Co-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: Jane Doe <jane@example.com>\n'
  var out = stripMessage(msg)
  assert.match(out, /Body text\./)
  assert.match(out, /Jane Doe <jane@example\.com>/)
  assert.doesNotMatch(out, /Generated with/)
  assert.doesNotMatch(out, /noreply@anthropic/)
})

test('does not strip a human-written line that merely mentions Claude Code', function () {
  var out = stripMessage('feat: x\n\nMigrated our old script to use Claude Code instead of manual review.\n')
  assert.match(out, /Migrated our old script/)
})

test('custom extra banner via opts (literal, escaped)', function () {
  var out = stripMessage('fix: x\n\nGenerated by MyBot v2 (mybot.dev)\n', {
    extraBanners: ['Generated by MyBot v2 (mybot.dev)']
  })
  assert.equal(out, 'fix: x\n')
})

test('does not hang on an adversarial long line (ReDoS-lite guard)', function () {
  // Regression test for a real O(n^2) backtracking blowup: a line shaped
  // like "Co-Authored-By: " + many repeats of an AI name + " <notreal>" made
  // the combined name-alternation regex take ~4s at 160KB and scaled
  // quadratically (measured: 24KB/88ms, 64KB/623ms, 160KB/3915ms — ratios
  // matched size^2). At 1MB this reaches multi-minute territory, hanging any
  // `git commit`. The fix skips matching on lines over
  // MAX_TRAILER_LINE_LENGTH (500 chars); this test asserts that guard keeps
  // holding, not the exact threshold value.
  var evil = 'Co-Authored-By: ' + 'Claude a'.repeat(20000) + ' <notreal>'
  var msg = 'fix: x\n\n' + evil + '\nCo-Authored-By: Jane Doe <jane@example.com>\n'
  var t0 = Date.now()
  var out = stripMessage(msg)
  var elapsed = Date.now() - t0
  assert.ok(elapsed < 200, 'stripMessage took ' + elapsed + 'ms on a 160KB adversarial line — quadratic blowup regression?')
  // Over-length line is left untouched (never matched a real trailer shape
  // anyway — it has no valid bot email), and the real human trailer after it
  // is unaffected.
  assert.match(out, /Claude a/)
  assert.match(out, /jane@example\.com/)
})
