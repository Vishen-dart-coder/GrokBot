import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Brain, ChevronDown, ChevronRight, FileText, Terminal } from 'lucide-react'
import type { ChatMessage, ToolRun } from '@shared/types'
import { useApp } from '@/lib/store'
import { CopyButton, Markdown } from './Markdown'

export function ChatView() {
  const { bot, streaming, running, errors } = useApp()
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const live = bot ? streaming[bot.id] : undefined
  const isRunning = bot ? running[bot.id] : false
  const error = bot ? errors[bot.id] : undefined

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  useEffect(() => {
    stick.current = true
  }, [bot?.id])

  if (!bot) return null
  const visible = bot.messages.filter((m) => m.role !== 'tool' && m.role !== 'system')

  return (
    <div
      className="chat-scroll"
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      <div className="chat">
        {visible.map((m) => (m.role === 'user' ? <UserMessage key={m.id} m={m} /> : <AssistantMessage key={m.id} m={m} />))}
        {live && (
          <div className="msg-assistant">
            {live.thinking && <Thinking text={live.thinking} open />}
            {live.content ? <Markdown text={live.content} streaming /> : !live.thinking && <span className="cursor" />}
          </div>
        )}
        {isRunning && !live && <span className="spinner-dot" style={{ margin: '4px 2px' }} />}
        {error && (
          <div className="banner error">
            <AlertTriangle size={16} color="var(--danger)" />
            <span className="grow">{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function UserMessage({ m }: { m: ChatMessage }) {
  return (
    <div className="msg-user">
      {!!m.attachments?.length && (
        <div className="msg-attachments">
          {m.attachments.map((a) =>
            a.base64 ? (
              <img key={a.path} className="attachment-thumb" src={`data:${a.mime};base64,${a.base64}`} title={a.name} />
            ) : (
              <div key={a.path} className="attachment-chip">
                <FileText size={14} /> <span>{a.name}</span>
              </div>
            )
          )}
        </div>
      )}
      <div className="bubble">{m.content}</div>
    </div>
  )
}

function AssistantMessage({ m }: { m: ChatMessage }) {
  const toolsOnly = !m.content && !m.thinking && !!m.toolRuns?.length
  return (
    <div className={`msg-assistant ${toolsOnly ? 'tools-only' : ''}`}>
      {m.thinking && <Thinking text={m.thinking} />}
      {m.content && <Markdown text={m.content} />}
      {m.toolRuns?.map((r) => <ToolCard key={r.callId} run={r} messageId={m.id} />)}
      {m.error && <div className="msg-error">{m.error}</div>}
      {m.content && (
        <div className="msg-actions">
          <CopyButton text={m.content} />
        </div>
      )}
    </div>
  )
}

function Thinking({ text, open }: { text: string; open?: boolean }) {
  return (
    <details className="thinking" open={open}>
      <summary>
        <Brain size={13} style={{ verticalAlign: -2 }} /> Thinking
      </summary>
      {text}
    </details>
  )
}

function summarizeArgs(run: ToolRun): string {
  const a = run.arguments
  const main = a.command ?? a.path ?? a.url ?? a.pattern
  return typeof main === 'string' ? main : JSON.stringify(a)
}

function ToolCard({ run, messageId: _m }: { run: ToolRun; messageId: string }) {
  const { bot } = useApp()
  const [open, setOpen] = useState(false)
  const pending = run.status === 'pending-approval'
  const label = run.name.startsWith('mcp__') ? run.name.split('__').slice(1).join(' › ') : run.name

  const respond = (allow: boolean, always = false) => bot && window.grok.agent.approve(bot.id, run.callId, allow, always)

  return (
    <div className="tool-card">
      <div className="tool-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Terminal size={14} />
        <span className="name">{label}</span>
        <span className="summary">{summarizeArgs(run)}</span>
        {run.status === 'running' ? <span className="spinner-dot" /> : <span className={`badge ${run.status}`}>{run.status.replace('-', ' ')}</span>}
      </div>
      {(open || pending) && (
        <div className="tool-body">
          <div className="label">Input</div>
          <pre>{JSON.stringify(run.arguments, null, 2)}</pre>
          {run.output !== undefined && (
            <>
              <div className="label">Output</div>
              <pre>{run.output}</pre>
            </>
          )}
        </div>
      )}
      {pending && (
        <div className="tool-approval">
          <span className="q">Allow GrokBot to run this on your computer?</span>
          <button className="btn" onClick={() => respond(false)}>
            Deny
          </button>
          <button className="btn" onClick={() => respond(true, true)}>
            Always allow {label}
          </button>
          <button className="btn primary" onClick={() => respond(true)}>
            Allow once
          </button>
        </div>
      )}
    </div>
  )
}
