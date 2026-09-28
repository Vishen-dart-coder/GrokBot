// JSON-file persistence for settings and bots (chat sessions), stored under the app's userData dir.

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Bot, BotSummary, Settings } from '@shared/types'
import { defaultSettings } from '@shared/defaults'

async function writeJsonAtomic(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export function summarize(bot: Bot): BotSummary {
  const { messages, ...rest } = bot
  const last = [...messages].reverse().find((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
  return { ...rest, preview: last?.content.slice(0, 140) ?? '' }
}

export class Store {
  private settingsCache?: Settings
  private bots = new Map<string, Bot>()
  private loaded = false

  constructor(
    private dataDir: string,
    private home: string
  ) {}

  private get settingsFile() {
    return path.join(this.dataDir, 'settings.json')
  }

  private botFile(id: string) {
    return path.join(this.dataDir, 'bots', `${id}.json`)
  }

  async getSettings(): Promise<Settings> {
    if (this.settingsCache) return this.settingsCache
    const defaults = defaultSettings(this.home)
    try {
      const saved = JSON.parse(await fs.readFile(this.settingsFile, 'utf8')) as Partial<Settings>
      this.settingsCache = {
        ...defaults,
        ...saved,
        enabledTools: { ...defaults.enabledTools, ...(saved.enabledTools ?? {}) }
      }
    } catch {
      this.settingsCache = defaults
    }
    return this.settingsCache
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch }
    this.settingsCache = next
    await writeJsonAtomic(this.settingsFile, next)
    return next
  }

  private async loadBots() {
    if (this.loaded) return
    this.loaded = true
    const dir = path.join(this.dataDir, 'bots')
    const files = await fs.readdir(dir).catch(() => [] as string[])
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const bot = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as Bot
        this.bots.set(bot.id, bot)
      } catch {
        // skip corrupt file
      }
    }
  }

  async listBots(): Promise<BotSummary[]> {
    await this.loadBots()
    return [...this.bots.values()]
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
      .map(summarize)
  }

  async getBot(id: string): Promise<Bot | undefined> {
    await this.loadBots()
    return this.bots.get(id)
  }

  async createBot(title = 'New bot'): Promise<Bot> {
    await this.loadBots()
    const settings = await this.getSettings()
    const id = randomUUID()
    const now = Date.now()
    const workspace = path.join(settings.workspaceRoot, id.slice(0, 8))
    await fs.mkdir(workspace, { recursive: true })
    const bot: Bot = { id, title, createdAt: now, updatedAt: now, workspace, messages: [] }
    this.bots.set(id, bot)
    await this.saveBot(bot)
    return bot
  }

  async saveBot(bot: Bot): Promise<void> {
    this.bots.set(bot.id, bot)
    await writeJsonAtomic(this.botFile(bot.id), bot)
  }

  async updateBot(id: string, patch: Partial<Pick<Bot, 'title' | 'pinned' | 'model' | 'workspace'>>): Promise<Bot> {
    const bot = await this.getBot(id)
    if (!bot) throw new Error(`bot ${id} not found`)
    const next = { ...bot, ...patch, updatedAt: Date.now() }
    if (patch.workspace) await fs.mkdir(patch.workspace, { recursive: true })
    await this.saveBot(next)
    return next
  }

  async deleteBot(id: string): Promise<void> {
    this.bots.delete(id)
    await fs.rm(this.botFile(id), { force: true })
  }

  /** Full-text search over titles and message contents. */
  async search(query: string): Promise<{ bot: BotSummary; snippet: string; messageId?: string }[]> {
    await this.loadBots()
    const q = query.trim().toLowerCase()
    if (!q) return []
    const results: { bot: BotSummary; snippet: string; messageId?: string; score: number }[] = []
    for (const bot of this.bots.values()) {
      if (bot.title.toLowerCase().includes(q)) {
        results.push({ bot: summarize(bot), snippet: bot.title, score: 2 + bot.updatedAt / 1e15 })
        continue
      }
      const hit = bot.messages.find((m) => m.role !== 'tool' && m.content.toLowerCase().includes(q))
      if (hit) {
        const i = hit.content.toLowerCase().indexOf(q)
        const snippet = (i > 40 ? '…' : '') + hit.content.slice(Math.max(0, i - 40), i + 100)
        results.push({ bot: summarize(bot), snippet, messageId: hit.id, score: 1 + bot.updatedAt / 1e15 })
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 50).map(({ score: _s, ...r }) => r)
  }
}
