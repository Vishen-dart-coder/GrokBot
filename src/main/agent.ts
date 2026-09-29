// The agent loop: stream a reply from Ollama, execute any tool calls (with approval),
// feed the results back, and repeat until the model answers without tools.

import { randomUUID } from 'node:crypto'
import type { AgentEvent, Attachment, Bot, ChatMessage, Settings, ToolCall, ToolRun } from '@shared/types'
import type { ChatChunk, OllamaClient, OllamaMessage, OllamaToolSpec } from './ollama'
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

/** Rough token estimate (~3.5 chars/token for English/code; images ≈ 800 tokens). */
export function estimateTokens(text: string, images = 0): number {
  return Math.ceil(text.length / 3.5) + images * 800
}

const msgTokens = (m: OllamaMessage) =>
  estimateTokens(m.content + (m.tool_calls ? JSON.stringify(m.tool_calls) : ''), m.images?.length ?? 0) + 4

/**
 * Keeps a conversation inside the model's context window. Ollama silently drops the *start*
 * of an over-long prompt (including the system prompt), so we trim deliberately instead:
 *  1. shrink old tool outputs, 2. drop the oldest turns, always keeping the system prompt
 *  and the latest user message. Leaves ~25% of the window for the reply.
 */
export function fitToContext(messages: OllamaMessage[], contextTokens: number): OllamaMessage[] {
  const budget = Math.floor(contextTokens * 0.75)
  const total = (ms: OllamaMessage[]) => ms.reduce((n, m) => n + msgTokens(m), 0)
  if (total(messages) <= budget) return messages

  const [system, ...rest] = messages
  const lastUser = rest.map((m) => m.role).lastIndexOf('user')
  // 1. Truncate tool outputs older than the latest user turn.
  let body = rest.map((m, i) =>
    m.role === 'tool' && i < lastUser && m.content.length > 1200
      ? { ...m, content: m.content.slice(0, 600) + '\n… [output trimmed to save context] …\n' + m.content.slice(-400) }
      : m
  )
  const note = { ...system, content: system.content + '\n\n[Earlier parts of this conversation were omitted to fit the context window.]' }
  // 2. Drop oldest messages until it fits (never the latest user message onwards).
  let keepFrom = 0
  const protectedFrom = Math.max(lastUser, 0)
  while (keepFrom < protectedFrom && total([note, ...body.slice(keepFrom)]) > budget) keepFrom++
  // Don't start on a tool result or an assistant turn whose tool results were cut.
  while (keepFrom < protectedFrom && body[keepFrom].role !== 'user') keepFrom++
  body = body.slice(keepFrom)
  // 3. Still too big (a long tool loop in the current turn): shrink all but the two newest tool outputs.
  if (total([note, ...body]) > budget) {
    const toolIdx = body.flatMap((m, i) => (m.role === 'tool' ? [i] : []))
    const keep = new Set(toolIdx.slice(-2))
    body = body.map((m, i) =>
      m.role === 'tool' && !keep.has(i) && m.content.length > 600
        ? { ...m, content: m.content.slice(0, 300) + '\n… [output trimmed to save context] …\n' + m.content.slice(-200) }
        : m
    )
  }
  return keepFrom > 0 ? [note, ...body] : [system, ...body]
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
  /** Models that rejected tool calling this session; they get plain chat right away. */
  private noToolModels = new Set<string>()

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
    await this.run(bot)
  }

  /** Drops everything after the last user message and runs the agent again. */
  async regenerate(botId: string): Promise<void> {
    if (this.running.has(botId)) throw new Error('This bot is already working. Stop it first.')
    const bot = await this.deps.store.getBot(botId)
    if (!bot) throw new Error(`bot ${botId} not found`)
    const lastUser = bot.messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser < 0) return
    bot.messages = bot.messages.slice(0, lastUser + 1)
    await this.deps.store.saveBot(bot)
    await this.run(bot)
  }

  /** Removes a message and everything after it (used by "edit message"). Returns the removed message. */
  async rewind(botId: string, messageId: string): Promise<ChatMessage | undefined> {
    if (this.running.has(botId)) throw new Error('This bot is already working. Stop it first.')
    const bot = await this.deps.store.getBot(botId)
    const i = bot?.messages.findIndex((m) => m.id === messageId) ?? -1
    if (!bot || i < 0) return undefined
    const removed = bot.messages[i]
    bot.messages = bot.messages.slice(0, i)
    bot.updatedAt = Date.now()
    await this.deps.store.saveBot(bot)
    this.deps.emit({ type: 'bot-updated', bot: summarize(bot) })
    return removed
  }

  private async run(bot: Bot): Promise<void> {
    const { store, emit } = this.deps
    const botId = bot.id
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
    let useTools = toolSpecs.length > 0 && !this.noToolModels.has(model)

    for (let step = 0; step < settings.maxAgentSteps; step++) {
      const reply: ChatMessage = { id: randomUUID(), role: 'assistant', content: '', createdAt: Date.now() }
      emit({ type: 'start', botId: bot.id, messageId: reply.id })
      const calls: ToolCall[] = []

      try {
        const request = () => {
          const system = buildSystemPrompt(settings, bot, useTools ? tools : [])
          const reserve = useTools ? estimateTokens(JSON.stringify(toolSpecs)) : 0
          return ollama.chat(
            {
              model,
              messages: fitToContext(toOllamaMessages(bot, system), settings.contextLength - reserve),
              tools: useTools ? toolSpecs : undefined,
              think: settings.think || undefined,
              options: { temperature: settings.temperature, num_ctx: settings.contextLength }
            },
            signal
          )
        }
        let stream = request()
        let first: IteratorResult<ChatChunk>
        try {
          first = await stream.next()
        } catch (e) {
          // Many Ollama models reject requests that include tools. Fall back to plain chat.
          if (!useTools || !/does not support tools/i.test(String((e as Error)?.message ?? e))) throw e
          useTools = false
          this.noToolModels.add(model)
          emit({
            type: 'notice',
            botId: bot.id,
            text: `${model} doesn't support tool calling, so GrokBot is chatting without tools. Pick a tool-capable model (e.g. qwen3, llama3.1) in Settings → Model to let it act on your computer.`
          })
          stream = request()
          first = await stream.next()
        }
        const chunks = (async function* () {
          if (!first.done) yield first.value
          yield* stream
        })()
        for await (const chunk of chunks) {
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
        if (reply.content || reply.thinking || calls.length || reply.error) {
          bot.messages.push(reply)
          await store.saveBot(bot)
          emit({ type: 'message', botId: bot.id, message: reply })
        }
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
