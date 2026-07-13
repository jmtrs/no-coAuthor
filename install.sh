#!/bin/sh
#
# no-coauthor — standalone installer (POSIX, no Node.js required).
#
# Installs the POSIX commit-msg hook. For the superior Node.js hook with
# .no-coauthorrc.json support, use instead:
#     npx no-coauthor install
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh
#   sh install.sh [--global]
#
# The hook body below is generated from lib/hook-posix.js. Regenerate it when
# lib/patterns.js changes.

set -u

MANAGED='no-coauthor-managed'

# --- POSIX hook body (keep in sync with lib/hook-posix.js) ---
HOOK_BODY='#!/bin/sh
# no-coauthor-managed (do not remove; used by uninstall)
# no-coauthor — strips AI co-author trailers (POSIX fallback).
# Node.js hook is preferred; this is best-effort when Node is unavailable.
FILE="$1"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0
PAT='"'"'^[[:space:]]*Co-Authored-By:.*(<[^>]*(copilot@github\.com|[[[:alnum:]_].+-]*copilot[[[:alnum:]_].+-]*@users\.noreply\.github\.com|noreply@anthropic\.com|noreply@openai\.com|@chatgpt\.com|gemini[[[:alnum:]_].-]*@google\.com|bard[[[:alnum:]_].-]*@google\.com|noreply@cursor\.(com|sh)|noreply@codeium\.com|noreply@tabnine\.com|noreply@windsurf\.com|noreply@aider\.(chat|ai)|noreply@zed\.dev|noreply@cognition\.ai|oz-agent@warp\.dev)[^>]*>|(Claude|Anthropic|Copilot|GitHub Copilot|GPT|ChatGPT|OpenAI|Gemini|Bard|Cursor|Codeium|Windsurf|Tabnine|Amazon Q|CodeWhisperer|Aider|Zed|Cody|Devin|Cline|Continue|Llama|Oz).*(noreply|users\.noreply\.github\.com|\[bot\])|(Claude|Anthropic|Copilot|GitHub Copilot|GPT|ChatGPT|OpenAI|Gemini|Bard|Cursor|Codeium|Windsurf|Tabnine|Amazon Q|CodeWhisperer|Aider|Zed|Cody|Devin|Cline|Continue|Llama|Oz).*(<[^>]*(anthropic\.com|warp\.dev|openai\.com|chatgpt\.com|cursor\.(com|sh)|codeium\.com|tabnine\.com|windsurf\.com|aider\.(chat|ai)|zed\.dev|cognition\.ai)|anthropic\.com|warp\.dev|openai\.com|chatgpt\.com|cursor\.(com|sh)|codeium\.com|tabnine\.com|windsurf\.com|aider\.(chat|ai)|zed\.dev|cognition\.ai))'"'"'
TMP="${FILE}.nc.tmp"
grep -v -E "$PAT" "$FILE" 2>/dev/null | \
  awk '"'"'BEGIN{b=0} /^[[:space:]]*$/{b++; if(b==1)print; next}{b=0;print}'"'"' | \
  awk '"'"'{lines[NR]=$0} END{while(NR>0 && lines[NR]~/^[[:space:]]*$/)NR--; for(i=1;i<=NR;i++)print lines[i]}'"'"' > "$TMP"
if [ -s "$TMP" ]; then mv "$TMP" "$FILE"; else printf "" > "$FILE"; rm -f "$TMP"; fi
exit 0
'

WRAPPER='#!/bin/sh
# no-coauthor-managed (wrapper installed by no-coauthor)
# Runs the previous commit-msg hook (if any), then the no-coauthor stripper.
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/commit-msg.orig" ]; then
  "$DIR/commit-msg.orig" "$@" || exit $?
fi
if [ -f "$DIR/commit-msg.no-coauthor" ]; then
  "$DIR/commit-msg.no-coauthor" "$@" 2>/dev/null || true
fi
exit 0
'

IS_GLOBAL=false
for arg in "$@"; do
  [ "$arg" = "--global" ] && IS_GLOBAL=true
done

write_file() {
  # write_file <path> <content>
  printf '%s\n' "$2" > "$1"
  chmod +x "$1"
}

install_at() {
  # install_at <hooksDir>
  hooksDir="$1"
  mkdir -p "$hooksDir"
  hook="$hooksDir/commit-msg"
  nc="$hooksDir/commit-msg.no-coauthor"
  orig="$hooksDir/commit-msg.orig"

  if [ ! -f "$hook" ]; then
    write_file "$hook" "$HOOK_BODY"
    echo "no-coauthor: hook installed at $hook"
    return
  fi

  if grep -q "$MANAGED" "$hook" 2>/dev/null; then
    if [ -f "$nc" ] || [ -f "$orig" ]; then
      write_file "$nc" "$HOOK_BODY"
      write_file "$hook" "$WRAPPER"
    else
      write_file "$hook" "$HOOK_BODY"
    fi
    echo "no-coauthor: hook updated at $hook"
    return
  fi

  # Foreign hook → preserve and wrap.
  if [ ! -f "$orig" ]; then
    mv "$hook" "$orig"
    chmod +x "$orig"
  fi
  write_file "$nc" "$HOOK_BODY"
  write_file "$hook" "$WRAPPER"
  echo "no-coauthor: hook wrapped at $hook (previous hook preserved at $orig)"
}

if [ "$IS_GLOBAL" = true ]; then
  existing=$(git config --global core.hooksPath 2>/dev/null || true)
  if [ -n "$existing" ]; then
    case "$existing" in
      /*) globalDir="$existing" ;;
      *) globalDir="$HOME/$existing" ;;
    esac
    echo "no-coauthor: using existing global core.hooksPath: $existing"
  else
    globalDir="$HOME/.git-hooks"
    git config --global core.hooksPath "$globalDir"
  fi
  install_at "$globalDir"
  echo "no-coauthor: all git repos on this machine will strip AI co-author trailers"
  echo "no-coauthor: repos with a local core.hooksPath are not affected by the global hook"
else
  gitRoot=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "no-coauthor: not inside a git repository" >&2
    echo "Run inside a git repo for per-project install, or use --global." >&2
    exit 1
  }
  localHooksPath=$(git config --local core.hooksPath 2>/dev/null || true)
  if [ -n "$localHooksPath" ]; then
    case "$localHooksPath" in
      /*) hooksDir="$localHooksPath" ;;
      *) hooksDir="$gitRoot/$localHooksPath" ;;
    esac
    echo "no-coauthor: using local core.hooksPath: $localHooksPath"
  else
    hooksDir="$gitRoot/.git/hooks"
    globalHp=$(git config --global core.hooksPath 2>/dev/null || true)
    if [ -n "$globalHp" ]; then
      echo "no-coauthor: global core.hooksPath is set to $globalHp; a per-project hook in .git/hooks will NOT run unless you set a local core.hooksPath. Consider --global."
    fi
  fi
  install_at "$hooksDir"
  # Warn if the hooks dir is inside the working tree (version-controlled).
  case "$hooksDir" in
    "$gitRoot/.git"*) ;;
    "$gitRoot"*) echo "no-coauthor: hooks dir is inside the working tree; files may show as untracked. Commit them to share, or add to .gitignore for personal use." ;;
  esac
fi
