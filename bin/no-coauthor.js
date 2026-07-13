#!/usr/bin/env node

'use strict'

var ui = require('../lib/ui')
var pc = ui.pc

var args = process.argv.slice(2)

function print(msg) {
  process.stdout.write(msg + '\n')
}

function cmd(name) {
  return pc.bold(name)
}

function heading(text) {
  return pc.bold(pc.cyan(text))
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  print('')
  print('  ' + pc.bold('no-coauthor') + ' ' + pc.dim('—') + ' strip AI co-author lines from git commits')
  print('')
  print('  ' + heading('Usage'))
  print('    $ npx @aggc/no-coauthor ' + pc.dim('<command> [options]'))
  print('')
  print('  ' + heading('Commands'))
  print('    ' + cmd('install') + '             Install hook in current repo')
  print('    ' + cmd('install --global') + '    Install as global git hook')
  print('    ' + cmd('install --no-node') + '   Install POSIX shell hook (no Node.js needed)')
  print('    ' + cmd('uninstall') + '           Remove hook from current repo')
  print('    ' + cmd('uninstall --global') + '  Remove global git hook')
  print('    ' + cmd('status') + '              Check the hook is installed and actually stripping trailers')
  print('    ' + cmd('status --global') + '     Check the global hook instead of the local one')
  print('    ' + cmd('check [range]') + '       Scan already-made commits for AI trailers, exit 1 if any found')
  print(pc.dim('                        (default range: HEAD~1..HEAD). For CI — see'))
  print(pc.dim('                        examples/reject-ai-coauthor.yml. The commit-msg hook is'))
  print(pc.dim('                        client-side and always bypassable; check as a required PR'))
  print(pc.dim('                        status check is the part nothing local can talk out of failing.'))
  print('')
  print('  ' + heading('Options'))
  print('    ' + cmd('--no-node') + '           Use POSIX shell hook instead of Node.js')
  print('    ' + cmd('-h, --help') + '          Show this help')
  print('    ' + cmd('-v, --version') + '       Show version')
  print('')
  print('  ' + heading('Strips'))
  print(pc.dim('    AI Co-Authored-By trailers by bot email / name, including'))
  print(pc.dim('    Claude, Copilot, Codex, Cursor, Oz (Warp), GPT, ChatGPT, Gemini,'))
  print(pc.dim('    Bard, Codeium, Windsurf, Tabnine, Amazon Q, CodeWhisperer, Aider,'))
  print(pc.dim('    Zed, Cody, Devin, Augment, Replit, Cline, Continue, Llama, and'))
  print(pc.dim('    more. Human co-authors are always kept.'))
  print('')
  print('  ' + heading('Config'))
  print(pc.dim('    .no-coauthorrc.json in ~ can add {"names":[],"emails":[],"domains":[]}'))
  print(pc.dim('    A repo-root .no-coauthorrc.json is IGNORED by default (untrusted). Set'))
  print(pc.dim('    NO_COAUTHOR_TRUST_REPO=1 to honor it (e.g. in CI for a team-shared config).'))
  print('')
  print('  ' + heading('Temporarily disabling'))
  print('    ' + pc.bold('NO_COAUTHOR_DISABLE=1') + pc.dim(' git commit ...   skip just this hook (wrapped hooks still run)'))
  print('    ' + pc.bold('git commit --no-verify') + pc.dim(' ...             skip every hook, including wrapped ones'))
  print('')
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  var pkg = require('../package.json')
  print('no-coauthor ' + pkg.version)
  process.exit(0)
}

var command = args[0]
var isGlobal = args.includes('--global')
var noNode = args.includes('--no-node')

if (command === 'install') {
  require('../lib/install.js')(isGlobal, noNode)
} else if (command === 'uninstall') {
  require('../lib/uninstall.js')(isGlobal)
} else if (command === 'status') {
  require('../lib/status.js')(isGlobal)
} else if (command === 'check') {
  require('../lib/check.js')(args[1])
} else {
  ui.err('unknown command "' + command + '". Run --help for usage.')
  process.exit(1)
}
