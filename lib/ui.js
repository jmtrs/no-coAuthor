'use strict'

// Central console styling so every command (install/uninstall/status/check)
// prints in the same voice. picocolors auto-detects NO_COLOR / non-TTY output
// and no-ops in that case, so piped/CI output stays plain text — the regexes
// in test/*.test.js match substrings and are unaffected either way.
var pc = require('picocolors')

var TAG = pc.bold(pc.cyan('no-coauthor'))

// Plain informational line: "no-coauthor: <msg>"
function line(msg) {
  console.log(TAG + pc.dim(':') + ' ' + msg)
}

// Actionable warning: same shape as line(), yellow tag, so it stands out in
// a run of otherwise-neutral output without being mistaken for a failure.
function warn(msg) {
  console.log(pc.bold(pc.yellow('no-coauthor')) + pc.dim(':') + ' ' + msg)
}

// Hard error, goes to stderr.
function err(msg) {
  console.error(pc.bold(pc.red('no-coauthor')) + pc.dim(':') + ' ' + msg)
}

// Checklist item, e.g. under a "checking ..." header line.
function say(ok, msg) {
  console.log((ok ? pc.green('✔') : pc.red('✘')) + ' ' + msg)
}

module.exports = { pc: pc, line: line, warn: warn, err: err, say: say }
