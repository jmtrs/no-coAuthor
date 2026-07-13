'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var gitUtils = require('./git-utils')
var gitConfig = gitUtils.gitConfig
var gitRoot = gitUtils.gitRoot
var gitCommonDir = gitUtils.gitCommonDir

var ui = require('./ui')

var MANAGED = 'no-coauthor-managed'

function isManaged(content) {
  return content.indexOf(MANAGED) >= 0
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 })
  fs.chmodSync(filePath, 0o755)
}

// Shell wrapper that runs a preserved previous hook (commit-msg.orig) and then
// the no-coauthor hook (commit-msg.no-coauthor). Language-agnostic: the orig
// hook keeps its own shebang and is invoked directly.
function wrapperScript() {
  return (
    '#!/bin/sh\n' +
    '# ' + MANAGED + ' (wrapper installed by no-coauthor)\n' +
    '# Runs the previous commit-msg hook (if any), then the no-coauthor stripper.\n' +
    'DIR="$(cd "$(dirname "$0")" && pwd)"\n' +
    'if [ -f "$DIR/commit-msg.orig" ]; then\n' +
    '  "$DIR/commit-msg.orig" "$@" || exit $?\n' +
    'fi\n' +
    'if [ -f "$DIR/commit-msg.no-coauthor" ]; then\n' +
    '  "$DIR/commit-msg.no-coauthor" "$@" 2>/dev/null || true\n' +
    'fi\n' +
    'exit 0\n'
  )
}

function installAt(hooksDir, hookBody) {
  fs.mkdirSync(hooksDir, { recursive: true })
  var hookPath = path.join(hooksDir, 'commit-msg')
  var ncPath = path.join(hooksDir, 'commit-msg.no-coauthor')
  var origPath = path.join(hooksDir, 'commit-msg.orig')

  if (!fs.existsSync(hookPath)) {
    // No hook at all → standalone.
    writeExecutable(hookPath, hookBody)
    return 'installed'
  }

  var content = fs.readFileSync(hookPath, 'utf8')

  if (isManaged(content)) {
    // Already ours. Update the no-coauthor hook (wrapper case) or the
    // standalone file.
    if (fs.existsSync(ncPath) || fs.existsSync(origPath)) {
      writeExecutable(ncPath, hookBody)
      writeExecutable(hookPath, wrapperScript())
      return 'updated'
    }
    writeExecutable(hookPath, hookBody)
    return 'updated'
  }

  // A foreign hook exists → preserve it and install a wrapper.
  if (!fs.existsSync(origPath)) {
    fs.renameSync(hookPath, origPath)
    fs.chmodSync(origPath, 0o755)
  } else {
    // A foreign hook was already preserved at origPath from a previous
    // install, but commit-msg is foreign AGAIN (another tool — husky,
    // lefthook, a teammate — overwrote our wrapper). Never silently destroy
    // a hook we don't own: roll the older preserved one aside into the next
    // free .orig.N slot, then make the CURRENT foreign hook the live one the
    // wrapper invokes.
    fs.renameSync(origPath, backupPath(origPath))
    fs.renameSync(hookPath, origPath)
    fs.chmodSync(origPath, 0o755)
  }
  writeExecutable(ncPath, hookBody)
  writeExecutable(hookPath, wrapperScript())
  return 'wrapped'
}

// First free "<base>.<n>" path (n≥1), so we can tuck a previously-preserved
// foreign hook out of the way without clobbering an existing backup.
function backupPath(base) {
  var n = 1
  while (fs.existsSync(base + '.' + n)) n++
  return base + '.' + n
}

function versionedHooksDir(root, hooksDir) {
  return hooksDir.indexOf(path.join(root, '.git')) !== 0 && hooksDir.indexOf(root) === 0
}

function installLocal(noNode) {
  var hookBody = noNode ? require('./hook-posix') : require('./hook')

  var root
  try {
    root = gitRoot()
  } catch (e) {
    ui.err('not inside a git repository')
    process.exit(1)
  }

  var localHooksPath = gitConfig('--local core.hooksPath')
  var hooksDir
  if (localHooksPath) {
    hooksDir = path.isAbsolute(localHooksPath) ? localHooksPath : path.join(root, localHooksPath)
    ui.line('using local core.hooksPath: ' + localHooksPath)
  } else {
    hooksDir = path.join(gitCommonDir(), 'hooks')
    var globalHp = gitConfig('--global core.hooksPath')
    if (globalHp) {
      ui.warn(
        'global core.hooksPath is set to ' +
          globalHp +
          '; a per-project hook here will NOT run unless you set a local core.hooksPath (this affects EVERY repo on this machine without its own override, not just this one). Consider `no-coauthor install --global`.'
      )
    }
  }

  var result = installAt(hooksDir, hookBody)
  ui.say(true, 'hook ' + result + ' at ' + path.join(hooksDir, 'commit-msg'))

  if (versionedHooksDir(root, hooksDir)) {
    ui.warn(
      'hooks dir is inside the working tree; files may show as untracked. Commit them to share with your team, or add to .gitignore for personal use.'
    )
  }
}

function installGlobal(noNode) {
  var hookBody = noNode ? require('./hook-posix') : require('./hook')

  var existingGlobal = gitConfig('--global core.hooksPath')
  var globalDir
  if (existingGlobal) {
    globalDir = path.isAbsolute(existingGlobal) ? existingGlobal : path.join(os.homedir(), existingGlobal)
    ui.line('using existing global core.hooksPath: ' + existingGlobal)
  } else {
    globalDir = path.join(os.homedir(), '.git-hooks')
    execFileSync('git', ['config', '--global', 'core.hooksPath', globalDir])
  }

  var result = installAt(globalDir, hookBody)
  ui.say(true, 'global hook ' + result + ' at ' + path.join(globalDir, 'commit-msg'))
  ui.line('all git repos on this machine will strip AI co-author trailers')
  ui.line('repos with a local core.hooksPath are not affected by the global hook')
}

module.exports = function install(isGlobal, noNode) {
  if (isGlobal) installGlobal(noNode)
  else installLocal(noNode)
}

module.exports.MANAGED = MANAGED
