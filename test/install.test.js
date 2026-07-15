'use strict'

var test = require('node:test').test
var assert = require('node:assert/strict')
var fs = require('fs')
var os = require('os')
var path = require('path')
var execFileSync = require('child_process').execFileSync

// Isolate every git config read/write this file's process makes from the
// real machine's ~/.gitconfig — notably core.hooksPath, which a real
// `no-coauthor install --global` run on this dev machine sets persistently
// and would otherwise shadow every local install these tests perform,
// failing them for reasons that have nothing to do with the code under
// test. GIT_CONFIG_GLOBAL is git's own supported override (2.32+) for this.
var fakeGlobalGitConfig = path.join(os.tmpdir(), 'nc-install-test-empty-gitconfig-' + process.pid)
fs.writeFileSync(fakeGlobalGitConfig, '')
process.env.GIT_CONFIG_GLOBAL = fakeGlobalGitConfig

var install = require('../lib/install')
var uninstall = require('../lib/uninstall')

function mkRepo() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  return dir
}

function withCwd(dir, fn) {
  var prev = process.cwd()
  process.chdir(dir)
  try {
    fn()
  } finally {
    process.chdir(prev)
  }
}

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

// lib/install.js calls process.exit() on refusal, so drive it out-of-process
// via the CLI (like a user) and inspect the real exit code + output.
function runInstallCli(dir, args) {
  var bin = path.join(__dirname, '..', 'bin', 'no-coauthor.js')
  try {
    var out = execFileSync('node', [bin, 'install'].concat(args || []), { cwd: dir, encoding: 'utf8' })
    return { code: 0, out: out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

test('standalone install when no commit-msg exists, then uninstall removes it', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.orig')))
  withCwd(dir, function () {
    uninstall(false)
  })
  assert.ok(!exists(path.join(hooks, 'commit-msg')))
})

test('re-install is idempotent (updated, single hook file)', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  withCwd(dir, function () {
    install(false, false)
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  withCwd(dir, function () {
    uninstall(false)
  })
})

test('foreign hook is preserved via wrapper and restored on uninstall', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  var foreign = '#!/bin/sh\necho FOREIGN RAN\n'
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreign, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(hooks, 'commit-msg')))
  assert.ok(exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(exists(path.join(hooks, 'commit-msg.orig')))
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg.orig'), 'utf8'), foreign)
  withCwd(dir, function () {
    uninstall(false)
  })
  // Foreign hook restored as commit-msg.
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg'), 'utf8'), foreign)
  assert.ok(!exists(path.join(hooks, 'commit-msg.no-coauthor')))
  assert.ok(!exists(path.join(hooks, 'commit-msg.orig')))
})

test('respects local core.hooksPath (.githooks) and installs there', function () {
  var dir = mkRepo()
  var gh = path.join(dir, '.githooks')
  fs.mkdirSync(gh, { recursive: true })
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir })
  withCwd(dir, function () {
    install(false, false)
  })
  assert.ok(exists(path.join(gh, 'commit-msg')))
  assert.ok(!exists(path.join(dir, '.git', 'hooks', 'commit-msg')))
  withCwd(dir, function () {
    uninstall(false)
  })
  assert.ok(!exists(path.join(gh, 'commit-msg')))
})

test('end-to-end real git commit strips AI trailer and keeps human', function () {
  var dir = mkRepo()
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x')
  execFileSync('git', ['add', 'f.txt'], { cwd: dir })
  withCwd(dir, function () {
    install(false, false)
  })
  execFileSync(
    'git',
    ['commit', '-q', '--allow-empty', '-m', 'feat: e2e', '-m', 'Co-Authored-By: Oz <oz-agent@warp.dev>', '-m', 'Co-Authored-By: Jane Doe <jane@example.com>'],
    { cwd: dir }
  )
  var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' })
  assert.doesNotMatch(body, /oz-agent@warp\.dev/)
  assert.match(body, /jane@example\.com/)
  withCwd(dir, function () {
    uninstall(false)
  })
})

// Regression test for a real crash: `.git` in a worktree or submodule is a
// TEXT FILE ("gitdir: /real/path"), not a directory. The old code assumed
// `<root>/.git/hooks` is always a valid path to mkdir into, which threw
// ENOTDIR from both `git worktree add` and `git submodule add` — confirmed
// by hand before this fix existed. git itself shares hooks across worktrees
// via the repo's "common dir" (confirmed empirically: a hook placed in the
// main repo's .git/hooks fires when committing from a linked worktree), so
// that's also the directory install/uninstall/status must resolve to.
test('install/uninstall/status work from a worktree, sharing the main repo hooks dir', function () {
  var dir = mkRepo()
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'chore: base'], { cwd: dir })
  execFileSync('git', ['branch', 'feature'], { cwd: dir })
  var wtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-worktree-'))
  fs.rmdirSync(wtDir)
  execFileSync('git', ['worktree', 'add', '-q', wtDir, 'feature'], { cwd: dir })

  try {
    withCwd(wtDir, function () {
      install(false, false)
    })

    // Installed into the MAIN repo's .git/hooks, not (nonexistent as a dir)
    // <worktree>/.git/hooks.
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'commit-msg')))

    execFileSync(
      'git',
      ['commit', '-q', '--allow-empty', '-m', 'feat: from worktree', '-m', 'Co-Authored-By: Claude <noreply@anthropic.com>'],
      { cwd: wtDir }
    )
    var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: wtDir, encoding: 'utf8' })
    assert.doesNotMatch(body, /noreply@anthropic\.com/, 'the shared hook should have stripped this commit made from the worktree')

    var statusOut
    try {
      statusOut = execFileSync('node', [path.join(__dirname, '..', 'bin', 'no-coauthor.js'), 'status'], {
        cwd: wtDir,
        encoding: 'utf8'
      })
    } catch (e) {
      statusOut = (e.stdout || '') + (e.stderr || '')
      throw new Error('status failed from a worktree:\n' + statusOut)
    }
    assert.match(statusOut, /live check: a synthetic AI trailer was stripped/)

    withCwd(wtDir, function () {
      uninstall(false)
    })
    assert.ok(!fs.existsSync(path.join(dir, '.git', 'hooks', 'commit-msg')))
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', wtDir], { cwd: dir })
  }
})

test('install/uninstall work from a submodule, using its own real gitdir under .git/modules', function () {
  var subDir = mkRepo()
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'chore: sub base'], { cwd: subDir })

  var parentDir = mkRepo()
  execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subDir, 'sub'], { cwd: parentDir })
  execFileSync('git', ['commit', '-q', '-m', 'chore: add submodule'], { cwd: parentDir })
  var submodulePath = path.join(parentDir, 'sub')

  // `git submodule add` clones subDir into submodulePath as an independent
  // checkout — cloning does NOT carry over local repo config, so
  // submodulePath needs its own user.email/user.name for the commit below,
  // same as mkRepo() sets for every other test repo in this file.
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: submodulePath })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: submodulePath })

  assert.match(fs.readFileSync(path.join(submodulePath, '.git'), 'utf8'), /^gitdir: /, 'expected .git to be a file, not a directory, inside a submodule')

  withCwd(submodulePath, function () {
    install(false, false)
  })

  // The old code would have thrown ENOTDIR trying to mkdir "<submodulePath>/.git/hooks".
  // gitdir in the .git file is relative to the .git file's OWN location
  // (submodulePath), not to parentDir.
  var gitdirRef = fs.readFileSync(path.join(submodulePath, '.git'), 'utf8').replace(/^gitdir:\s*/, '').trim()
  var realGitDir = path.resolve(submodulePath, gitdirRef)
  assert.ok(fs.existsSync(path.join(realGitDir, 'hooks', 'commit-msg')))

  execFileSync(
    'git',
    ['commit', '-q', '--allow-empty', '-m', 'feat: from submodule', '-m', 'Co-Authored-By: Oz <oz-agent@warp.dev>'],
    { cwd: submodulePath }
  )
  var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: submodulePath, encoding: 'utf8' })
  assert.doesNotMatch(body, /oz-agent@warp\.dev/)

  withCwd(submodulePath, function () {
    uninstall(false)
  })
  assert.ok(!fs.existsSync(path.join(realGitDir, 'hooks', 'commit-msg')))
})

// The wrap-a-foreign-hook path (lib/install.js installAt's "wrapped" branch)
// is the tool's core "non-destructive" promise: an existing commit-msg hook
// must keep working exactly as before, with no-coauthor layered on top. The
// unit test above this only asserts file contents after install/uninstall —
// it never actually runs the wrapper. These two tests drive a real `git
// commit` through the wrapper so both halves of that promise are proven,
// not just assumed from the file layout.
test('foreign hook wrapper: the preserved hook actually runs and can still block a commit', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  var ranMarker = path.join(dir, 'foreign-hook-ran')
  // A synthetic pre-existing hook that proves it ran (writes a marker file)
  // and rejects any message containing the word REJECT — standing in for a
  // real-world commit-msg linter.
  var foreign =
    '#!/bin/sh\n' +
    'touch ' + JSON.stringify(ranMarker) + '\n' +
    'grep -q REJECT "$1" && exit 1\n' +
    'exit 0\n'
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreign, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false)
  })

  fs.writeFileSync(path.join(dir, 'f.txt'), 'x')
  execFileSync('git', ['add', 'f.txt'], { cwd: dir })

  assert.throws(function () {
    execFileSync(
      'git',
      ['commit', '-q', '--allow-empty', '-m', 'feat: REJECT me', '-m', 'Co-Authored-By: Oz <oz-agent@warp.dev>'],
      { cwd: dir, stdio: 'pipe' }
    )
  }, 'the preserved foreign hook should have rejected this commit (exit 1), blocking it')
  assert.ok(fs.existsSync(ranMarker), 'the preserved foreign hook did not run at all')
  assert.throws(function () {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: dir, stdio: 'pipe' })
  }, 'a commit was created despite the foreign hook rejecting it')

  withCwd(dir, function () {
    uninstall(false)
  })
})

test('foreign hook wrapper: when the preserved hook allows the commit, no-coauthor still strips on top', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  var ranMarker = path.join(dir, 'foreign-hook-ran')
  var foreign = '#!/bin/sh\ntouch ' + JSON.stringify(ranMarker) + '\nexit 0\n'
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreign, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false)
  })

  execFileSync(
    'git',
    ['commit', '-q', '--allow-empty', '-m', 'feat: wrapped', '-m', 'Co-Authored-By: Oz <oz-agent@warp.dev>', '-m', 'Co-Authored-By: Jane Doe <jane@example.com>'],
    { cwd: dir }
  )

  assert.ok(fs.existsSync(ranMarker), 'the preserved foreign hook did not run')
  var body = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' })
  assert.doesNotMatch(body, /oz-agent@warp\.dev/, 'no-coauthor did not strip the AI trailer on top of the wrapped foreign hook')
  assert.match(body, /jane@example\.com/, 'the human co-author was dropped')

  withCwd(dir, function () {
    uninstall(false)
  })
})

// Regression for a real data-loss bug: if a foreign hook was already preserved
// at commit-msg.orig AND commit-msg is foreign AGAIN (another tool overwrote
// our wrapper), re-installing used to overwrite the current foreign hook with
// our wrapper and destroy it — no backup anywhere. Now the older preserved hook
// rolls to commit-msg.orig.1 and the current foreign hook becomes the live
// .orig the wrapper runs. Neither foreign hook is lost.
test('re-install with a stale .orig preserves BOTH foreign hooks (no data loss)', function () {
  var dir = mkRepo()
  var hooks = path.join(dir, '.git', 'hooks')
  var foreignA = '#!/bin/sh\necho FOREIGN_A\n'
  var foreignB = '#!/bin/sh\necho FOREIGN_B\n'
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreignA, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false) // A → .orig, wrapper installed
  })
  // Another tool (husky/lefthook/a teammate) overwrites our wrapper with its own hook.
  fs.writeFileSync(path.join(hooks, 'commit-msg'), foreignB, { mode: 0o755 })
  withCwd(dir, function () {
    install(false, false) // must NOT destroy foreignB
  })
  // The CURRENT foreign hook (B) is the live one the wrapper runs (.orig); the
  // older one (A) is preserved at .orig.1. Neither is lost.
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg.orig'), 'utf8'), foreignB, 'current foreign hook B should be the live .orig')
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg.orig.1'), 'utf8'), foreignA, 'older foreign hook A should be preserved at .orig.1')
  assert.ok(exists(path.join(hooks, 'commit-msg.no-coauthor')))
  withCwd(dir, function () {
    uninstall(false)
  })
  // Uninstall restores the live foreign hook (B). The dormant backup (A) is
  // intentionally left in place rather than deleted.
  assert.equal(fs.readFileSync(path.join(hooks, 'commit-msg'), 'utf8'), foreignB)
  assert.ok(exists(path.join(hooks, 'commit-msg.orig.1')), 'dormant preserved hook A should not be deleted on uninstall')
})

test('install.sh embedded POSIX hook stays in sync with lib/hook-posix.js', function () {
  // Normalize CRLF so this test is robust even if a checkout (e.g. Windows
  // without .gitattributes honored) converts line endings on install.sh.
  var sh = fs.readFileSync(path.join(__dirname, '..', 'install.sh'), 'utf8').replace(/\r\n/g, '\n')
  var m = sh.match(/<<'__NC_HOOK_EOF__'\n([\s\S]*?)\n__NC_HOOK_EOF__/)
  assert.ok(m, 'HOOK_BODY here-doc not found in install.sh — did the delimiter change?')
  var fromInstall = m[1]
  var fromLib = require('../lib/hook-posix').replace(/\n+$/, '')
  assert.equal(
    fromInstall,
    fromLib,
    'install.sh HOOK_BODY is stale. Regenerate with: node ' +
      '`node -e "require(\'./lib/hook-posix\')` or the generator after changing lib/patterns.js.'
  )
})

test('install.sh is syntactically valid POSIX sh (sh -n)', function () {
  if (process.platform === 'win32') return // sh -n not available on Windows runners without Git Bash
  execFileSync('sh', ['-n', path.join(__dirname, '..', 'install.sh')], {
    encoding: 'utf8'
  })
})

;(process.platform === 'win32' ? test.skip : test)(
  'POSIX hook strips Oz/Codex/Cursor and keeps a human (real sh, grep, awk)',
  function () {
    var posixHook = require('../lib/hook-posix')
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-posix-'))
    try {
      var hookFile = path.join(dir, 'commit-msg')
      var msgFile = path.join(dir, 'COMMIT_EDITMSG')
      fs.writeFileSync(hookFile, posixHook, { mode: 0o755 })
      fs.chmodSync(hookFile, 0o755)
      fs.writeFileSync(
        msgFile,
        'feat: p\n\n' +
          'Co-Authored-By: Oz <oz-agent@warp.dev>\n' +
          'Co-Authored-By: Codex <noreply@openai.com>\n' +
          'Co-Authored-By: Cursor Agent <cursoragent@cursor.com>\n' +
          'Co-Authored-By: GitHub Copilot <223556219+Copilot@users.noreply.github.com>\n' +
          // Regression: `[\w.-]*` inside lib/patterns.js used to be mistranslated
          // to nested POSIX brackets that never matched (toPosixEre bug).
          'Co-Authored-By: Gemini <gemini-code-assist@google.com>\n' +
          'Co-Authored-By: Bard <bard-agent@google.com>\n' +
          // Regression: grep ran without -i, so a lowercase bot display name
          // (as GitHub renders many [bot] accounts) silently escaped rule B.
          'Co-Authored-By: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>\n' +
          'Co-Authored-By: Jane Doe <jane@example.com>\n' +
          'Signed-off-by: Real <real@example.com>\n'
      )
      execFileSync('sh', [hookFile, msgFile], { cwd: dir })
      var out = fs.readFileSync(msgFile, 'utf8')
      assert.doesNotMatch(out, /oz-agent@warp\.dev/)
      assert.doesNotMatch(out, /noreply@openai\.com/)
      assert.doesNotMatch(out, /cursoragent@cursor\.com/)
      assert.doesNotMatch(out, /223556219\+Copilot@users\.noreply/)
      assert.doesNotMatch(out, /gemini-code-assist@google\.com/)
      assert.doesNotMatch(out, /bard-agent@google\.com/)
      assert.doesNotMatch(out, /gemini-code-assist\[bot\]@users\.noreply/)
      assert.match(out, /Jane Doe <jane@example\.com>/)
      assert.match(out, /Signed-off-by: Real/)
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (e) {}
    }
  }
)

;(process.platform === 'win32' ? test.skip : test)(
  'POSIX hook: NO_COAUTHOR_DISABLE=1 skips stripping for that invocation (real sh)',
  function () {
    var posixHook = require('../lib/hook-posix')
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-posix-toggle-'))
    try {
      var hookFile = path.join(dir, 'commit-msg')
      var msgFile = path.join(dir, 'COMMIT_EDITMSG')
      fs.writeFileSync(hookFile, posixHook, { mode: 0o755 })
      var msg = 'fix: x\n\nCo-Authored-By: Oz <oz-agent@warp.dev>\nCo-Authored-By: Jane Doe <jane@example.com>\n'
      fs.writeFileSync(msgFile, msg)
      execFileSync('sh', [hookFile, msgFile], { cwd: dir, env: Object.assign({}, process.env, { NO_COAUTHOR_DISABLE: '1' }) })
      var out = fs.readFileSync(msgFile, 'utf8')
      assert.equal(out, msg, 'the message should be left completely untouched when disabled')
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (e) {}
    }
  }
)

// Regression: husky v9 points core.hooksPath at .husky/_, which husky
// regenerates on every install/prepare. Writing the wrapper there is silently
// non-durable — it is wiped the next time someone runs pnpm/npm install.
// install must detect that volatile dir and REFUSE (explaining why), rather
// than report success for a hook that will vanish. The user-authored
// .husky/<hook> files one level up are stable; the message points there.
test("install: refuses to write into husky's volatile .husky/_ dir, points at .husky/commit-msg instead", function () {
  var dir = mkRepo()
  // Simulate husky v9: core.hooksPath points at the generated .husky/_ dir,
  // which husky rewrites on every install/prepare.
  execFileSync('git', ['config', '--local', 'core.hooksPath', path.join('.husky', '_')], { cwd: dir })
  fs.mkdirSync(path.join(dir, '.husky', '_'), { recursive: true })
  var r = runInstallCli(dir)
  assert.notEqual(r.code, 0, 'install should refuse rather than silently write a non-durable hook')
  assert.match(r.out, /husky|volatile|not durable/i, 'should explain the dir is husky-generated and not durable')
  // Must NOT have written a hook into the volatile dir.
  assert.ok(!exists(path.join(dir, '.husky', '_', 'commit-msg')), 'must not leave a hook in the volatile .husky/_ dir')
})
