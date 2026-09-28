import { useEffect } from 'react'
import { Code2, FolderOpen, Globe, PanelLeft, Plus, Server, Sparkles, Terminal } from 'lucide-react'
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
  const { settings, ollama, setModal } = useApp()
  return (
    <button className="model-chip no-drag" onClick={() => setModal('settings', 'model')} title="Ollama model">
      <span className={`status-dot ${ollama.ok ? 'ok' : ''}`} />
      {settings?.model || 'Select a model'}
    </button>
  )
}

function Banners() {
  const { ollama, settings, setModal, refreshOllama } = useApp()
  if (!settings) return null
  if (!ollama.ok)
    return (
      <div className="banner">
        <Server size={18} />
        <span className="grow">
          <strong>Ollama isn't running.</strong> Start it with <code>ollama serve</code> or install it from ollama.com. Looking at {settings.ollamaHost}.
        </span>
        <button className="btn" onClick={refreshOllama}>
          Retry
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
