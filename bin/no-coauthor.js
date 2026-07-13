#!/usr/bin/env node

'use strict'

var args = process.argv.slice(2)

function print(msg) {
  process.stdout.write(msg + '\n')
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  print('')
  print('  no-coauthor — strip AI co-author lines from git commits')
  print('')
  print('  Usage')
  print('    $ npx @aggc/no-coauthor <command> [options]')
  print('')
  print('  Commands')
  print('    install             Install hook in current repo')
  print('    install --global    Install as global git hook')
  print('    install --no-node   Install POSIX shell hook (no Node.js needed)')
  print('    uninstall           Remove hook from current repo')
  print('    uninstall --global  Remove global git hook')
  print('    status              Check the hook is installed and actually stripping trailers')
  print('    status --global     Check the global hook instead of the local one')
  print('')
  print('  Options')
  print('    --no-node           Use POSIX shell hook instead of Node.js')
  print('    -h, --help          Show this help')
  print('    -v, --version       Show version')
  print('')
  print('  Strips AI Co-Authored-By trailers by bot email / name, including')
  print('    Claude, Copilot, Codex, Cursor, Oz (Warp), GPT, ChatGPT, Gemini,')
  print('    Bard, Codeium, Windsurf, Tabnine, Amazon Q, CodeWhisperer, Aider,')
  print('    Zed, Cody, Devin, Augment, Replit, Cline, Continue, Llama, and')
  print('    more. Human co-authors are always kept.')
  print('')
  print('  Config')
  print('    .no-coauthorrc.json in repo root or ~ can add {"names":[],"emails":[],"domains":[]}')
  print('')
  print('  Temporarily disabling')
  print('    NO_COAUTHOR_DISABLE=1 git commit ...   skip just this hook (wrapped hooks still run)')
  print('    git commit --no-verify ...             skip every hook, including wrapped ones')
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
} else {
  process.stderr.write('no-coauthor: unknown command "' + command + '". Run --help for usage.\n')
  process.exit(1)
}
