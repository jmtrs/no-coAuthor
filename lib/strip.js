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
// (all matching is case-insensitive):
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
// Built-in patterns in lib/patterns.js are regex fragments (they contain \.
// and |) and are used verbatim. User-supplied extras (opts.extra*) are treated
// as literal strings and escaped, so a config file can list `@myteam.ai`
// without knowing regex.
//
// Processing is line-based so removed trailers do not leave blank lines inside
// the trailer block (which would break git's trailer parsing).
function stripMessage(message, opts) {
  opts = opts || {}

  var baseNames = opts.names && opts.names.length ? opts.names : patterns.AI_NAMES
  var baseEmails = opts.emails && opts.emails.length ? opts.emails : patterns.BOT_EMAIL_PATTERNS
  var baseDomains = opts.domains && opts.domains.length ? opts.domains : patterns.AI_TOOL_DOMAINS

  var names = baseNames.concat(opts.extraNames || []).map(escapeRe)
  var emails = baseEmails.concat((opts.extraEmails || []).map(escapeRe))
  var domains = baseDomains.concat((opts.extraDomains || []).map(escapeRe))

  var nameAlt = names.join('|')
  var emailAlt = emails.join('|')
  var domainAlt = domains.join('|')

  var BOT_ADDRESS = '[^<]*<[^>]*(?:' + emailAlt + ')[^>]*>'
  var NAME_BOTSHAPE =
    '[^<]*(?:' + nameAlt + ')[^<]*<[^>]*(?:noreply|users\\.noreply\\.github\\.com|\\[bot\\])[^>]*>'
  var NAME_DOMAIN = '[^<]*(?:' + nameAlt + ')[^<]*<[^>]*(?:' + domainAlt + ')[^>]*>'

  var re = new RegExp(
    '^\\s*Co-Authored-By:\\s+(?:' + BOT_ADDRESS + '|' + NAME_BOTSHAPE + '|' + NAME_DOMAIN + ')$',
    'i'
  )

  var lines = message.split(/\r?\n/)
  var kept = []
  var blank = false
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (re.test(line)) continue
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
