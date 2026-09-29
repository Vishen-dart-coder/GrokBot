import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/types'
import { Agent, estimateTokens, fitToContext } from '../src/main/agent'
import type { ChatChunk, ChatRequest, OllamaClient, OllamaMessage } from '../src/main/ollama'
import { Store, toMarkdown } from '../src/main/store'
import { builtinTools } from '../src/main/tools'

const say = (content: string): ChatChunk => ({ model: 'fake', message: { role: 'assistant', content }, done: false })

/** Fake Ollama: each turn is either chunks to stream or an Error to throw. */
class FakeOllama {
  requests: ChatRequest[] = []
  constructor(private turns: (ChatChunk[] | Error)[]) {}
  async *chat(req: ChatRequest): AsyncGenerator<ChatChunk> {
    this.requests.push(structuredClone(req))
    const turn = this.turns.shift()
    if (!turn) throw new Error('no scripted turn left')
    if (turn instanceof Error) throw turn
    for (const c of turn) yield c
  }
}

let store: Store
let events: AgentEvent[]
beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'grokbot-impr-'))
  store = new Store(path.join(dir, 'data'), dir)
  await store.updateSettings({ model: 'fake', workspaceRoot: path.join(dir, 'ws') })
  events = []
})
const agentWith = (o: FakeOllama) =>
  new Agent({ store, ollama: o as unknown as OllamaClient, tools: () => builtinTools, emit: (e) => events.push(e) })

describe('fitToContext', () => {
  const sys: OllamaMessage = { role: 'system', content: 'You are GrokBot.' }
  const big = (role: OllamaMessage['role'], n: number): OllamaMessage => ({ role, content: 'x'.repeat(n) })

  it('leaves short conversations untouched', () => {
    const msgs = [sys, { role: 'user' as const, content: 'hi' }]
    expect(fitToContext(msgs, 8192)).toBe(msgs)
  })

  it('keeps the system prompt and latest user message, drops the oldest turns', () => {
    const msgs = [sys, big('user', 20000), big('assistant', 20000), big('user', 20000), big('assistant', 20000), { role: 'user' as const, content: 'latest question' }]
    const out = fitToContext(msgs, 8192)
    expect(out[0].role).toBe('system')
    expect(out[0].content).toContain('omitted')
    expect(out.at(-1)?.content).toBe('latest question')
    expect(out[1].role).toBe('user') // never starts mid-turn
    expect(out.reduce((n, m) => n + estimateTokens(m.content), 0)).toBeLessThanOrEqual(8192 * 0.75)
  })

  it('trims large tool outputs in the current turn as a last resort', () => {
    const msgs: OllamaMessage[] = [sys, { role: 'user', content: 'do it' }]
    for (let i = 0; i < 6; i++) msgs.push({ role: 'assistant', content: '' }, big('tool', 6000))
    const out = fitToContext(msgs, 8192)
    const tools = out.filter((m) => m.role === 'tool')
    expect(tools.slice(0, -2).every((m) => m.content.includes('trimmed'))).toBe(true)
    expect(tools.slice(-2).every((m) => m.content.length === 6000)).toBe(true)
  })
})

describe('Agent improvements', () => {
  it('falls back to plain chat when the model does not support tools', async () => {
    const o = new FakeOllama([new Error('registry.ollama.ai/library/gemma:2b does not support tools'), [say('Hello without tools')]])
    const bot = await store.createBot()
    await agentWith(o).send(bot.id, 'hi')
    expect(o.requests[0].tools?.length).toBeGreaterThan(0)
    expect(o.requests[1].tools).toBeUndefined()
    expect(events.some((e) => e.type === 'notice')).toBe(true)
    expect((await store.getBot(bot.id))?.messages.at(-1)?.content).toBe('Hello without tools')
  })

  it('remembers models without tool support', async () => {
    const o = new FakeOllama([new Error('gemma:2b does not support tools'), [say('one')], [say('two')]])
    const bot = await store.createBot()
    const agent = agentWith(o)
    await agent.send(bot.id, 'a')
    await agent.send(bot.id, 'b')
    expect(o.requests.map((r) => !!r.tools)).toEqual([true, false, false])
  })

  it('does not save an empty assistant message when the request fails', async () => {
    const bot = await store.createBot()
    await agentWith(new FakeOllama([new Error('model "x" not found')])).send(bot.id, 'hi')
    const saved = await store.getBot(bot.id)
    expect(saved?.messages.map((m) => m.role)).toEqual(['user'])
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: 'model "x" not found' })
  })

  it('regenerates the last reply', async () => {
    const o = new FakeOllama([[say('first answer')], [say('second answer')]])
    const bot = await store.createBot()
    const agent = agentWith(o)
    await agent.send(bot.id, 'question')
    await agent.regenerate(bot.id)
    const msgs = (await store.getBot(bot.id))!.messages
    expect(msgs.map((m) => m.content)).toEqual(['question', 'second answer'])
  })

  it('rewinds to a message for editing', async () => {
    const o = new FakeOllama([[say('a1')], [say('a2')]])
    const bot = await store.createBot()
    const agent = agentWith(o)
    await agent.send(bot.id, 'q1')
    await agent.send(bot.id, 'q2')
    const q2 = (await store.getBot(bot.id))!.messages[2]
    const removed = await agent.rewind(bot.id, q2.id)
    expect(removed?.content).toBe('q2')
    expect((await store.getBot(bot.id))!.messages.map((m) => m.content)).toEqual(['q1', 'a1'])
  })
})

describe('toMarkdown', () => {
  it('exports messages and tool runs', async () => {
    const bot = await store.createBot('Export me')
    bot.messages.push(
      { id: '1', role: 'user', content: 'list files', createdAt: 0 },
      { id: '2', role: 'assistant', content: '', createdAt: 0, toolRuns: [{ callId: 'c', name: 'list_dir', arguments: {}, status: 'done', output: 'a.txt' }] },
      { id: '3', role: 'tool', content: 'a.txt', createdAt: 0 },
      { id: '4', role: 'assistant', content: 'There is **a.txt**.', createdAt: 0 }
    )
    const md = toMarkdown(bot)
    expect(md).toContain('# Export me')
    expect(md).toContain('## You\n\nlist files')
    expect(md).toContain('🔧 list_dir — done')
    expect(md).toContain('There is **a.txt**.')
    expect(md.match(/a\.txt/g)?.length).toBe(2) // tool message itself isn't duplicated
  })
})
