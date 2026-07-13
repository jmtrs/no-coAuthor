'use strict'

var patterns = require('./patterns')

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Remove AI co-author trailers from a git commit message while preserving
// human Co-Authored-By lines and all other trailers (Signed-off-by, Refs,
// Closes, etc.).
//
// A `Co-Authored-By: Name <email>` line is stripped when ANY of these holds
// (all matching is case-insensitive and line-anchored):
//
//   A. BOT_ADDRESS — the <email> matches a known bot address/domain
//      (copilot@github.com, noreply@anthropic.com, oz-agent@warp.dev, ...).
//      High confidence: no human co-author uses these.
//
//   B. NAME_BOTSHAPE — the name matches a known AI tool name AND the email is
//      bot-shaped (noreply / users.noreply.github.com / [bot]).
//
//   C. NAME_DOMAIN — the name matches a known AI tool name AND the email
//      domain is a known AI-tool domain. Catches non-noreply bot addresses
//      (e.g. `Oz <oz-agent@warp.dev>`). A same-domain co-author whose name is
//      NOT an AI name is preserved (e.g. `Jane <jane@cursor.com>`).
//
// A name match alone (without a bot-shaped email or tool domain) NEVER strips,
// so a human named "Claude <claude@gmail.com>" is kept.
//
// Built-in patterns in lib/patterns.js are regex fragments (used verbatim).
// User-supplied extras (opts.extra*) are treated as literal strings and
// escaped, so a config file can list `@myteam.ai` without knowing regex.
//
// Processing is line-based so removed trailers do not leave blank lines inside
// the trailer block (which would break git's trailer parsing).
function stripMessage(message, opts) {
  opts = opts || {}

  // No legitimate `Co-Authored-By: Name <email>` line comes anywhere close
  // to this long (git author names/emails are practically always well under
  // 200 chars). The matching regex below has the shape `.*NAME_ALT.*<...>`,
  // and NAME_ALT is an alternation of ~50 names — on a very long line with
  // no early `<`, the backtracking engine retries the alternation at O(n)
  // positions, each an O(n) scan, i.e. O(n^2). A single adversarial or
  // buggy-tool-generated line (no newlines required, so message-size limits
  // don't help) can turn a `git commit` into a multi-second-to-minutes hang.
  // Skipping the match above this bound removes the quadratic blowup at the
  // source without changing behavior for any real trailer. Declared inside
  // the function (not module scope) because lib/hook.js inlines this
  // function's source via .toString() into the generated hook script, which
  // would not see an outer module-scope var.
  var MAX_TRAILER_LINE_LENGTH = 500

  var baseNames = opts.names && opts.names.length ? opts.names : patterns.AI_NAMES
  var baseEmails = opts.emails && opts.emails.length ? opts.emails : patterns.BOT_EMAIL_PATTERNS
  var baseDomains = opts.domains && opts.domains.length ? opts.domains : patterns.AI_TOOL_DOMAINS

  var names = baseNames.concat(opts.extraNames || []).map(escapeRe)
  var emails = baseEmails.concat((opts.extraEmails || []).map(escapeRe))
  var domains = baseDomains.concat((opts.extraDomains || []).map(escapeRe))

  var nameAlt = names.join('|')
  var emailAlt = emails.join('|')
  var domainAlt = domains.join('|')

  var BOT_ADDRESS = '[^<\\n]*<[^>]*(?:' + emailAlt + ')[^>]*>'
  var NAME_BOTSHAPE =
    '[^<\\n]*(?:' + nameAlt + ')[^<\\n]*<[^>]*(?:noreply|users\\.noreply\\.github\\.com|\\[bot\\])[^>]*>'
  var NAME_DOMAIN = '[^<\\n]*(?:' + nameAlt + ')[^<\\n]*<[^>]*(?:' + domainAlt + ')[^>]*>'

  var re = new RegExp(
    // Trailing whitespace after the closing `>` is tolerated (`\\s*$`, not
    // `$`): a Co-Authored-By trailer committed with --cleanup=verbatim (or
    // via a tool that bypasses git's default strip cleanup) can carry a
    // trailing space/tab, which would otherwise let a bot trailer escape
    // stripping.
    '^\\s*Co-Authored-By:\\s+(?:' + BOT_ADDRESS + '|' + NAME_BOTSHAPE + '|' + NAME_DOMAIN + ')\\s*$',
    'i'
  )

  var lines = message.split(/\r?\n/)
  var kept = []
  var blank = false
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (line.length <= MAX_TRAILER_LINE_LENGTH && re.test(line)) continue
    if (line.trim() === '') {
      if (!blank) kept.push(line)
      blank = true
    } else {
      kept.push(line)
      blank = false
    }
  }
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop()
  return kept.length ? kept.join('\n') + '\n' : ''
}

module.exports = { stripMessage: stripMessage, escapeRe: escapeRe }
