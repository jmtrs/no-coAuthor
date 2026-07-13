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
  return String(s).replace(/\\w/g, '[[:alnum:]_]')
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
    'PAT=\'' + pat + '\'\n' +
    'TMP="${FILE}.nc.tmp"\n' +
    'grep -v -E "$PAT" "$FILE" 2>/dev/null | \\\n' +
    '  awk \'BEGIN{b=0} /^[[:space:]]*$/{b++; if(b==1)print; next}{b=0;print}\' | \\\n' +
    '  awk \'{lines[NR]=$0} END{while(NR>0 && lines[NR]~/^[[:space:]]*$/)NR--; for(i=1;i<=NR;i++)print lines[i]}\' > "$TMP"\n' +
    'if [ -s "$TMP" ]; then mv "$TMP" "$FILE"; else printf "" > "$FILE"; rm -f "$TMP"; fi\n' +
    'exit 0\n'
  )
}

module.exports = buildHook()
