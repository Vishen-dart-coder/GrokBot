// Types shared between the main process, preload bridge and renderer.

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolCallStatus = 'pending-approval' | 'running' | 'done' | 'error' | 'denied'

export interface ToolRun {
  callId: string
  name: string
  arguments: Record<string, unknown>
  status: ToolCallStatus
  output?: string
}

export interface Attachment {
  name: string
  /** Absolute path of the copy stored in the bot workspace. */
  path: string
  mime: string
  size: number
  /** Images only: base64 payload sent to vision models. */
  base64?: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  thinking?: string
  createdAt: number
  attachments?: Attachment[]
  toolCalls?: ToolCall[]
  toolRuns?: ToolRun[]
  /** For role === 'tool': which tool produced this output. */
  toolName?: string
  toolCallId?: string
  error?: string
}

export interface Bot {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  model?: string
  /** Absolute path of this bot's workspace ("Grok Bot's computer"). */
  workspace: string
  pinned?: boolean
  messages: ChatMessage[]
}

export type BotSummary = Omit<Bot, 'messages'> & { preview: string }

export type ApprovalMode = 'ask' | 'auto-read' | 'auto'

export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface Settings {
  ollamaHost: string
  model: string
  systemPrompt: string
  temperature: number
  contextLength: number
  think: boolean
  workspaceRoot: string
  approvalMode: ApprovalMode
  shellTimeoutSec: number
  maxAgentSteps: number
  enabledTools: Record<string, boolean>
  mcpServers: McpServerConfig[]
  /** OpenAI-compatible /v1/audio/transcriptions endpoint (e.g. whisper.cpp server). Empty = disabled. */
  transcriptionUrl: string
  voiceName: string
  userName: string
  theme: 'dark' | 'light' | 'system'
}

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  family?: string
  parameterSize?: string
  quantization?: string
}

export interface OllamaStatus {
  ok: boolean
  version?: string
  error?: string
}

export interface McpServerStatus {
  id: string
  name: string
  state: 'disabled' | 'connecting' | 'connected' | 'error'
  error?: string
  tools: string[]
}

export interface ToolInfo {
  name: string
  description: string
  source: 'builtin' | 'mcp'
  risky: boolean
}

/** Streamed from main -> renderer while an agent run is in progress. */
export type AgentEvent =
  | { type: 'start'; botId: string; messageId: string }
  | { type: 'delta'; botId: string; messageId: string; content?: string; thinking?: string }
  | { type: 'message'; botId: string; message: ChatMessage }
  | { type: 'tool-update'; botId: string; messageId: string; run: ToolRun }
  | { type: 'approval'; botId: string; messageId: string; run: ToolRun }
  | { type: 'done'; botId: string }
  | { type: 'error'; botId: string; error: string }
  | { type: 'bot-updated'; bot: BotSummary }

export interface PullProgress {
  model: string
  status: string
  completed?: number
  total?: number
  done?: boolean
  error?: string
}
