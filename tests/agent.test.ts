// End-to-end agent loop against a scripted fake Ollama — no model is loaded.
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/types'
import { Agent, toOllamaMessages } from '../src/main/agent'
import type { ChatChunk, ChatRequest, OllamaClient } from '../src/main/ollama'
import { Store } from '../src/main/store'
import { builtinTools } from '../src/main/tools'

class ScriptedOllama {
  requests: ChatRequest[] = []
  constructor(private turns: ChatChunk[][]) {}
  async *chat(req: ChatRequest): AsyncGenerator<ChatChunk> {
    this.requests.push(structuredClone(req))
    const turn = this.turns.shift()
    if (!turn) throw new Error('no scripted turn left')
    for (const c of turn) yield c
  }
}

const say = (content: string): ChatChunk => ({ model: 'fake', message: { role: 'assistant', content }, done: false })
const call = (name: string, args: Record<string, unknown>): ChatChunk => ({
  model: 'fake',
  message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] },
  done: true
})

let store: Store
let events: AgentEvent[]

beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'grokbot-store-'))
  store = new Store(path.join(dir, 'data'), dir)
  await store.updateSettings({ model: 'fake:latest', workspaceRoot: path.join(dir, 'ws') })
  events = []
})

function makeAgent(ollama: ScriptedOllama, autoApprove?: boolean) {
  const agent: Agent = new Agent({
    store,
    ollama: ollama as unknown as OllamaClient,
    tools: () => builtinTools,
    emit: (e) => {
      events.push(e)
      if (e.type === 'approval' && autoApprove !== undefined) {
        queueMicrotask(() => agent.respondApproval(e.botId, e.run.callId, autoApprove))
      }
    }
  })
  return agent
}

describe('Agent', () => {
  it('streams a plain answer and titles the bot', async () => {
    const ollama = new ScriptedOllama([[say('Hi '), say('there!')]])
    const bot = await store.createBot()
    await makeAgent(ollama).send(bot.id, 'Say hello to me please')
    const saved = await store.getBot(bot.id)
    expect(saved?.title).toBe('Say hello to me please')
    expect(saved?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Say hello to me please'],
      ['assistant', 'Hi there!']
    ])
    expect(events.filter((e) => e.type === 'delta')).toHaveLength(2)
    expect(events.at(-2)?.type).toBe('done')
    expect(ollama.requests[0].model).toBe('fake:latest')
    expect(ollama.requests[0].tools?.map((t) => t.function.name)).toContain('run_shell')
  })

  it('runs an approved tool call and feeds the result back', async () => {
    const ollama = new ScriptedOllama([[call('write_file', { path: 'a.txt', content: 'hello' })], [say('Done.')]])
    const bot = await store.createBot()
    await makeAgent(ollama, true).send(bot.id, 'write a file')
    expect(await readFile(path.join(bot.workspace, 'a.txt'), 'utf8')).toBe('hello')
    const second = ollama.requests[1].messages
    expect(second.at(-2)?.tool_calls?.[0].function.name).toBe('write_file')
    expect(second.at(-1)).toMatchObject({ role: 'tool', tool_name: 'write_file' })
    const saved = await store.getBot(bot.id)
    expect(saved?.messages.at(-1)?.content).toBe('Done.')
    expect(saved?.messages[1].toolRuns?.[0].status).toBe('done')
  })

  it('does not run denied tools', async () => {
    const ollama = new ScriptedOllama([[call('run_shell', { command: 'touch pwned' })], [say('OK, I will not.')]])
    const bot = await store.createBot()
    await makeAgent(ollama, false).send(bot.id, 'do it')
    await expect(readFile(path.join(bot.workspace, 'pwned'))).rejects.toThrow()
    expect(ollama.requests[1].messages.at(-1)?.content).toBe('The user denied this tool call.')
  })

  it('auto-runs read-only tools without approval', async () => {
    const ollama = new ScriptedOllama([[call('list_dir', {})], [say('Empty.')]])
    const bot = await store.createBot()
    await makeAgent(ollama).send(bot.id, 'what is here?')
    expect(events.some((e) => e.type === 'approval')).toBe(false)
  })

  it('reports a clear error when no model is configured', async () => {
    await store.updateSettings({ model: '' })
    const bot = await store.createBot()
    await makeAgent(new ScriptedOllama([])).send(bot.id, 'hi')
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: expect.stringMatching(/No model selected/) })
  })

  it('sends image attachments as images and notes file attachments', () => {
    const msgs = toOllamaMessages(
      {
        id: 'b',
        title: 't',
        createdAt: 0,
        updatedAt: 0,
        workspace: '/ws',
        messages: [
          {
            id: 'm',
            role: 'user',
            content: 'look',
            createdAt: 0,
            attachments: [
              { name: 'a.png', path: 'uploads/a.png', mime: 'image/png', size: 3, base64: 'AAA' },
              { name: 'b.csv', path: 'uploads/b.csv', mime: 'text/csv', size: 9 }
            ]
          }
        ]
      },
      'sys'
    )
    expect(msgs[1].images).toEqual(['AAA'])
    expect(msgs[1].content).toContain('uploads/b.csv')
  })
})

describe('Store search', () => {
  it('finds bots by title and message text', async () => {
    const bot = await store.createBot('Trip planning')
    bot.messages.push({ id: '1', role: 'user', content: 'Book a hotel in Lisbon', createdAt: 0 })
    await store.saveBot(bot)
    expect((await store.search('lisbon'))[0].snippet).toContain('Lisbon')
    expect((await store.search('trip'))[0].bot.id).toBe(bot.id)
  })
})
