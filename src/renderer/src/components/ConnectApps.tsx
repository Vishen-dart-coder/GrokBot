import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { McpServerConfig } from '@shared/types'
import { useApp } from '@/lib/store'
import { Modal, Switch } from './SettingsDialog'

const PRESETS: { name: string; blurb: string; config: Omit<McpServerConfig, 'id' | 'enabled'> }[] = [
  {
    name: 'Browser (Playwright)',
    blurb: 'Let the agent open and control a web browser.',
    config: { name: 'Browser', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] }
  },
  {
    name: 'Filesystem',
    blurb: 'Read and write files in a folder you choose.',
    config: { name: 'Filesystem', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '~/Documents'] }
  },
  {
    name: 'Memory',
    blurb: 'Persistent knowledge-graph memory across bots.',
    config: { name: 'Memory', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }
  },
  {
    name: 'GitHub',
    blurb: 'Issues, PRs and repos (needs GITHUB_PERSONAL_ACCESS_TOKEN).',
    config: {
      name: 'GitHub',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }
    }
  }
]

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  )
}

export function ConnectApps() {
  const { settings, mcp, updateSettings, setModal } = useApp()
  const servers = settings?.mcpServers ?? []
  const [draft, setDraft] = useState<Omit<McpServerConfig, 'id' | 'enabled'> | null>(null)
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')

  const save = (next: McpServerConfig[]) => updateSettings({ mcpServers: next })

  const startDraft = (c: Omit<McpServerConfig, 'id' | 'enabled'>) => {
    setDraft(c)
    setArgsText((c.args ?? []).join(' '))
    setEnvText(Object.entries(c.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'))
  }

  const add = () => {
    if (!draft?.name.trim()) return
    const cfg: McpServerConfig = {
      ...draft,
      id: crypto.randomUUID(),
      enabled: true,
      args: argsText.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) ?? [],
      env: parseEnv(envText)
    }
    void save([...servers, cfg])
    setDraft(null)
  }

  return (
    <Modal title="Connect apps" onClose={() => setModal(null)}>
      <div className="modal-content">
        <p className="muted" style={{ marginTop: 0 }}>
          Apps are Model Context Protocol (MCP) servers. Their tools become available to every bot.
        </p>

        {servers.map((srv) => {
          const st = mcp.find((m) => m.id === srv.id)
          return (
            <div className="model-row" key={srv.id}>
              <span className={`status-dot ${st?.state === 'connected' ? 'ok' : ''}`} style={st?.state === 'disabled' ? { background: 'var(--text-3)' } : {}} />
              <div className="grow">
                <div>{srv.name}</div>
                <div className="meta">
                  {st?.state === 'connected'
                    ? `${st.tools.length} tools: ${st.tools.slice(0, 6).join(', ')}${st.tools.length > 6 ? '…' : ''}`
                    : st?.state === 'error'
                      ? `Error: ${st.error}`
                      : (st?.state ?? 'pending')}
                </div>
                <div className="meta" style={{ fontFamily: 'var(--mono)' }}>
                  {srv.transport === 'http' ? srv.url : [srv.command, ...(srv.args ?? [])].join(' ')}
                </div>
              </div>
              <Switch on={srv.enabled} onChange={(enabled) => save(servers.map((x) => (x.id === srv.id ? { ...x, enabled } : x)))} />
              <button className="icon-btn sm" title="Remove" onClick={() => save(servers.filter((x) => x.id !== srv.id))}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}

        {!draft && (
          <>
            <div className="sidebar-section" style={{ paddingLeft: 0 }}>
              Suggested
            </div>
            <div className="cards" style={{ marginBottom: 12 }}>
              {PRESETS.map((p) => (
                <button key={p.name} className="card" onClick={() => startDraft(p.config)}>
                  <strong>{p.name}</strong>
                  {p.blurb}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => startDraft({ name: '', transport: 'stdio', command: '' })}>
              <Plus size={14} /> Custom app
            </button>
          </>
        )}

        {draft && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
            <div className="field">
              <label>Name</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Transport</label>
              <select className="select" value={draft.transport} onChange={(e) => setDraft({ ...draft, transport: e.target.value as 'stdio' | 'http' })}>
                <option value="stdio">Local command (stdio)</option>
                <option value="http">Remote URL (streamable HTTP)</option>
              </select>
            </div>
            {draft.transport === 'stdio' ? (
              <>
                <div className="field">
                  <label>Command</label>
                  <input className="input" value={draft.command ?? ''} placeholder="npx" onChange={(e) => setDraft({ ...draft, command: e.target.value })} />
                </div>
                <div className="field">
                  <label>Arguments</label>
                  <input className="input" value={argsText} onChange={(e) => setArgsText(e.target.value)} />
                </div>
                <div className="field">
                  <label>Environment (KEY=value per line)</label>
                  <textarea className="textarea" style={{ minHeight: 70 }} value={envText} onChange={(e) => setEnvText(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="field">
                <label>URL</label>
                <input className="input" value={draft.url ?? ''} placeholder="http://localhost:3000/mcp" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add} disabled={!draft.name.trim()}>
                Connect
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
