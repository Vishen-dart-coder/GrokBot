import { describe, expect, it } from 'vitest'
import { OllamaClient, readNdjson } from '../src/main/ollama'

function stream(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      parts.forEach((p) => c.enqueue(enc.encode(p)))
      c.close()
    }
  })
}

function fakeFetch(routes: Record<string, (body?: unknown) => Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const handler = routes[url.pathname]
    if (!handler) return new Response('not found', { status: 404 })
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined)
  }) as typeof fetch
}

describe('readNdjson', () => {
  it('parses lines split across chunks', async () => {
    const out = []
    for await (const o of readNdjson(stream(['{"a":1}\n{"a"', ':2}\n', '{"a":3}']))) out.push(o)
    expect(out).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }])
  })
})

describe('OllamaClient', () => {
  it('reports status and lists models', async () => {
    const client = new OllamaClient(
      'http://ollama.test/',
      fakeFetch({
        '/api/version': () => Response.json({ version: '0.12.0' }),
        '/api/tags': () =>
          Response.json({
            models: [{ name: 'qwen3:8b', size: 5e9, modified_at: 'x', details: { family: 'qwen3', parameter_size: '8B', quantization_level: 'Q4_K_M' } }]
          })
      })
    )
    expect(await client.status()).toEqual({ ok: true, version: '0.12.0' })
    expect(await client.listModels()).toEqual([
      { name: 'qwen3:8b', size: 5e9, modifiedAt: 'x', family: 'qwen3', parameterSize: '8B', quantization: 'Q4_K_M' }
    ])
  })

  it('reports offline status without throwing', async () => {
    const client = new OllamaClient('http://127.0.0.1:1', (async () => {
      throw new Error('ECONNREFUSED')
    }) as typeof fetch)
    expect(await client.status()).toEqual({ ok: false, error: 'ECONNREFUSED' })
  })

  it('streams chat chunks and sends stream:true', async () => {
    let sent: Record<string, unknown> | undefined
    const client = new OllamaClient(
      'http://ollama.test',
      fakeFetch({
        '/api/chat': (body) => {
          sent = body as Record<string, unknown>
          return new Response(
            stream([
              JSON.stringify({ model: 'm', message: { role: 'assistant', content: 'Hel' }, done: false }) + '\n',
              JSON.stringify({ model: 'm', message: { role: 'assistant', content: 'lo' }, done: true }) + '\n'
            ])
          )
        }
      })
    )
    let text = ''
    for await (const c of client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })) text += c.message?.content ?? ''
    expect(text).toBe('Hello')
    expect(sent?.stream).toBe(true)
  })

  it('surfaces Ollama error messages', async () => {
    const client = new OllamaClient(
      'http://ollama.test',
      fakeFetch({ '/api/chat': () => Response.json({ error: 'model "nope" not found' }, { status: 404 }) })
    )
    await expect(async () => {
      for await (const _ of client.chat({ model: 'nope', messages: [] })) void _
    }).rejects.toThrow('model "nope" not found')
  })
})
