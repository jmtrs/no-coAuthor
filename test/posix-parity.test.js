'use strict'

// Differential test: for every entry in lib/patterns.js, build a synthetic
// address/domain that the pattern is meant to match, then run it through
// BOTH the Node hook (ground truth — a real JS RegExp, always correct by
// construction) and the POSIX hook (translated to ERE by toPosixEre) and
// assert they agree.
//
// This exists because the per-case tests in strip.test.js / install.test.js
// only exercise a handful of hand-picked addresses. A translation bug in
// toPosixEre silently broke the Gemini/Bard `[\w.-]*` patterns while every
// hand-picked test still passed, because none of them happened to exercise
// that exact pattern. Looping over every pattern.js entry means a future
// pattern that breaks the POSIX translation fails here automatically,
// without needing a hand-written case for it.

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var patterns = require('../lib/patterns')
var nodeHook = require('../lib/hook')
var posixHook = require('../lib/hook-posix')

// Turns a regex fragment from patterns.js into one concrete string it
// matches. Only supports the constructs actually used there: escaped
// literal chars (\.), a single-level alternation group ((a|b|c)), and a
// `[...]*` character class (replaced with a short alnum filler that
// satisfies \w-based classes). Extend this if patterns.js grows new syntax.
function sampleFromFragment(fragment) {
  return fragment
    .replace(/\\(.)/g, '$1')
    .replace(/\(([^)]+)\)/g, function (_, alts) {
      return alts.split('|')[0]
    })
    .replace(/\[[^\]]*\]\*/g, 'id')
}

function runHook(hookScript, runtime, message) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-parity-'))
  try {
    var hookFile = path.join(dir, 'commit-msg')
    var msgFile = path.join(dir, 'MSG')
    fs.writeFileSync(hookFile, hookScript, { mode: 0o755 })
    fs.chmodSync(hookFile, 0o755)
    fs.writeFileSync(msgFile, message)
    execFileSync(runtime, [hookFile, msgFile], { env: Object.assign({}, process.env, { HOME: dir }) })
    return fs.readFileSync(msgFile, 'utf8')
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {}
  }
}

;(process.platform === 'win32' ? test.skip : test)(
  'every BOT_EMAIL_PATTERNS entry strips identically under Node and POSIX hooks',
  function () {
    patterns.BOT_EMAIL_PATTERNS.forEach(function (fragment) {
      var email = sampleFromFragment(fragment)
      var message = 'fix: x\n\nCo-Authored-By: SomeBot <' + email + '>\nCo-Authored-By: Jane Doe <jane@example.com>\n'

      var nodeOut = runHook(nodeHook, 'node', message)
      var posixOut = runHook(posixHook, 'sh', message)

      assert.ok(
        nodeOut.indexOf(email) === -1,
        'sanity: Node hook did not strip sample "' + email + '" from pattern "' + fragment + '" — sample generator produced a non-matching string'
      )
      assert.ok(
        posixOut.indexOf(email) === -1,
        'POSIX hook failed to strip "' + email + '" (from BOT_EMAIL_PATTERNS entry "' + fragment + '") — toPosixEre likely mistranslated this fragment'
      )
      assert.match(nodeOut, /jane@example\.com/)
      assert.match(posixOut, /jane@example\.com/)
    })
  }
)

;(process.platform === 'win32' ? test.skip : test)(
  'every AI_TOOL_DOMAINS entry strips identically under Node and POSIX hooks (name + domain, rule C)',
  function () {
    patterns.AI_TOOL_DOMAINS.forEach(function (fragment) {
      var domain = sampleFromFragment(fragment)
      var email = 'bot@' + domain
      // "Oz" is a fixed AI_NAMES entry unrelated to any specific domain —
      // rule C only requires *some* AI name plus a known tool domain.
      var message = 'fix: x\n\nCo-Authored-By: Oz <' + email + '>\nCo-Authored-By: Jane Doe <jane@example.com>\n'

      var nodeOut = runHook(nodeHook, 'node', message)
      var posixOut = runHook(posixHook, 'sh', message)

      assert.ok(
        nodeOut.indexOf(email) === -1,
        'sanity: Node hook did not strip sample "' + email + '" from domain "' + fragment + '"'
      )
      assert.ok(
        posixOut.indexOf(email) === -1,
        'POSIX hook failed to strip "' + email + '" (from AI_TOOL_DOMAINS entry "' + fragment + '") — toPosixEre likely mistranslated this fragment'
      )
      assert.match(nodeOut, /jane@example\.com/)
      assert.match(posixOut, /jane@example\.com/)
    })
  }
)
