#!/bin/sh
#
# no-coauthor — standalone installer (POSIX, no Node.js required).
#
# Installs the POSIX commit-msg hook. For the superior Node.js hook with
# .no-coauthorrc.json support, use instead:
#     npx @aggc/no-coauthor install
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jmtrs/no-coAuthor/main/install.sh | sh
#   sh install.sh [--global]
#
# The hook body below is generated from lib/hook-posix.js. Regenerate it when
# lib/patterns.js changes (test/install.test.js asserts they stay in sync).

set -u

MANAGED='no-coauthor-managed'

# --- styling (same voice as the npm CLI's lib/ui.js) ---
# Mirrors picocolors' own detection rule (see node_modules/picocolors):
# NO_COLOR wins if set to a non-empty value; otherwise color turns on for
# FORCE_COLOR, for CI (GitHub Actions and friends export CI=true, and the
# Node CLI would color its own output there — this keeps curl-installed
# runs consistent with that), or for an interactive, non-"dumb" terminal.
if [ -z "${NO_COLOR:-}" ] && {
  [ -n "${FORCE_COLOR:-}" ] || [ -n "${CI:-}" ] || { [ -t 1 ] && [ "${TERM:-}" != 'dumb' ]; }
}; then
  ESC=$(printf '\033')
  C_BOLD="${ESC}[1m"; C_DIM="${ESC}[2m"; C_RESET="${ESC}[0m"
  C_CYAN="${ESC}[36m"; C_YELLOW="${ESC}[33m"; C_RED="${ESC}[31m"; C_GREEN="${ESC}[32m"
else
  C_BOLD=''; C_DIM=''; C_RESET=''; C_CYAN=''; C_YELLOW=''; C_RED=''; C_GREEN=''
fi
TAG="${C_BOLD}${C_CYAN}no-coauthor${C_RESET}"
WARN_TAG="${C_BOLD}${C_YELLOW}no-coauthor${C_RESET}"
ERR_TAG="${C_BOLD}${C_RED}no-coauthor${C_RESET}"
ok() { echo "${C_GREEN}✔${C_RESET} $1"; }
info() { echo "${TAG}: $1"; }
warn() { echo "${WARN_TAG}: $1"; }
err() { echo "${ERR_TAG}: $1" >&2; }

# --- POSIX hook body (keep in sync with lib/hook-posix.js) ---
# Embedded with a quoted here-doc so the body is verbatim (no shell
# expansion, no fragile nested-quote escaping).
HOOK_BODY=$(cat <<'__NC_HOOK_EOF__'
#!/bin/sh
# no-coauthor-managed (do not remove; used by uninstall)
# no-coauthor — strips AI co-author trailers (POSIX fallback).
# Node.js hook is preferred; this is best-effort when Node is unavailable.
FILE="$1"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0
# NO_COAUTHOR_DISABLE=1 disables just this hook for one commit/session,
# unlike --no-verify which skips every hook (including any preserved
# foreign one this may be wrapping).
[ -n "${NO_COAUTHOR_DISABLE:-}" ] && exit 0
PAT='^[[:space:]]*Co-Authored-By:.*(<[^>]*(copilot@github\.com|[^[:space:]@]*copilot[^[:space:]@]*@users\.noreply\.github\.com|noreply@anthropic\.com|noreply@openai\.com|codex@openai\.com|@chatgpt\.com|gemini[[:alnum:]_.-]*@google\.com|bard[[:alnum:]_.-]*@google\.com|noreply@cursor\.(com|sh)|cursoragent@cursor\.com|noreply@codeium\.com|noreply@tabnine\.com|noreply@windsurf\.com|noreply@aider\.(chat|ai)|noreply@zed\.dev|noreply@cognition\.ai|devin@cognition\.dev|noreply@sourcegraph\.com|noreply@augmentcode\.com|noreply@replit\.com|oz-agent@warp\.dev)[^>]*>|(Claude|Claude Code|Anthropic|Copilot|GitHub Copilot|Codex|GPT|ChatGPT|OpenAI|Gemini|Bard|Cursor|Codeium|Windsurf|Tabnine|Amazon Q|amazon-q|amazonq|CodeWhisperer|codewhisperer|Aider|Zed|Cody|Devin|Cline|Continue|Llama|Augment|Replit|Tabby|Bolt|v0|Lovable|Goose|OpenHands|Plandex|Qoder|Jules|Oz).*(noreply|users\.noreply\.github\.com|\[bot\])|(Claude|Claude Code|Anthropic|Copilot|GitHub Copilot|Codex|GPT|ChatGPT|OpenAI|Gemini|Bard|Cursor|Codeium|Windsurf|Tabnine|Amazon Q|amazon-q|amazonq|CodeWhisperer|codewhisperer|Aider|Zed|Cody|Devin|Cline|Continue|Llama|Augment|Replit|Tabby|Bolt|v0|Lovable|Goose|OpenHands|Plandex|Qoder|Jules|Oz).*(<[^>]*(anthropic\.com|warp\.dev|openai\.com|chatgpt\.com|cursor\.(com|sh)|codeium\.com|tabnine\.com|windsurf\.com|aider\.(chat|ai)|zed\.dev|cognition\.(ai|dev)|sourcegraph\.com|augmentcode\.com|replit\.com)|anthropic\.com|warp\.dev|openai\.com|chatgpt\.com|cursor\.(com|sh)|codeium\.com|tabnine\.com|windsurf\.com|aider\.(chat|ai)|zed\.dev|cognition\.(ai|dev)|sourcegraph\.com|augmentcode\.com|replit\.com))'
BPAT='^[[:space:]]*((🤖[[:space:]]*)?Generated with \[Claude Code\]\(https://claude\.(ai/code|com/claude-code)\))[[:space:]]*$'
TMP="${FILE}.nc.tmp"
# Strip only short Co-Authored-By/banner lines. The combined name-alternation
# ERE is O(n^2) on a long line with no "<", which can hang a `git commit` on a
# single adversarial or buggy-tool-generated line (no newlines required, so
# message-size limits don't help). The length($0) guard short-circuits
# before the regex ever runs on a long line, mirroring the Node hook's
# MAX_TRAILER_LINE_LENGTH. Lines over 500 chars are left untouched.
# PAT/BPAT are passed via ENVIRON (not -v) so backslash escapes in the ERE
# survive verbatim; tolower() on both sides gives POSIX-awk
# case-insensitivity without the gawk-only IGNORECASE.
PAT_ERE="$PAT" BANNER_ERE="$BPAT" awk '
BEGIN { PAT = tolower(ENVIRON["PAT_ERE"]); BPAT = tolower(ENVIRON["BANNER_ERE"]) }
length($0) <= 500 && (tolower($0) ~ PAT || tolower($0) ~ BPAT) { next }
{ print }
' "$FILE" 2>/dev/null | \
  awk 'BEGIN{b=0} /^[[:space:]]*$/{b++; if(b==1)print; next}{b=0;print}' | \
  awk '{lines[NR]=$0} END{while(NR>0 && lines[NR]~/^[[:space:]]*$/)NR--; for(i=1;i<=NR;i++)print lines[i]}' > "$TMP"
if [ -s "$TMP" ]; then mv "$TMP" "$FILE"; else printf "" > "$FILE"; rm -f "$TMP"; fi
exit 0
__NC_HOOK_EOF__
)

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
    ok "hook installed at $hook"
    return
  fi

  if grep -q "$MANAGED" "$hook" 2>/dev/null; then
    if [ -f "$nc" ] || [ -f "$orig" ]; then
      write_file "$nc" "$HOOK_BODY"
      write_file "$hook" "$WRAPPER"
    else
      write_file "$hook" "$HOOK_BODY"
    fi
    ok "hook updated at $hook"
    return
  fi

  # Foreign hook -> preserve and wrap.
  if [ ! -f "$orig" ]; then
    mv "$hook" "$orig"
    chmod +x "$orig"
  else
    # A foreign hook was already preserved at $orig, but commit-msg is foreign
    # again (another tool — husky, lefthook, a teammate — overwrote our
    # wrapper). Roll the older one aside into the next free .orig.N slot
    # instead of destroying it, then make the CURRENT foreign hook the live one.
    n=1
    while [ -f "$orig.$n" ]; do n=$((n + 1)); done
    mv "$orig" "$orig.$n"
    mv "$hook" "$orig"
    chmod +x "$orig"
  fi
  write_file "$nc" "$HOOK_BODY"
  write_file "$hook" "$WRAPPER"
  ok "hook wrapped at $hook (previous hook preserved at $orig)"
}

if [ "$IS_GLOBAL" = true ]; then
  existing=$(git config --global core.hooksPath 2>/dev/null || true)
  if [ -n "$existing" ]; then
    case "$existing" in
      /*) globalDir="$existing" ;;
      *) globalDir="$HOME/$existing" ;;
    esac
    info "using existing global core.hooksPath: $existing"
  else
    globalDir="$HOME/.git-hooks"
    git config --global core.hooksPath "$globalDir"
  fi
  install_at "$globalDir"
  info "all git repos on this machine will strip AI co-author trailers"
  info "repos with a local core.hooksPath are not affected by the global hook"
else
  gitRoot=$(git rev-parse --show-toplevel 2>/dev/null) || {
    err "not inside a git repository"
    echo "Run inside a git repo for per-project install, or use --global." >&2
    exit 1
  }
  localHooksPath=$(git config --local core.hooksPath 2>/dev/null || true)
  if [ -n "$localHooksPath" ]; then
    case "$localHooksPath" in
      /*) hooksDir="$localHooksPath" ;;
      *) hooksDir="$gitRoot/$localHooksPath" ;;
    esac
    info "using local core.hooksPath: $localHooksPath"
  else
    hooksDir="$gitRoot/.git/hooks"
    globalHp=$(git config --global core.hooksPath 2>/dev/null || true)
    if [ -n "$globalHp" ]; then
      warn "global core.hooksPath is set to $globalHp; a per-project hook in .git/hooks will NOT run unless you set a local core.hooksPath. Consider --global."
    fi
  fi
  install_at "$hooksDir"
  # Warn if the hooks dir is inside the working tree (version-controlled).
  case "$hooksDir" in
    "$gitRoot/.git"*) ;;
    "$gitRoot"*) warn "hooks dir is inside the working tree; files may show as untracked. Commit them to share, or add to .gitignore for personal use." ;;
  esac
fi
