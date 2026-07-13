'use strict'

// Regenerates the HOOK_BODY here-doc embedded in install.sh from
// lib/hook-posix.js, which is itself generated from lib/patterns.js. Run
// this after any change to lib/patterns.js so the curl-installed hook
// (install.sh) matches the npm-installed one. test/install.test.js fails
// the build if these two ever drift.

var fs = require('fs')
var path = require('path')

var ui = require('../lib/ui')

var installShPath = path.join(__dirname, '..', 'install.sh')
var body = require('../lib/hook-posix').replace(/\n+$/, '')
var sh = fs.readFileSync(installShPath, 'utf8')
var marker = /<<'__NC_HOOK_EOF__'\n[\s\S]*?\n__NC_HOOK_EOF__/

if (!marker.test(sh)) {
  ui.err('sync-install-sh: HOOK_BODY here-doc not found in install.sh — did the delimiter change?')
  process.exit(1)
}

// Replacer is a FUNCTION, not a string: a string replacement makes
// String.prototype.replace interpret "$"-sequences in it as special patterns
// ($&, $', $`, $1, $$, ...) — body is generated regex source and can
// legitimately contain e.g. a trailing "...$'" (regex end-anchor followed by
// a shell quote), which was silently corrupting the embedded heredoc.
var updated = sh.replace(marker, function () {
  return "<<'__NC_HOOK_EOF__'\n" + body + '\n__NC_HOOK_EOF__'
})

if (updated === sh) {
  ui.line('sync-install-sh: install.sh already in sync with lib/hook-posix.js')
} else {
  fs.writeFileSync(installShPath, updated)
  ui.say(true, 'sync-install-sh: install.sh updated')
}
