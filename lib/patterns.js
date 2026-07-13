'use strict'

// AI co-author detection patterns. Each entry is a regex fragment (it may
// contain . | * + () [] and the anchors are added by lib/strip.js). Backslashes
// are written as `\\` so the JS string literal evaluates to a single backslash
// in the regex (e.g. `\\.` -> `\.` -> literal dot, `\\w` -> `\w` -> word char).
//
// Sources for the addresses below: official tool documentation and source code
// (Anthropic Claude Code, OpenAI Codex `commit_attribution.rs`, GitHub Copilot
// `git.addAICoAuthor`, Cursor staff statements, Gemini CLI discussions, etc.).

// Rule A — high-confidence bot email addresses. A match here strips the line
// regardless of the name, because no real human co-author uses these.
var BOT_EMAIL_PATTERNS = [
  // GitHub Copilot (VS Code git.addAICoAuthor, Copilot CLI/Agent).
  'copilot@github\\.com',
  '[^\\s@]*copilot[^\\s@]*@users\\.noreply\\.github\\.com',
  // Anthropic Claude Code: `Claude <noreply@anthropic.com>` (and model-suffixed names like "Claude Opus 4.6").
  'noreply@anthropic\\.com',
  // OpenAI Codex CLI: default `Codex <noreply@openai.com>`.
  'noreply@openai\\.com',
  'codex@openai\\.com',
  // OpenAI ChatGPT / GPT bot accounts.
  '@chatgpt\\.com',
  // Google Gemini CLI / Gemini Code Assist: `gemini-code-assist@google.com`, `gemini-cli-agent@google.com`.
  'gemini[\\w.-]*@google\\.com',
  'bard[\\w.-]*@google\\.com',
  // Cursor: cloud/background agents commit as `Cursor Agent <cursoragent@cursor.com>`.
  'noreply@cursor\\.(com|sh)',
  'cursoragent@cursor\\.com',
  // Codeium / Windsurf.
  'noreply@codeium\\.com',
  'noreply@tabnine\\.com',
  'noreply@windsurf\\.com',
  // Aider.
  'noreply@aider\\.(chat|ai)',
  // Zed AI.
  'noreply@zed\\.dev',
  // Devin (Cognition).
  'noreply@cognition\\.ai',
  'devin@cognition\\.dev',
  // Sourcegraph Cody.
  'noreply@sourcegraph\\.com',
  // Augment Code.
  'noreply@augmentcode\\.com',
  // Replit Agent / Ghostwriter.
  'noreply@replit\\.com',
  // Oz (Warp agent).
  'oz-agent@warp\\.dev'
]

// Rule C — AI tool domains. When the name matches an AI name AND the email
// domain is one of these, the line is stripped. This catches non-noreply bot
// addresses (e.g. `Oz <oz-agent@warp.dev>`) without blanket-stripping every
// employee of a company: a co-author at the same domain whose name is NOT an
// AI name is preserved (e.g. `Jane <jane@cursor.com>`).
// NOTE: google.com is intentionally NOT included (too broad); Gemini/Bard bots
// are matched by their specific bot addresses in BOT_EMAIL_PATTERNS instead.
var AI_TOOL_DOMAINS = [
  'anthropic\\.com',
  'warp\\.dev',
  'openai\\.com',
  'chatgpt\\.com',
  'cursor\\.(com|sh)',
  'codeium\\.com',
  'tabnine\\.com',
  'windsurf\\.com',
  'aider\\.(chat|ai)',
  'zed\\.dev',
  'cognition\\.(ai|dev)',
  'sourcegraph\\.com',
  'augmentcode\\.com',
  'replit\\.com'
]

// Rules B and C — AI tool names. A name match alone NEVER strips a line; it
// only combines with a bot-shaped email (B) or a known tool domain (C). This
// is what keeps a human literally named "Claude" with a normal email intact.
// Hyphenated/lowercase variants are included so GitHub `[bot]` account names
// (e.g. `amazon-q[bot]`, `chatgpt-codex-connector[bot]`) match under rule B.
var AI_NAMES = [
  'Claude',
  'Claude Code',
  'Anthropic',
  'Copilot',
  'GitHub Copilot',
  'Codex',
  'GPT',
  'ChatGPT',
  'OpenAI',
  'Gemini',
  'Bard',
  'Cursor',
  'Codeium',
  'Windsurf',
  'Tabnine',
  'Amazon Q',
  'amazon-q',
  'amazonq',
  'CodeWhisperer',
  'codewhisperer',
  'Aider',
  'Zed',
  'Cody',
  'Devin',
  'Cline',
  'Continue',
  'Llama',
  'Augment',
  'Replit',
  'Tabby',
  'Bolt',
  'v0',
  'Lovable',
  'Goose',
  'OpenHands',
  'Plandex',
  'Qoder',
  'Jules',
  'Oz'
]

// Standalone AI-generated banner/footer lines. Unlike Co-Authored-By trailers
// these are plain body lines, not git trailers, so they need a full-line
// match of their own (see lib/strip.js) rather than the name/email/domain
// combinators above.
//
// Kept deliberately short: only exact, confirmed formats a real tool emits
// verbatim are listed here, to avoid false positives on ordinary commit body
// text that happens to mention a tool by name. Extend as other tools'
// concrete formats are confirmed.
var AI_BANNER_LINES = [
  // Claude Code: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  // The emoji prefix is optional (older/customized configs may omit it), and
  // both the current (claude.com/claude-code) and legacy (claude.ai/code)
  // links are matched.
  '(🤖\\s*)?Generated with \\[Claude Code\\]\\(https://claude\\.(ai/code|com/claude-code)\\)'
]

module.exports = {
  BOT_EMAIL_PATTERNS: BOT_EMAIL_PATTERNS,
  AI_TOOL_DOMAINS: AI_TOOL_DOMAINS,
  AI_NAMES: AI_NAMES,
  AI_BANNER_LINES: AI_BANNER_LINES
}
