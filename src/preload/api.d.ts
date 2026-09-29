import type {
  AgentEvent,
  Attachment,
  Bot,
  BotSummary,
  ChatMessage,
  McpServerStatus,
  OllamaModel,
  OllamaStatus,
  PullProgress,
  Settings,
  ToolInfo
} from '../shared/types'

type Unsubscribe = () => void

export interface GrokApi {
  settings: { get(): Promise<Settings>; update(patch: Partial<Settings>): Promise<Settings> }
  ollama: {
    status(): Promise<OllamaStatus>
    models(): Promise<OllamaModel[]>
    start(): Promise<OllamaStatus & { installed: boolean }>
    pull(model: string): Promise<void>
    remove(model: string): Promise<void>
    onPullProgress(cb: (p: PullProgress) => void): Unsubscribe
  }
  bots: {
    list(): Promise<BotSummary[]>
    get(id: string): Promise<Bot | undefined>
    create(): Promise<Bot>
    update(id: string, patch: Partial<Pick<Bot, 'title' | 'pinned' | 'model' | 'workspace'>>): Promise<Bot>
    remove(id: string): Promise<void>
    search(q: string): Promise<{ bot: BotSummary; snippet: string; messageId?: string }[]>
    exportMarkdown(id: string): Promise<string | null>
  }
  agent: {
    send(botId: string, text: string, atts: Attachment[]): Promise<void>
    stop(botId: string): Promise<void>
    regenerate(botId: string): Promise<void>
    rewind(botId: string, messageId: string): Promise<ChatMessage | undefined>
    approve(botId: string, callId: string, allow: boolean, always: boolean): Promise<void>
    isRunning(botId: string): Promise<boolean>
    onEvent(cb: (e: AgentEvent) => void): Unsubscribe
  }
  files: { pick(botId: string): Promise<Attachment[]>; importFiles(botId: string, files: File[]): Promise<Attachment[]> }
  workspace: { open(botId: string): Promise<void>; chooseDir(): Promise<string | null> }
  tools: { list(): Promise<ToolInfo[]> }
  mcp: { status(): Promise<McpServerStatus[]>; onStatus(cb: (s: McpServerStatus[]) => void): Unsubscribe }
  voice: { transcribe(audio: ArrayBuffer, mime: string): Promise<string> }
  onMenu(cb: (action: 'settings' | 'apps' | 'new' | 'search' | 'workspace' | 'sidebar' | 'export') => void): Unsubscribe
  openExternal(url: string): Promise<void>
  appInfo(): Promise<{ version: string; platform: string; userData: string }>
  platform: string
}

declare global {
  interface Window {
    grok: GrokApi
  }
}
