import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  HelpCircle,
  LifeBuoy,
  LogOut,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Search,
  Settings as SettingsIcon,
  Smartphone,
  Trash2,
  UserPlus
} from 'lucide-react'
import { useApp } from '@/lib/store'

export function Sidebar() {
  const { bots, currentId, running, sidebarOpen, select, newBot, toggleSidebar, setModal } = useApp()
  const pinned = bots.filter((b) => b.pinned)
  const rest = bots.filter((b) => !b.pinned)

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
      <div className="sidebar-header drag">
        <div className="row no-drag">
          <button className="icon-btn" title="Toggle sidebar (⌘B)" onClick={toggleSidebar}>
            <PanelLeft size={18} />
          </button>
          <button className="icon-btn" title="Search (⌘K)" onClick={() => setModal('search')}>
            <Search size={18} />
          </button>
          <button className="icon-btn" title="New bot (⌘N)" onClick={newBot}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="bot-list">
        {pinned.length > 0 && <div className="sidebar-section">Pinned</div>}
        {pinned.map((b) => (
          <BotItem key={b.id} id={b.id} title={b.title} pinned active={b.id === currentId} busy={!!running[b.id]} onClick={() => select(b.id)} />
        ))}
        <div className="sidebar-section">Bots</div>
        {rest.map((b) => (
          <BotItem key={b.id} id={b.id} title={b.title} active={b.id === currentId} busy={!!running[b.id]} onClick={() => select(b.id)} />
        ))}
        {bots.length === 0 && <div className="empty-list">No bots yet. Start one with the + button.</div>}
      </div>

      <div className="sidebar-footer">
        <AccountMenu />
        <div style={{ flex: 1 }} />
        <button className="pill-btn" onClick={() => setModal('apps')}>
          <Plug size={14} /> Connect apps
        </button>
      </div>
    </aside>
  )
}

function BotItem(props: { id: string; title: string; active: boolean; busy: boolean; pinned?: boolean; onClick(): void }) {
  const { renameBot, togglePin, deleteBot } = useApp()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(props.title)
  useEffect(() => setValue(props.title), [props.title])

  const commit = () => {
    setEditing(false)
    if (value.trim() && value !== props.title) void renameBot(props.id, value.trim())
  }

  return (
    <div className={`bot-item ${props.active ? 'active' : ''}`} onClick={props.onClick} onDoubleClick={() => setEditing(true)} role="button">
      {props.busy && <span className="spinner-dot" title="Working…" />}
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="title">{props.title}</span>
      )}
      {!editing && (
        <span className="actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn sm" title="Rename" onClick={() => setEditing(true)}>
            <Pencil size={13} />
          </button>
          <button className="icon-btn sm" title={props.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(props.id)}>
            {props.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            className="icon-btn sm"
            title="Delete"
            onClick={() => {
              if (confirm(`Delete "${props.title}"? Workspace files are kept on disk.`)) void deleteBot(props.id)
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      )}
    </div>
  )
}

function AccountMenu() {
  const { settings, setModal, ollama } = useApp()
  const [open, setOpen] = useState(false)
  const [support, setSupport] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const name = settings?.userName || 'Local user'

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
        setSupport(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (fn: () => void) => () => {
    setOpen(false)
    setSupport(false)
    fn()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar" title={name} onClick={() => setOpen((o) => !o)}>
        {name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="menu" style={{ bottom: 40, left: 0 }}>
          <div className="menu-label">
            {name} · Ollama {ollama.ok ? `v${ollama.version}` : 'offline'}
          </div>
          <button className="menu-item" onClick={go(() => window.grok.openExternal('https://ollama.com/download'))}>
            <Smartphone size={16} /> <span className="grow">Get Ollama for other devices</span>
          </button>
          <div style={{ position: 'relative' }} onMouseEnter={() => setSupport(true)} onMouseLeave={() => setSupport(false)}>
            <button className="menu-item" onClick={() => setSupport((s) => !s)}>
              <LifeBuoy size={16} /> <span className="grow">Support</span> <ChevronRight size={14} />
            </button>
            {support && (
              <div className="menu" style={{ left: '100%', bottom: 0, minWidth: 200 }}>
                <button className="menu-item" onClick={go(() => window.grok.openExternal('https://github.com/ollama/ollama/blob/main/docs/api.md'))}>
                  <HelpCircle size={16} /> Ollama API docs
                </button>
                <button className="menu-item" onClick={go(() => window.grok.openExternal('https://ollama.com/search?c=tools'))}>
                  <HelpCircle size={16} /> Tool-capable models
                </button>
                <button className="menu-item" onClick={go(() => setModal('settings', 'about'))}>
                  <HelpCircle size={16} /> About GrokBot Local
                </button>
              </div>
            )}
          </div>
          <button className="menu-item" onClick={go(() => setModal('settings', 'general'))}>
            <SettingsIcon size={16} /> <span className="grow">Settings</span> <span className="kbd">⌘,</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={go(() => setModal('settings', 'general'))}>
            <UserPlus size={16} /> <span className="grow">Edit profile</span>
          </button>
          <button className="menu-item" onClick={go(() => window.close())}>
            <LogOut size={16} /> <span className="grow">Quit</span>
          </button>
        </div>
      )}
    </div>
  )
}
