'use strict'

// Runtime commit-msg hook entry point for frameworks that shell out to this
// package directly instead of using `install` (currently: pre-commit's
// `language: node` hooks — see .pre-commit-hooks.yaml). Unlike lib/hook.js,
// which BUILDS a self-contained script with no runtime dependency on this
// package, this module runs as this package, so it can require strip.js and
// patterns.js normally instead of inlining them.

var fs = require('fs')
var os = require('os')
var path = require('path')

var stripMessage = require('./strip').stripMessage
var ui = require('./ui')

function readConfig() {
  var extra = { extraNames: [], extraEmails: [], extraDomains: [], extraBanners: [] }
  // Homedir config is the user's own machine, always trusted. Repo-local
  // config (cwd) is NOT trusted by default: a cloned repo could ship a
  // .no-coauthorrc.json that strips real human co-author attribution.
  // Opt into repo config with NO_COAUTHOR_TRUST_REPO=1.
  var trustRepo =
    process.env.NO_COAUTHOR_TRUST_REPO === '1' || process.env.NO_COAUTHOR_TRUST_REPO === 'true'
  var candidates = [path.join(os.homedir(), '.no-coauthorrc.json')]
  if (trustRepo) candidates.push(path.join(process.cwd(), '.no-coauthorrc.json'))
  candidates.forEach(function (p) {
    try {
      var j = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (Array.isArray(j.names)) extra.extraNames = extra.extraNames.concat(j.names)
      if (Array.isArray(j.emails)) extra.extraEmails = extra.extraEmails.concat(j.emails)
      if (Array.isArray(j.domains)) extra.extraDomains = extra.extraDomains.concat(j.domains)
      if (Array.isArray(j.banners)) extra.extraBanners = extra.extraBanners.concat(j.banners)
    } catch (e) {}
  })
  return extra
}

// Same contract as the generated commit-msg hooks (lib/hook.js /
// lib/hook-posix.js): a bare commit message file path as the only argument,
// rewritten in place, and never a non-zero exit for our own failure — a
// pre-commit hook that can fail a commit for reasons unrelated to the
// message content would be worse than not stripping.
module.exports = function commitMsg(file) {
  if (!file) {
    ui.err('commit-msg: no commit message file given (this command is meant to be invoked by pre-commit, not run directly)')
    process.exit(0)
    return
  }
  try {
    var cfg = readConfig()
    var msg = fs.readFileSync(file, 'utf8')
    var cleaned = stripMessage(msg, cfg)
    if (cleaned !== msg) fs.writeFileSync(file, cleaned)
  } catch (e) {
    ui.err('commit-msg: ' + (e && e.message ? e.message : String(e)))
  }
  process.exit(0)
}
