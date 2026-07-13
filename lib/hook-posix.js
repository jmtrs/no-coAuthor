'use strict'

// Builds the POSIX shell fallback commit-msg hook (used when Node.js is not
// available). Best-effort: the Node.js hook is preferred because it matches
// precisely and reads .no-coauthorrc.json. This fallback inlines a combined
// ERE built from the same pattern constants and collapses blank lines with
// awk. It does not read a config file.
//
// \w in the built-in patterns is not POSIX ERE, so it is translated to
// [[:alnum:]_] when building the ERE.
//
// IMPORTANT: the name alternation must be wrapped in a group before
// concatenating the trailing conditions, otherwise `A|B|C.*x` parses as
// `A` OR `B` OR `C.*x` and a bare AI name (e.g. a human named "Claude")
// would match without the bot-email/domain guard.

var patterns = require('./patterns')
var strip = require('./strip')

function toPosixEre(s) {
  // JS regex shorthand escapes that are not POSIX ERE. \w/\d/\s become POSIX
  // character classes; other escapes (\. \( …) are portable as-is in ERE.
  //
  // A shorthand that already sits inside a JS bracket expression (e.g.
  // `[\w.-]`, `[^\s@]`) must have its POSIX class token merged into that SAME
  // bracket (`[[:alnum:]_.-]`, `[^[:space:]@]`) — nesting a fresh `[...]`
  // inside it (`[[[:alnum:]_].-]`) is invalid ERE: the inner class's closing
  // `]` ends up closing the OUTER bracket early, and the rest (e.g. `.-`)
  // leaks out as literal/metacharacter text. That silently broke matching
  // for every pattern that combined \w or \s with literal chars in one class
  // (e.g. the Gemini/Bard `[\w.-]*@google.com` patterns matched nothing).
  return String(s)
    .replace(/\[(\^?)([^\]]*)\]/g, function (_, neg, body) {
      body = body
        .replace(/\\w/g, '[:alnum:]_')
        .replace(/\\d/g, '[:digit:]')
        .replace(/\\s/g, '[:space:]')
      return '[' + neg + body + ']'
    })
    .replace(/\\w/g, '[[:alnum:]_]')
    .replace(/\\W/g, '[^[:alnum:]_]')
    .replace(/\\d/g, '[[:digit:]]')
    .replace(/\\D/g, '[^[:digit:]]')
    .replace(/\\s/g, '[[:space:]]')
    .replace(/\\S/g, '[^[:space:]]')
}

function buildHook() {
  var names = patterns.AI_NAMES.map(strip.escapeRe)
  var emails = patterns.BOT_EMAIL_PATTERNS.map(toPosixEre)
  var domains = patterns.AI_TOOL_DOMAINS.map(toPosixEre)

  var nameAlt = names.join('|')
  var emailAlt = emails.join('|')
  var domainAlt = domains.join('|')

  // Remove a Co-Authored-By line when it contains a bot address, or an AI name
  // plus a bot-shaped email, or an AI name plus a known tool domain. The name
  // alternations are grouped so the trailing conditions apply to every name.
  var pat =
    '^[[:space:]]*Co-Authored-By:.*(' +
    '<[^>]*(' + emailAlt + ')[^>]*>' +
    '|(' + nameAlt + ').*(noreply|users\\.noreply\\.github\\.com|\\[bot\\])' +
    '|(' + nameAlt + ').*(<[^>]*(' + domainAlt + ')|' + domainAlt + ')' +
    ')'

  return (
    '#!/bin/sh\n' +
    '# no-coauthor-managed (do not remove; used by uninstall)\n' +
    '# no-coauthor — strips AI co-author trailers (POSIX fallback).\n' +
    '# Node.js hook is preferred; this is best-effort when Node is unavailable.\n' +
    'FILE="$1"\n' +
    '[ -z "$FILE" ] && exit 0\n' +
    '[ ! -f "$FILE" ] && exit 0\n' +
    '# NO_COAUTHOR_DISABLE=1 disables just this hook for one commit/session,\n' +
    '# unlike --no-verify which skips every hook (including any preserved\n' +
    '# foreign one this may be wrapping).\n' +
    '[ -n "${NO_COAUTHOR_DISABLE:-}" ] && exit 0\n' +
    'PAT=\'' + pat + '\'\n' +
    'TMP="${FILE}.nc.tmp"\n' +
    '# Strip only short Co-Authored-By lines. The combined name-alternation ERE\n' +
    '# is O(n^2) on a long line with no "<", which can hang a `git commit` on a\n' +
    '# single adversarial or buggy-tool-generated line (no newlines required, so\n' +
    '# message-size limits don\'t help). The length($0) guard short-circuits\n' +
    '# before the regex ever runs on a long line, mirroring the Node hook\'s\n' +
    '# MAX_TRAILER_LINE_LENGTH. Lines over 500 chars are left untouched.\n' +
    '# PAT is passed via ENVIRON (not -v) so backslash escapes in the ERE survive\n' +
    '# verbatim; tolower() on both sides gives POSIX-awk case-insensitivity\n' +
    '# without the gawk-only IGNORECASE.\n' +
    'PAT_ERE="$PAT" awk \'\n' +
    'BEGIN { PAT = tolower(ENVIRON["PAT_ERE"]) }\n' +
    'length($0) <= 500 && tolower($0) ~ PAT { next }\n' +
    '{ print }\n' +
    '\' "$FILE" 2>/dev/null | \\\n' +
    '  awk \'BEGIN{b=0} /^[[:space:]]*$/{b++; if(b==1)print; next}{b=0;print}\' | \\\n' +
    '  awk \'{lines[NR]=$0} END{while(NR>0 && lines[NR]~/^[[:space:]]*$/)NR--; for(i=1;i<=NR;i++)print lines[i]}\' > "$TMP"\n' +
    'if [ -s "$TMP" ]; then mv "$TMP" "$FILE"; else printf "" > "$FILE"; rm -f "$TMP"; fi\n' +
    'exit 0\n'
  )
}

module.exports = buildHook()
