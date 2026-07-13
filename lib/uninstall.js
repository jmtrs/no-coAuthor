'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var execSync = require('child_process').execSync

var install = require('./install')
var MANAGED = install.MANAGED

var gitUtils = require('./git-utils')
var gitConfig = gitUtils.gitConfig
var gitRoot = gitUtils.gitRoot
var gitCommonDir = gitUtils.gitCommonDir

function resolveHooksDir(isGlobal) {
  if (isGlobal) {
    var g = gitConfig('--global core.hooksPath')
    return g
      ? path.isAbsolute(g)
        ? g
        : path.join(os.homedir(), g)
      : path.join(os.homedir(), '.git-hooks')
  }
  var root = gitRoot()
  var local = gitConfig('--local core.hooksPath')
  return local ? (path.isAbsolute(local) ? local : path.join(root, local)) : path.join(gitCommonDir(), 'hooks')
}

function rmIfExists(p) {
  try {
    fs.unlinkSync(p)
  } catch (e) {}
}

module.exports = function uninstall(isGlobal) {
  var hooksDir
  try {
    hooksDir = resolveHooksDir(isGlobal)
  } catch (e) {
    console.error('no-coauthor: not inside a git repository')
    process.exit(1)
  }

  var hookPath = path.join(hooksDir, 'commit-msg')
  var ncPath = path.join(hooksDir, 'commit-msg.no-coauthor')
  var origPath = path.join(hooksDir, 'commit-msg.orig')

  if (!fs.existsSync(hookPath)) {
    console.log('no-coauthor: no hook found at ' + hookPath)
    return
  }

  var content = fs.readFileSync(hookPath, 'utf8')
  if (content.indexOf(MANAGED) < 0) {
    console.log('no-coauthor: commit-msg hook exists but was not installed by no-coauthor')
    return
  }

  if (fs.existsSync(origPath)) {
    // Wrapper case with a preserved foreign hook → restore it.
    fs.renameSync(origPath, hookPath)
    fs.chmodSync(hookPath, 0o755)
    rmIfExists(ncPath)
    console.log('no-coauthor: restored previous hook at ' + hookPath)
  } else {
    // Standalone case → remove our hook (and any stale nc file).
    rmIfExists(hookPath)
    rmIfExists(ncPath)
    console.log('no-coauthor: hook removed at ' + hookPath)
  }

  if (isGlobal) {
    try {
      if (fs.readdirSync(hooksDir).length === 0) {
        fs.rmdirSync(hooksDir)
        execSync('git config --global --unset core.hooksPath')
        console.log('no-coauthor: empty global hooks dir removed and core.hooksPath unset')
      }
    } catch (e) {}
  }
}
