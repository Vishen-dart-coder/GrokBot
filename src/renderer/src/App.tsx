import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Code2, FolderOpen, Loader2, Settings2, Globe, PanelLeft, Plus, Server, Sparkles, Terminal } from 'lucide-react'
import { useApp } from '@/lib/store'
import { brand } from '@/lib/brand'
import { Sidebar } from './components/Sidebar'
import { Composer } from './components/Composer'
import { ChatView } from './components/ChatView'
import { SettingsDialog } from './components/SettingsDialog'
import { ConnectApps } from './components/ConnectApps'
import { SearchDialog } from './components/SearchDialog'
import { VoiceMode } from './components/VoiceMode'

const SUGGESTIONS = [
  { icon: <Code2 size={15} />, title: 'Build a web app', prompt: 'Build a small to-do web app in plain HTML/CSS/JS in my workspace, then tell me how to open it.' },
  { icon: <Terminal size={15} />, title: 'Check my machine', prompt: 'Look at this computer: OS version, disk space, and the largest folders in my home directory.' },
  { icon: <Globe size={15} />, title: 'Research a page', prompt: 'Fetch https://ollama.com/blog and summarize the three most recent posts.' },
  { icon: <Sparkles size={15} />, title: 'Study helper', prompt: 'Make me a one-page study sheet on Big-O notation with examples, saved as notes.md.' }
]

function ModelChip() {
  const { settings, ollama, models, setModal, updateSettings, refreshOllama } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void refreshOllama()
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, refreshOllama])

  return (
    <div ref={ref} className="no-drag" style={{ position: 'relative' }}>
      <button className="model-chip" onClick={() => setOpen((o) => !o)} title="Switch model">
        <span className={`status-dot ${ollama.ok ? 'ok' : ''}`} />
        {settings?.model || 'Select a model'}
        <ChevronDown size={14} className="chev" />
      </button>
      {open && (
        <div className="menu model-menu">
          <div className="menu-label">{ollama.ok ? 'Installed models' : 'Ollama is not running'}</div>
          {models.map((m) => (
            <button
              key={m.name}
              className="menu-item"
              onClick={() => {
                void updateSettings({ model: m.name })
                setOpen(false)
              }}
            >
              <span className="grow">
                {m.name}
                <div className="meta">{[m.parameterSize, m.quantization].filter(Boolean).join(' · ')}</div>
              </span>
              {m.name === settings?.model && <Check size={15} />}
            </button>
          ))}
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setModal('settings', 'model')
            }}
          >
            <Settings2 size={15} /> <span className="grow">Manage models…</span>
          </button>
        </div>
      )}
    </div>
  )
}

function Banners() {
  const { ollama, settings, setModal, refreshOllama, startOllama } = useApp()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string>()
  if (!settings) return null
  if (!ollama.ok)
    return (
      <div className="banner">
        <Server size={18} />
        <span className="grow">
          <strong>Ollama isn't running.</strong> {startError ?? `GrokBot needs it at ${settings.ollamaHost}.`}
        </span>
        <button className="btn" onClick={refreshOllama}>
          Retry
        </button>
        <button
          className="btn primary"
          disabled={starting}
          onClick={async () => {
            setStarting(true)
            setStartError(await startOllama())
            setStarting(false)
          }}
        >
          {starting ? <Loader2 size={14} className="spin" /> : null} {starting ? 'Starting…' : 'Start Ollama'}
        </button>
      </div>
    )
  if (!settings.model)
    return (
      <div className="banner">
        <Sparkles size={18} />
        <span className="grow">
          <strong>Choose a model to get started.</strong> Pick or download an Ollama model with tool support.
        </span>
        <button className="btn primary" onClick={() => setModal('settings', 'model')}>
          Choose model
        </button>
      </div>
    )
  return null
}

function Home() {
  const { send, settings } = useApp()
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="home">
      {brand.wordmark ? (
        <img className="brand-wordmark" src={brand.wordmark} alt={brand.name} />
      ) : (
        brand.logo && <img className="brand-logo" src={brand.logo} alt={brand.name} />
      )}
      <h1>
        {greet}
        {settings?.userName ? `, ${settings.userName}` : ''}. What should we work on?
      </h1>
      <div style={{ width: '100%' }}>
        <Banners />
        <Composer autoFocus />
      </div>
      <div className="cards">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="card" onClick={() => void send(s.prompt, [])}>
            <strong>
              {s.icon} {s.title}
            </strong>
            {s.prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

export function App() {
  const { init, settings, bot, sidebarOpen, toggleSidebar, newBot, modal, setModal, voiceMode, stop, currentId } = useApp()

  useEffect(() => void init(), [init])

  useEffect(() => {
    const t = settings?.theme ?? 'dark'
    const resolved = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t
    document.documentElement.dataset.theme = resolved
  }, [settings?.theme])

  useEffect(
    () =>
      window.grok.onMenu((action) => {
        const s = useApp.getState()
        if (action === 'settings') s.setModal('settings', 'general')
        else if (action === 'apps') s.setModal('apps')
        else if (action === 'search') s.setModal('search')
        else if (action === 'new') s.newBot()
        else if (action === 'sidebar') s.toggleSidebar()
        else if (action === 'workspace' && s.currentId) void window.grok.workspace.open(s.currentId)
        else if (action === 'export' && s.currentId) void window.grok.bots.exportMarkdown(s.currentId)
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'n') (e.preventDefault(), newBot())
      else if (mod && e.key === 'k') (e.preventDefault(), setModal('search'))
      else if (mod && e.key === 'b') (e.preventDefault(), toggleSidebar())
      else if (mod && e.key === ',') (e.preventDefault(), setModal('settings', 'general'))
      else if (e.key === 'Escape' && !modal) void stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newBot, setModal, toggleSidebar, stop, modal])

  return (
    <div className={`app ${window.grok.platform === 'darwin' ? 'mac' : ''}`}>
      <Sidebar />
      <main className="main">
        <div className="topbar drag">
          {!sidebarOpen && (
            <div className="row no-drag">
              <button className="icon-btn" title="Show sidebar" onClick={toggleSidebar}>
                <PanelLeft size={18} />
              </button>
              <button className="icon-btn" title="New bot" onClick={newBot}>
                <Plus size={18} />
              </button>
            </div>
          )}
          {bot && <span className="title">{bot.title}</span>}
          <div className="spacer" />
          {currentId && (
            <button className="icon-btn no-drag" title="Open workspace folder" onClick={() => window.grok.workspace.open(currentId)}>
              <FolderOpen size={17} />
            </button>
          )}
          <ModelChip />
        </div>
        {bot ? (
          <>
            <ChatView />
            <div style={{ padding: '0 24px' }}>
              <Banners />
            </div>
            <Composer autoFocus />
          </>
        ) : (
          <Home />
        )}
        {voiceMode && <VoiceMode />}
      </main>
      {modal === 'settings' && <SettingsDialog />}
      {modal === 'apps' && <ConnectApps />}
      {modal === 'search' && <SearchDialog />}
    </div>
  )
}
