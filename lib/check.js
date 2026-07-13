'use strict'

// Server-side companion to the commit-msg hook: scans a range of ALREADY-MADE
// commits for AI co-author trailers and exits non-zero if any are found.
//
// The commit-msg hook is a client-side, opt-in, always-bypassable safety net
// (`git commit --no-verify`, NO_COAUTHOR_DISABLE=1, or simply never installing
// it in the first place all skip it). Nothing that runs on the committer's own
// machine can be made bypass-proof against that same machine. `check` is meant
// to run in CI instead: as a required status check on a pull request, it can't
// be talked out of failing by anything that happened locally, because it reads
// the commits that already exist, from GitHub's copy of the repo, after the
// push already happened. See the "Server-side enforcement" section of the
// README and examples/reject-ai-coauthor.yml for how to wire this up so it
// actually blocks a merge (a status check alone does not block anything
// without a branch protection rule requiring it).
//
// Reuses the exact same stripMessage() used by the hooks, so detection can
// never silently drift between "what the hook would have stripped" and "what
// this check flags" the way the Node/POSIX hooks once did before
// test/posix-parity.test.js existed.

var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var stripMessage = require('./strip').stripMessage

// Parsing delimiters. SEP is NUL: a git commit message body cannot contain a
// NUL (git uses it to terminate the object header and rejects it in messages),
// so it is the one byte guaranteed never to collide with a commit's contents.
// We can't put a literal NUL in the git --format ARGUMENT (argv is C strings;
// execFileSync rejects NUL bytes), so the format string uses git's own `%x00`
// escape to make git EMIT a NUL between records; here we split that output on
// '\x00'. FIELD_SEP (\x1f, ASCII Unit Separator) splits the SHA from the body
// within a record; the body may legally contain \x1f, so we always split on
// the FIRST \x1f only (the SHA before it is 40 hex and can never hold \x1f).
var SEP = '\x00'
var FIELD_SEP = '\x1f'

function readConfig() {
  var extra = { extraNames: [], extraEmails: [], extraDomains: [] }
  // Homedir config is the user's own machine → always trusted. Repo-local
  // config (cwd) is NOT trusted by default: a cloned repo could ship a
  // .no-coauthorrc.json that strips real human co-author attribution, which
  // is exactly what this tool exists to protect. Opt into repo config with
  // NO_COAUTHOR_TRUST_REPO=1 (e.g. in CI for a team-shared config you control).
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
    } catch (e) {}
  })
  return extra
}

function commitsInRange(range) {
  var out
  try {
    out = execFileSync('git', ['log', '--format=%H%x1f%B%x00', range], { encoding: 'utf8' })
  } catch (e) {
    console.error('no-coauthor check: failed to read git log for range "' + range + '"')
    console.error((e.stderr || e.message || String(e)).toString().trim())
    process.exit(2)
  }
  return out
    .split(SEP)
    .map(function (chunk) {
      return chunk.replace(/^\n/, '')
    })
    .filter(function (chunk) {
      return chunk.trim() !== ''
    })
    .map(function (chunk) {
      var idx = chunk.indexOf(FIELD_SEP)
      return { sha: chunk.slice(0, idx), message: chunk.slice(idx + FIELD_SEP.length) }
    })
}

module.exports = function check(range) {
  range = range || 'HEAD~1..HEAD'
  var cfg = readConfig()
  var commits = commitsInRange(range)

  if (commits.length === 0) {
    console.log('no-coauthor check: no commits in range "' + range + '"')
    process.exit(0)
  }

  var offenders = []
  commits.forEach(function (c) {
    if (stripMessage(c.message, cfg) !== c.message) offenders.push(c)
  })

  if (offenders.length === 0) {
    console.log(
      'no-coauthor check: ' + commits.length + ' commit(s) in range "' + range + '" — no AI co-author trailers found'
    )
    process.exit(0)
  }

  console.error('no-coauthor check: found AI co-author trailers in ' + offenders.length + ' commit(s):')
  offenders.forEach(function (c) {
    console.error('')
    console.error('  ' + c.sha.slice(0, 12))
    c.message.split('\n').forEach(function (line) {
      if (/Co-Authored-By/i.test(line)) console.error('    ' + line.trim())
    })
  })
  console.error('')
  console.error('no-coauthor check: reject this PR, or amend/rebase to remove the trailers before merging')
  process.exit(1)
}
