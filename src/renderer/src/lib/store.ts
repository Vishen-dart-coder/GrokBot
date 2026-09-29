import { create } from 'zustand'
import type {
  AgentEvent,
  Attachment,
  Bot,
  BotSummary,
  McpServerStatus,
  OllamaModel,
  OllamaStatus,
  Settings
} from '@shared/types'

export type Modal = 'settings' | 'apps' | 'search' | null
export type SettingsTab = 'general' | 'model' | 'agent' | 'voice' | 'about'

interface Streaming {
  messageId: string
  content: string
  thinking: string
}

interface State {
  settings?: Settings
  bots: BotSummary[]
  currentId: string | null
  bot?: Bot
  streaming: Record<string, Streaming | undefined>
  running: Record<string, boolean>
  errors: Record<string, string | undefined>
  notices: Record<string, string | undefined>
  /** Text to load into the composer (set by "edit message"); the composer clears it. */
  draft: { text: string; attachments: Attachment[] } | null
  sidebarOpen: boolean
  modal: Modal
  settingsTab: SettingsTab
  voiceMode: boolean
  ollama: OllamaStatus
  models: OllamaModel[]
  mcp: McpServerStatus[]

  init(): Promise<void>
  refreshOllama(): Promise<void>
  select(id: string | null): Promise<void>
  newBot(): void
  /** Returns the current bot id, creating a bot first if on the home screen. */
  ensureBot(): Promise<string>
  send(text: string, attachments: Attachment[]): Promise<void>
  stop(): Promise<void>
  regenerate(): Promise<void>
  editMessage(messageId: string): Promise<void>
  consumeDraft(): void
  startOllama(): Promise<string | undefined>
  updateSettings(patch: Partial<Settings>): Promise<void>
  renameBot(id: string, title: string): Promise<void>
  togglePin(id: string): Promise<void>
  deleteBot(id: string): Promise<void>
  setModal(m: Modal, tab?: SettingsTab): void
  toggleSidebar(): void
  setVoiceMode(v: boolean): void
  handle(e: AgentEvent): void
}

const api = () => window.grok

export const useApp = create<State>((set, get) => ({
  bots: [],
  currentId: null,
  streaming: {},
  running: {},
  errors: {},
  notices: {},
  draft: null,
  sidebarOpen: true,
  modal: null,
  settingsTab: 'general',
  voiceMode: false,
  ollama: { ok: false },
  models: [],
  mcp: [],

  async init() {
    const [settings, bots, mcp] = await Promise.all([api().settings.get(), api().bots.list(), api().mcp.status()])
    set({ settings, bots, mcp })
    api().agent.onEvent((e) => get().handle(e))
    api().mcp.onStatus((mcp) => set({ mcp }))
    void get().refreshOllama()
  },

  async refreshOllama() {
    const status = await api().ollama.status()
    const models = status.ok ? await api().ollama.models().catch(() => []) : []
    set({ ollama: status, models })
  },

  async select(id) {
    if (!id) return set({ currentId: null, bot: undefined })
    const bot = await api().bots.get(id)
    const running = await api().agent.isRunning(id)
    set((s) => ({ currentId: id, bot, running: { ...s.running, [id]: running } }))
  },

  newBot() {
    set({ currentId: null, bot: undefined })
  },

  async ensureBot() {
    const cur = get().currentId
    if (cur) return cur
    const bot = await api().bots.create()
    set((s) => ({ currentId: bot.id, bot, bots: [{ ...bot, preview: '' }, ...s.bots] }))
    return bot.id
  },

  async send(text, attachments) {
    const id = await get().ensureBot()
    set((s) => ({ running: { ...s.running, [id]: true }, errors: { ...s.errors, [id]: undefined }, notices: { ...s.notices, [id]: undefined } }))
    await api().agent.send(id, text, attachments)
  },

  async regenerate() {
    const { currentId: id, bot } = get()
    if (!id || !bot) return
    const lastUser = bot.messages.map((m) => m.role).lastIndexOf('user')
    set((s) => ({
      bot: s.bot && { ...s.bot, messages: s.bot.messages.slice(0, lastUser + 1) },
      running: { ...s.running, [id]: true },
      errors: { ...s.errors, [id]: undefined }
    }))
    await api().agent.regenerate(id)
  },

  async editMessage(messageId) {
    const id = get().currentId
    if (!id) return
    const removed = await api().agent.rewind(id, messageId)
    if (!removed) return
    set((s) => ({
      bot: s.bot && { ...s.bot, messages: s.bot.messages.filter((m) => m.createdAt < removed.createdAt) },
      errors: { ...s.errors, [id]: undefined },
      draft: { text: removed.content, attachments: removed.attachments ?? [] }
    }))
  },

  consumeDraft() {
    set({ draft: null })
  },

  async startOllama() {
    const res = await api().ollama.start()
    await get().refreshOllama()
    if (!res.installed) {
      void api().openExternal('https://ollama.com/download')
      return 'Ollama is not installed. The download page has been opened.'
    }
    return res.ok ? undefined : res.error
  },

  async stop() {
    const id = get().currentId
    if (id) await api().agent.stop(id)
  },

  async updateSettings(patch) {
    const settings = await api().settings.update(patch)
    set({ settings })
    if ('ollamaHost' in patch) void get().refreshOllama()
  },

  async renameBot(id, title) {
    const bot = await api().bots.update(id, { title })
    set((s) => ({
      bots: s.bots.map((b) => (b.id === id ? { ...b, title: bot.title } : b)),
      bot: s.bot?.id === id ? { ...s.bot, title: bot.title } : s.bot
    }))
  },

  async togglePin(id) {
    const cur = get().bots.find((b) => b.id === id)
    await api().bots.update(id, { pinned: !cur?.pinned })
    set({ bots: await api().bots.list() })
  },

  async deleteBot(id) {
    await api().bots.remove(id)
    set((s) => ({
      bots: s.bots.filter((b) => b.id !== id),
      ...(s.currentId === id ? { currentId: null, bot: undefined } : {})
    }))
  },

  setModal(modal, tab) {
    set({ modal, ...(tab ? { settingsTab: tab } : {}) })
  },
  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }))
  },
  setVoiceMode(voiceMode) {
    set({ voiceMode })
  },

  handle(e) {
    set((s) => {
      switch (e.type) {
        case 'bot-updated': {
          const others = s.bots.filter((b) => b.id !== e.bot.id)
          const bots = [e.bot, ...others].sort(
            (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt
          )
          return { bots, bot: s.bot?.id === e.bot.id ? { ...s.bot, title: e.bot.title } : s.bot }
        }
        case 'start':
          return {
            running: { ...s.running, [e.botId]: true },
            streaming: { ...s.streaming, [e.botId]: { messageId: e.messageId, content: '', thinking: '' } }
          }
        case 'delta': {
          const cur = s.streaming[e.botId]
          if (!cur || cur.messageId !== e.messageId) return {}
          return {
            streaming: {
              ...s.streaming,
              [e.botId]: { ...cur, content: cur.content + (e.content ?? ''), thinking: cur.thinking + (e.thinking ?? '') }
            }
          }
        }
        case 'message': {
          const streaming = s.streaming[e.botId]?.messageId === e.message.id ? { ...s.streaming, [e.botId]: undefined } : s.streaming
          if (s.bot?.id !== e.botId) return { streaming }
          const exists = s.bot.messages.some((m) => m.id === e.message.id)
          const messages = exists
            ? s.bot.messages.map((m) => (m.id === e.message.id ? e.message : m))
            : [...s.bot.messages, e.message]
          return { streaming, bot: { ...s.bot, messages } }
        }
        case 'tool-update':
        case 'approval': {
          if (s.bot?.id !== e.botId) return {}
          const messages = s.bot.messages.map((m) =>
            m.id === e.messageId
              ? { ...m, toolRuns: (m.toolRuns ?? []).map((r) => (r.callId === e.run.callId ? e.run : r)) }
              : m
          )
          return { bot: { ...s.bot, messages } }
        }
        case 'done':
          return {
            running: { ...s.running, [e.botId]: false },
            streaming: { ...s.streaming, [e.botId]: undefined }
          }
        case 'notice':
          return { notices: { ...s.notices, [e.botId]: e.text } }
        case 'error':
          return {
            running: { ...s.running, [e.botId]: false },
            streaming: { ...s.streaming, [e.botId]: undefined },
            errors: { ...s.errors, [e.botId]: e.error }
          }
      }
    })
  }
}))
