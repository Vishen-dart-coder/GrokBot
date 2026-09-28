import type { Settings } from './types'

export const DEFAULT_SYSTEM_PROMPT = `You are GrokBot, a capable autonomous agent running on the user's own computer.
You have a private workspace directory (your "computer") where you can create, read and edit files and run shell commands.
Work step by step: plan briefly, use tools to act, check results, and finish with a clear, concise answer.
Prefer doing the work over describing it. Never fabricate tool results. Ask the user when a request is ambiguous or risky.
Format answers in Markdown. Use fenced code blocks with a language tag.`

export const BUILTIN_TOOL_NAMES = [
  'run_shell',
  'read_file',
  'write_file',
  'edit_file',
  'list_dir',
  'search_files',
  'web_fetch',
  'take_screenshot'
] as const

export function defaultSettings(home: string): Settings {
  return {
    ollamaHost: 'http://127.0.0.1:11434',
    model: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.7,
    contextLength: 8192,
    think: false,
    workspaceRoot: `${home}/GrokBot`,
    approvalMode: 'auto-read',
    shellTimeoutSec: 120,
    maxAgentSteps: 25,
    enabledTools: Object.fromEntries(BUILTIN_TOOL_NAMES.map((n) => [n, n !== 'take_screenshot'])),
    mcpServers: [],
    transcriptionUrl: '',
    voiceName: '',
    userName: '',
    theme: 'dark'
  }
}
