import { useEffect, useState } from 'react'
import { MessageSquare, Search } from 'lucide-react'
import type { BotSummary } from '@shared/types'
import { useApp } from '@/lib/store'

type Result = { bot: BotSummary; snippet: string }

export function SearchDialog() {
  const { bots, select, setModal } = useApp()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    if (!q.trim()) {
      setResults(bots.slice(0, 12).map((bot) => ({ bot, snippet: bot.preview })))
    } else {
      const t = setTimeout(() => void window.grok.bots.search(q).then((r) => alive && setResults(r)), 120)
      return () => {
        alive = false
        clearTimeout(t)
      }
    }
  }, [q, bots])

  useEffect(() => setActive(0), [results])

  const open = (r?: Result) => {
    if (!r) return
    void select(r.bot.id)
    setModal(null)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
      <div className="modal search-modal">
        <div className="search-input">
          <Search size={17} color="var(--text-3)" />
          <input
            autoFocus
            placeholder="Search bots and messages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setModal(null)
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
              if (e.key === 'Enter') open(results[active])
            }}
          />
        </div>
        <div className="search-results">
          {!q.trim() && <div className="menu-label">Recent</div>}
          {results.map((r, i) => (
            <button key={r.bot.id} className={`search-result ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => open(r)}>
              <div className="t row">
                <MessageSquare size={14} color="var(--text-3)" /> {r.bot.title}
              </div>
              {r.snippet && <div className="s">{r.snippet}</div>}
            </button>
          ))}
          {q.trim() && results.length === 0 && <div className="empty-list">No results.</div>}
        </div>
      </div>
    </div>
  )
}
