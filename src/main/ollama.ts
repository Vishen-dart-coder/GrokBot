// Minimal Ollama REST client (https://github.com/ollama/ollama/blob/main/docs/api.md).
// Nothing here loads a model on its own: /api/version and /api/tags are metadata only,
// and /api/chat is only called when the user sends a message.

import type { OllamaModel, OllamaStatus, PullProgress } from '@shared/types'

export interface OllamaToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string
  images?: string[]
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  tool_name?: string
}

export interface ChatRequest {
  model: string
  messages: OllamaMessage[]
  tools?: OllamaToolSpec[]
  think?: boolean
  options?: { temperature?: number; num_ctx?: number }
  keep_alive?: string
}

export interface ChatChunk {
  model: string
  message?: OllamaMessage
  done: boolean
  done_reason?: string
  error?: string
}

type Fetch = typeof fetch

export class OllamaClient {
  constructor(
    private host: string,
    private fetchImpl: Fetch = fetch
  ) {}

  setHost(host: string) {
    this.host = host
  }

  private url(path: string) {
    return this.host.replace(/\/+$/, '') + path
  }

  async status(): Promise<OllamaStatus> {
    try {
      const res = await this.fetchImpl(this.url('/api/version'), { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const body = (await res.json()) as { version?: string }
      return { ok: true, version: body.version }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await this.fetchImpl(this.url('/api/tags'), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Ollama /api/tags failed: HTTP ${res.status}`)
    const body = (await res.json()) as {
      models?: {
        name: string
        size: number
        modified_at: string
        details?: { family?: string; parameter_size?: string; quantization_level?: string }
      }[]
    }
    return (body.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level
    }))
  }

  /** Streams a chat completion. Yields each NDJSON chunk as it arrives. */
  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
    const res = await this.fetchImpl(this.url('/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...req, stream: true }),
      signal
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(parseError(text) ?? `Ollama /api/chat failed: HTTP ${res.status}`)
    }
    for await (const obj of readNdjson(res.body)) {
      const chunk = obj as ChatChunk
      if (chunk.error) throw new Error(chunk.error)
      yield chunk
    }
  }

  /** Downloads a model (POST /api/pull). Only fetches weights; does not load or run it. */
  async *pull(model: string, signal?: AbortSignal): AsyncGenerator<PullProgress> {
    const res = await this.fetchImpl(this.url('/api/pull'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`Ollama /api/pull failed: HTTP ${res.status}`)
    for await (const obj of readNdjson(res.body)) {
      const p = obj as { status?: string; completed?: number; total?: number; error?: string }
      if (p.error) throw new Error(p.error)
      yield { model, status: p.status ?? '', completed: p.completed, total: p.total, done: p.status === 'success' }
    }
  }

  async deleteModel(model: string): Promise<void> {
    const res = await this.fetchImpl(this.url('/api/delete'), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model })
    })
    if (!res.ok) throw new Error(`Ollama /api/delete failed: HTTP ${res.status}`)
  }
}

function parseError(text: string): string | undefined {
  try {
    return (JSON.parse(text) as { error?: string }).error
  } catch {
    return text || undefined
  }
}

export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
    if (done) break
  }
  const rest = buf.trim()
  if (rest) yield JSON.parse(rest)
}
