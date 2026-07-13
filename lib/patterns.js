'use strict'

// Specific bot addresses (Rule A). Matched case-insensitively against the
// `<email>` part of `Co-Authored-By: Name <email>`. These are high-confidence
// bot addresses where no real human co-author would land, so a match here
// strips the line regardless of the name.
var BOT_EMAIL_PATTERNS = [
  'copilot@github\\.com',
  '[\\w.+-]*copilot[\\w.+-]*@users\\.noreply\\.github\\.com',
  'noreply@anthropic\\.com',
  'noreply@openai\\.com',
  '@chatgpt\\.com',
  'gemini[\\w.-]*@google\\.com',
  'bard[\\w.-]*@google\\.com',
  'noreply@cursor\\.(com|sh)',
  'noreply@codeium\\.com',
  'noreply@tabnine\\.com',
  'noreply@windsurf\\.com',
  'noreply@aider\\.(chat|ai)',
  'noreply@zed\\.dev',
  'noreply@cognition\\.ai',
  'oz-agent@warp\\.dev'
]

// AI tool domains (Rule C). When the name matches an AI name AND the email
// domain is one of these, the line is stripped. This catches non-noreply bot
// addresses (e.g. `Oz <oz-agent@warp.dev>`) without blanket-stripping every
// employee of a company: a co-author at the same domain whose name is NOT an
// AI name is preserved (e.g. `Jane <jane@cursor.com>`).
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
  'cognition\\.ai'
]

// AI tool names (Rules B and C). A name match alone never strips a line; it
// only combines with a bot-shaped email (B) or a known tool domain (C). This
// is what keeps a human literally named "Claude" with a normal email intact.
var AI_NAMES = [
  'Claude',
  'Anthropic',
  'Copilot',
  'GitHub Copilot',
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
  'CodeWhisperer',
  'Aider',
  'Zed',
  'Cody',
  'Devin',
  'Cline',
  'Continue',
  'Llama',
  'Oz'
]

module.exports = {
  BOT_EMAIL_PATTERNS: BOT_EMAIL_PATTERNS,
  AI_TOOL_DOMAINS: AI_TOOL_DOMAINS,
  AI_NAMES: AI_NAMES
}
