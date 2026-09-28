import { useEffect, useState, type ReactNode } from 'react'
import { Bot, Cpu, Info, Mic, RefreshCw, Settings as Gear, Trash2, X } from 'lucide-react'
import type { PullProgress, Settings, ToolInfo } from '@shared/types'
import { DEFAULT_SYSTEM_PROMPT } from '@shared/defaults'
import { useApp, type SettingsTab } from '@/lib/store'
import { brand } from '@/lib/brand'

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Gear size={15} /> },
  { id: 'model', label: 'Model', icon: <Cpu size={15} /> },
  { id: 'agent', label: 'Agent', icon: <Bot size={15} /> },
  { id: 'voice', label: 'Voice', icon: <Mic size={15} /> },
  { id: 'about', label: 'About', icon: <Info size={15} /> }
]

export function Modal({ title, onClose, children, className }: { title?: string; onClose(): void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className ?? ''}`}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Switch({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return <button className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />
}

export function SettingsDialog() {
  const { settings, settingsTab, setModal } = useApp()
  const [tab, setTab] = useState<SettingsTab>(settingsTab)
  if (!settings) return null
  return (
    <Modal title="Settings" onClose={() => setModal(null)}>
      <div className="modal-body">
        <nav className="modal-nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        <div className="modal-content">
          {tab === 'general' && <General s={settings} />}
          {tab === 'model' && <ModelTab s={settings} />}
          {tab === 'agent' && <AgentTab s={settings} />}
          {tab === 'voice' && <VoiceTab s={settings} />}
          {tab === 'about' && <About />}
        </div>
      </div>
    </Modal>
  )
}

/** Text input that saves on blur/enter instead of every keystroke. */
function Lazy({ value, onSave, ...rest }: { value: string; onSave(v: string): void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="input"
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function General({ s }: { s: Settings }) {
  const { updateSettings } = useApp()
  return (
    <>
      <div className="field">
        <label>Your name</label>
        <Lazy value={s.userName} placeholder="e.g. Vishen" onSave={(userName) => updateSettings({ userName })} />
        <span className="hint">Shown in the account menu and shared with the agent.</span>
      </div>
      <div className="field">
        <label>Theme</label>
        <select className="select" value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as Settings['theme'] })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </div>
      <div className="field">
        <label>Workspace folder</label>
        <div className="row">
          <Lazy value={s.workspaceRoot} onSave={(workspaceRoot) => updateSettings({ workspaceRoot })} />
          <button
            className="btn"
            onClick={async () => {
              const dir = await window.grok.workspace.chooseDir()
              if (dir) void updateSettings({ workspaceRoot: dir })
            }}
          >
            Choose…
          </button>
        </div>
        <span className="hint">Each new bot gets its own sub-folder here — this is "GrokBot's computer".</span>
      </div>
    </>
  )
}

function fmtSize(n: number) {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`
}

function ModelTab({ s }: { s: Settings }) {
  const { updateSettings, ollama, models, refreshOllama } = useApp()
  const [pullName, setPullName] = useState('')
  const [progress, setProgress] = useState<PullProgress | null>(null)

  useEffect(() => {
    void refreshOllama()
    return window.grok.ollama.onPullProgress((p) => {
      setProgress(p)
      if (p.done) void refreshOllama()
    })
  }, [refreshOllama])

  const pct = progress?.total ? Math.round(((progress.completed ?? 0) / progress.total) * 100) : 0

  return (
    <>
      <div className="field">
        <label>Ollama server</label>
        <div className="row">
          <Lazy value={s.ollamaHost} onSave={(ollamaHost) => updateSettings({ ollamaHost })} />
          <button className="btn" onClick={refreshOllama}>
            <RefreshCw size={14} /> Check
          </button>
        </div>
        <span className="hint row">
          <span className={`status-dot ${ollama.ok ? 'ok' : ''}`} />
          {ollama.ok ? `Connected — Ollama v${ollama.version}` : `Not reachable${ollama.error ? ` (${ollama.error})` : ''}. Run "ollama serve" or install from ollama.com.`}
        </span>
      </div>

      <div className="field">
        <label>Model</label>
        {models.length === 0 && <span className="muted">No local models found. Pull one below (e.g. qwen3:8b, llama3.1:8b, gpt-oss:20b).</span>}
        {models.map((m) => (
          <div key={m.name} className={`model-row ${m.name === s.model ? 'selected' : ''}`}>
            <input type="radio" checked={m.name === s.model} onChange={() => updateSettings({ model: m.name })} />
            <div className="grow">
              <div>{m.name}</div>
              <div className="meta">
                {[m.family, m.parameterSize, m.quantization, fmtSize(m.size)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              className="icon-btn sm"
              title="Delete model"
              onClick={async () => {
                if (!confirm(`Delete ${m.name} from Ollama?`)) return
                await window.grok.ollama.remove(m.name)
                void refreshOllama()
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <span className="hint">Pick a model that supports tool calling for full agent features. Models are only loaded when you send a message.</span>
      </div>

      <div className="field">
        <label>Download a model</label>
        <div className="row">
          <input className="input" placeholder="e.g. qwen3:8b" value={pullName} onChange={(e) => setPullName(e.target.value)} />
          <button
            className="btn"
            disabled={!pullName.trim() || !ollama.ok || (!!progress && !progress.done)}
            onClick={() => {
              setProgress({ model: pullName.trim(), status: 'starting' })
              void window.grok.ollama.pull(pullName.trim())
            }}
          >
            Pull
          </button>
        </div>
        {progress && (
          <>
            <span className="hint">
              {progress.model}: {progress.error ?? progress.status} {progress.total ? `${pct}%` : ''}
            </span>
            {!!progress.total && !progress.done && (
              <div className="progress">
                <div style={{ width: `${pct}%` }} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="field">
        <label>Temperature: {s.temperature.toFixed(1)}</label>
        <input type="range" min={0} max={2} step={0.1} value={s.temperature} onChange={(e) => updateSettings({ temperature: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>Context length (tokens)</label>
        <select className="select" value={s.contextLength} onChange={(e) => updateSettings({ contextLength: Number(e.target.value) })}>
          {[4096, 8192, 16384, 32768, 65536, 131072].map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      <div className="toggle">
        <div>
          <div>Thinking</div>
          <div className="desc">Ask reasoning models (qwen3, deepseek-r1, gpt-oss) to show their thinking.</div>
        </div>
        <Switch on={s.think} onChange={(think) => updateSettings({ think })} />
      </div>
    </>
  )
}

function AgentTab({ s }: { s: Settings }) {
  const { updateSettings } = useApp()
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [prompt, setPrompt] = useState(s.systemPrompt)
  useEffect(() => void window.grok.tools.list().then(setTools), [])

  return (
    <>
      <div className="field">
        <label>Approvals</label>
        <select className="select" value={s.approvalMode} onChange={(e) => updateSettings({ approvalMode: e.target.value as Settings['approvalMode'] })}>
          <option value="ask">Ask before every tool</option>
          <option value="auto-read">Auto-run read-only tools, ask for anything else (recommended)</option>
          <option value="auto">Run everything without asking</option>
        </select>
      </div>
      <div className="field">
        <label>Tools</label>
        {tools
          .filter((t) => t.source === 'builtin')
          .map((t) => (
            <div className="toggle" key={t.name}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                  {t.name} {t.risky && <span className="badge">needs approval</span>}
                </div>
                <div className="desc">{t.description}</div>
              </div>
              <Switch
                on={s.enabledTools[t.name] !== false}
                onChange={(v) => updateSettings({ enabledTools: { ...s.enabledTools, [t.name]: v } })}
              />
            </div>
          ))}
      </div>
      <div className="field">
        <label>System prompt</label>
        <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => updateSettings({ systemPrompt: prompt })} />
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setPrompt(DEFAULT_SYSTEM_PROMPT)
              void updateSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT })
            }}
          >
            Reset to default
          </button>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Shell timeout (s)</label>
          <Lazy type="number" value={String(s.shellTimeoutSec)} onSave={(v) => updateSettings({ shellTimeoutSec: Math.max(5, Number(v) || 120) })} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Max steps per request</label>
          <Lazy type="number" value={String(s.maxAgentSteps)} onSave={(v) => updateSettings({ maxAgentSteps: Math.max(1, Number(v) || 25) })} />
        </div>
      </div>
    </>
  )
}

function VoiceTab({ s }: { s: Settings }) {
  const { updateSettings } = useApp()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return (
    <>
      <div className="field">
        <label>Speech-to-text server</label>
        <Lazy
          value={s.transcriptionUrl}
          placeholder="http://127.0.0.1:8080/v1/audio/transcriptions"
          onSave={(transcriptionUrl) => updateSettings({ transcriptionUrl })}
        />
        <span className="hint">
          Any OpenAI-compatible transcription endpoint running locally (whisper.cpp server, faster-whisper-server, LocalAI). Used by the mic
          button and voice mode. Leave empty to disable.
        </span>
      </div>
      <div className="field">
        <label>Spoken voice</label>
        <select className="select" value={s.voiceName} onChange={(e) => updateSettings({ voiceName: e.target.value })}>
          <option value="">System default</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
        <div className="row">
          <button className="btn" onClick={() => void import('@/lib/audio').then((a) => a.speak('Hi, I am GrokBot. How can I help?', s.voiceName))}>
            Test voice
          </button>
        </div>
      </div>
    </>
  )
}

function About() {
  const [info, setInfo] = useState<{ version: string; platform: string; userData: string }>()
  useEffect(() => void window.grok.appInfo().then(setInfo), [])
  return (
    <>
      {brand.logo && <img className="brand-logo" src={brand.logo} alt="" style={{ width: 56, height: 56 }} />}
      <h3 style={{ marginTop: 0 }}>GrokBot Local {info && `v${info.version}`}</h3>
      <p className="muted">
        A local-first desktop agent powered by Ollama. Chats, settings and workspaces stay on this machine.
      </p>
      <p className="muted">Data folder: {info?.userData}</p>
      <p className="muted">
        Shortcuts: <span className="kbd">⌘N</span> new bot · <span className="kbd">⌘K</span> search · <span className="kbd">⌘B</span> sidebar ·{' '}
        <span className="kbd">⌘,</span> settings · <span className="kbd">Esc</span> stop
      </p>
    </>
  )
}
