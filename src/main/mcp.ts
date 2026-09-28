// "Connect apps": Model Context Protocol servers whose tools are exposed to the agent
// as `mcp__<server>__<tool>`.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig, McpServerStatus } from '@shared/types'
import type { ToolDef } from './tools'
import { truncate } from './tools'

interface Connection {
  config: McpServerConfig
  client?: Client
  status: McpServerStatus
  tools: ToolDef[]
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'server'
}

export class McpManager {
  private conns = new Map<string, Connection>()

  constructor(private onChange: (status: McpServerStatus[]) => void = () => {}) {}

  statuses(): McpServerStatus[] {
    return [...this.conns.values()].map((c) => c.status)
  }

  tools(): ToolDef[] {
    return [...this.conns.values()].flatMap((c) => c.tools)
  }

  /** Reconciles live connections with the configured server list. */
  async sync(configs: McpServerConfig[]): Promise<void> {
    const wanted = new Map(configs.map((c) => [c.id, c]))
    for (const [id, conn] of this.conns) {
      const next = wanted.get(id)
      if (!next || JSON.stringify(next) !== JSON.stringify(conn.config)) await this.disconnect(id)
    }
    await Promise.all(
      configs.map(async (config) => {
        if (this.conns.has(config.id)) return
        if (!config.enabled) {
          this.conns.set(config.id, { config, tools: [], status: { id: config.id, name: config.name, state: 'disabled', tools: [] } })
          return
        }
        await this.connect(config)
      })
    )
    this.onChange(this.statuses())
  }

  private async connect(config: McpServerConfig) {
    const conn: Connection = {
      config,
      tools: [],
      status: { id: config.id, name: config.name, state: 'connecting', tools: [] }
    }
    this.conns.set(config.id, conn)
    this.onChange(this.statuses())
    try {
      const client = new Client({ name: 'grokbot-local', version: '0.1.0' })
      const transport =
        config.transport === 'http'
          ? new StreamableHTTPClientTransport(new URL(config.url ?? ''))
          : new StdioClientTransport({
              command: config.command ?? '',
              args: config.args ?? [],
              env: { ...(process.env as Record<string, string>), ...(config.env ?? {}) },
              stderr: 'ignore'
            })
      await client.connect(transport)
      const { tools } = await client.listTools()
      const prefix = `mcp__${slug(config.name)}__`
      conn.client = client
      conn.tools = tools.map((t) => ({
        name: prefix + t.name,
        description: `[${config.name}] ${t.description ?? t.name}`,
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        risky: !t.annotations?.readOnlyHint,
        run: async (args) => {
          const result = await client.callTool({ name: t.name, arguments: args })
          const parts = (result.content as { type: string; text?: string; data?: string }[] | undefined) ?? []
          const text = parts.map((p) => (p.type === 'text' ? p.text : `[${p.type} content]`)).join('\n')
          const images = parts.filter((p) => p.type === 'image' && p.data).map((p) => p.data as string)
          return { output: truncate((result.isError ? '[tool error] ' : '') + (text || '(no output)')), images }
        }
      }))
      conn.status = { ...conn.status, state: 'connected', tools: tools.map((t) => t.name) }
    } catch (e) {
      conn.status = { ...conn.status, state: 'error', error: e instanceof Error ? e.message : String(e) }
    }
    this.onChange(this.statuses())
  }

  private async disconnect(id: string) {
    const conn = this.conns.get(id)
    this.conns.delete(id)
    await conn?.client?.close().catch(() => {})
  }

  async closeAll() {
    await Promise.all([...this.conns.keys()].map((id) => this.disconnect(id)))
  }
}
