// The agent loop: stream a reply from Ollama, execute any tool calls (with approval),
// feed the results back, and repeat until the model answers without tools.

import { randomUUID } from 'node:crypto'
import type { AgentEvent, Attachment, Bot, ChatMessage, Settings, ToolCall, ToolRun } from '@shared/types'
import type { OllamaClient, OllamaMessage, OllamaToolSpec } from './ollama'
import type { Store } from './store'
import { summarize } from './store'
import type { ToolDef } from './tools'

export interface AgentDeps {
  store: Store
  ollama: OllamaClient
  /** All currently available tools (built-in + MCP), before filtering by settings. */
  tools: () => ToolDef[]
  emit: (e: AgentEvent) => void
  screenshot?: () => Promise<string>
}

export function needsApproval(tool: ToolDef, mode: Settings['approvalMode']): boolean {
  if (mode === 'auto') return false
  if (mode === 'ask') return true
  return tool.risky
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New bot'
  return clean.length > 48 ? clean.slice(0, 45).trimEnd() + '…' : clean
}

export function buildSystemPrompt(settings: Settings, bot: Bot, tools: ToolDef[]): string {
  const lines = [
    settings.systemPrompt.trim(),
    '',
    `Workspace (your computer): ${bot.workspace}`,
    `Operating system: ${process.platform}`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`
  ]
  if (settings.userName) lines.push(`The user's name is ${settings.userName}.`)
  if (tools.length) lines.push(`Available tools: ${tools.map((t) => t.name).join(', ')}`)
  return lines.join('\n')
}

function attachmentNote(atts: Attachment[] | undefined): string {
  const files = (atts ?? []).filter((a) => !a.base64)
  if (!files.length) return ''
  return '\n\n' + files.map((a) => `[Attached file saved in workspace: ${a.path} (${a.mime}, ${a.size} bytes)]`).join('\n')
}

export function toOllamaMessages(bot: Bot, system: string): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: system }]
  for (const m of bot.messages) {
    if (m.role === 'user') {
      const images = (m.attachments ?? []).filter((a) => a.base64).map((a) => a.base64 as string)
      out.push({ role: 'user', content: m.content + attachmentNote(m.attachments), ...(images.length ? { images } : {}) })
    } else if (m.role === 'assistant') {
      if (m.error && !m.content && !m.toolCalls?.length) continue
      out.push({
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) }
          : {})
      })
    } else if (m.role === 'tool') {
      const images = (m.attachments ?? []).filter((a) => a.base64).map((a) => a.base64 as string)
      out.push({ role: 'tool', content: m.content, tool_name: m.toolName, ...(images.length ? { images } : {}) })
    }
  }
  return out
}

export class Agent {
  private running = new Map<string, AbortController>()
  private approvals = new Map<string, (allow: boolean) => void>()
  /** Tools the user chose "always allow" for, per bot. */
  private alwaysAllow = new Map<string, Set<string>>()

  constructor(private deps: AgentDeps) {}

  isRunning(botId: string) {
    return this.running.has(botId)
  }

  stop(botId: string) {
    this.running.get(botId)?.abort()
    for (const [id, resolve] of this.approvals) {
      if (id.startsWith(botId + ':')) resolve(false)
    }
  }

  respondApproval(botId: string, callId: string, allow: boolean, always = false) {
    const key = `${botId}:${callId}`
    const resolve = this.approvals.get(key)
    if (!resolve) return
    if (always && allow) {
      const run = this.pendingNames.get(key)
      if (run) {
        const set = this.alwaysAllow.get(botId) ?? new Set()
        set.add(run)
        this.alwaysAllow.set(botId, set)
      }
    }
    resolve(allow)
  }

  private pendingNames = new Map<string, string>()

  private activeTools(settings: Settings): ToolDef[] {
    return this.deps.tools().filter((t) => t.name.startsWith('mcp__') || settings.enabledTools[t.name] !== false)
  }

  async send(botId: string, text: string, attachments: Attachment[] = []): Promise<void> {
    const { store, emit } = this.deps
    if (this.running.has(botId)) throw new Error('This bot is already working. Stop it first.')
    const bot = await store.getBot(botId)
    if (!bot) throw new Error(`bot ${botId} not found`)

    const userMsg: ChatMessage = { id: randomUUID(), role: 'user', content: text, attachments, createdAt: Date.now() }
    bot.messages.push(userMsg)
    if (bot.title === 'New bot' && bot.messages.filter((m) => m.role === 'user').length === 1) bot.title = titleFrom(text)
    bot.updatedAt = Date.now()
    await store.saveBot(bot)
    emit({ type: 'message', botId, message: userMsg })
    emit({ type: 'bot-updated', bot: summarize(bot) })

    const controller = new AbortController()
    this.running.set(botId, controller)
    try {
      await this.loop(bot, controller.signal)
      emit({ type: 'done', botId })
    } catch (e) {
      const aborted = controller.signal.aborted
      const error = aborted ? 'Stopped.' : e instanceof Error ? e.message : String(e)
      emit(aborted ? { type: 'done', botId } : { type: 'error', botId, error })
    } finally {
      this.running.delete(botId)
      bot.updatedAt = Date.now()
      await store.saveBot(bot)
      emit({ type: 'bot-updated', bot: summarize(bot) })
    }
  }

  private async loop(bot: Bot, signal: AbortSignal) {
    const { store, ollama, emit } = this.deps
    const settings = await store.getSettings()
    const model = bot.model || settings.model
    if (!model) throw new Error('No model selected. Open Settings → Model and pick an Ollama model.')

    const tools = this.activeTools(settings)
    const toolSpecs: OllamaToolSpec[] = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))
    const byName = new Map(tools.map((t) => [t.name, t]))

    for (let step = 0; step < settings.maxAgentSteps; step++) {
      const reply: ChatMessage = { id: randomUUID(), role: 'assistant', content: '', createdAt: Date.now() }
      emit({ type: 'start', botId: bot.id, messageId: reply.id })
      const calls: ToolCall[] = []

      try {
        const stream = ollama.chat(
          {
            model,
            messages: toOllamaMessages(bot, buildSystemPrompt(settings, bot, tools)),
            tools: toolSpecs.length ? toolSpecs : undefined,
            think: settings.think || undefined,
            options: { temperature: settings.temperature, num_ctx: settings.contextLength }
          },
          signal
        )
        for await (const chunk of stream) {
          const m = chunk.message
          if (!m) continue
          if (m.content || m.thinking) {
            reply.content += m.content ?? ''
            if (m.thinking) reply.thinking = (reply.thinking ?? '') + m.thinking
            emit({ type: 'delta', botId: bot.id, messageId: reply.id, content: m.content, thinking: m.thinking })
          }
          for (const tc of m.tool_calls ?? []) {
            calls.push({ id: randomUUID(), name: tc.function.name, arguments: parseArgs(tc.function.arguments) })
          }
        }
      } catch (e) {
        if (reply.content || calls.length) {
          reply.error = e instanceof Error ? e.message : String(e)
        } else throw e
      } finally {
        if (calls.length) reply.toolCalls = calls
        if (calls.length) reply.toolRuns = calls.map((c) => ({ callId: c.id, name: c.name, arguments: c.arguments, status: 'running' }))
        bot.messages.push(reply)
        await store.saveBot(bot)
        emit({ type: 'message', botId: bot.id, message: reply })
      }

      if (!calls.length || reply.error) return

      for (const call of calls) {
        const run = reply.toolRuns!.find((r) => r.callId === call.id)!
        const result = await this.execute(bot, reply.id, call, run, byName.get(call.name), settings, signal)
        const toolMsg: ChatMessage = {
          id: randomUUID(),
          role: 'tool',
          content: result.output,
          toolName: call.name,
          toolCallId: call.id,
          createdAt: Date.now(),
          attachments: result.images?.map((b64, i) => ({ name: `image-${i}.png`, path: '', mime: 'image/png', size: b64.length, base64: b64 }))
        }
        bot.messages.push(toolMsg)
        await store.saveBot(bot)
      }
      if (signal.aborted) throw new Error('aborted')
    }
    const note: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: `_Stopped after ${settings.maxAgentSteps} steps. Send "continue" to keep going._`,
      createdAt: Date.now()
    }
    bot.messages.push(note)
    emit({ type: 'message', botId: bot.id, message: note })
  }

  private async execute(
    bot: Bot,
    messageId: string,
    call: ToolCall,
    run: ToolRun,
    tool: ToolDef | undefined,
    settings: Settings,
    signal: AbortSignal
  ): Promise<{ output: string; images?: string[] }> {
    const { emit } = this.deps
    const update = (patch: Partial<ToolRun>) => {
      Object.assign(run, patch)
      emit({ type: 'tool-update', botId: bot.id, messageId, run: { ...run } })
    }
    if (signal.aborted) {
      update({ status: 'denied', output: 'Stopped by user.' })
      return { output: 'Stopped by user.' }
    }
    if (!tool) {
      const output = `Error: unknown tool "${call.name}".`
      update({ status: 'error', output })
      return { output }
    }
    if (needsApproval(tool, settings.approvalMode) && !this.alwaysAllow.get(bot.id)?.has(tool.name)) {
      update({ status: 'pending-approval' })
      emit({ type: 'approval', botId: bot.id, messageId, run: { ...run } })
      const key = `${bot.id}:${call.id}`
      this.pendingNames.set(key, tool.name)
      const allowed = await new Promise<boolean>((resolve) => this.approvals.set(key, resolve))
      this.approvals.delete(key)
      this.pendingNames.delete(key)
      if (!allowed) {
        const output = 'The user denied this tool call.'
        update({ status: 'denied', output })
        return { output }
      }
    }
    update({ status: 'running' })
    try {
      const result = await tool.run(call.arguments, {
        workspace: bot.workspace,
        signal,
        shellTimeoutSec: settings.shellTimeoutSec,
        screenshot: this.deps.screenshot
      })
      update({ status: 'done', output: result.output })
      return result
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      update({ status: 'error', output })
      return { output }
    }
  }
}

function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>
    } catch {
      return { input: args }
    }
  }
  return (args as Record<string, unknown>) ?? {}
}
