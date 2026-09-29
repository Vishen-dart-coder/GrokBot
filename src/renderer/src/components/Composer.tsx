import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, AudioLines, FileText, Loader2, Mic, Plus, Square, X } from 'lucide-react'
import type { Attachment } from '@shared/types'
import { useApp } from '@/lib/store'
import { Recorder, transcribe } from '@/lib/audio'

export function Composer({ autoFocus }: { autoFocus?: boolean }) {
  const { currentId, running, send, stop, ensureBot, setVoiceMode, draft, consumeDraft } = useApp()
  const [text, setText] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [notice, setNotice] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const rec = useRef<Recorder | null>(null)
  const busy = !!(currentId && running[currentId])

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [text])

  useEffect(() => {
    if (autoFocus) ta.current?.focus()
  }, [autoFocus, currentId])

  useEffect(() => {
    if (!draft) return
    setText(draft.text)
    setAtts(draft.attachments)
    consumeDraft()
    ta.current?.focus()
  }, [draft, consumeDraft])

  const submit = async () => {
    const value = text.trim()
    if ((!value && !atts.length) || busy) return
    setText('')
    setAtts([])
    await send(value || 'See the attached files.', atts)
  }

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    const id = await ensureBot()
    const added = await window.grok.files.importFiles(id, files)
    setAtts((a) => [...a, ...added])
  }

  const pick = async () => {
    const id = await ensureBot()
    const added = await window.grok.files.pick(id)
    setAtts((a) => [...a, ...added])
  }

  const toggleMic = async () => {
    setNotice('')
    if (!recording) {
      try {
        rec.current = new Recorder()
        await rec.current.start()
        setRecording(true)
      } catch (e) {
        setNotice(`Microphone unavailable: ${(e as Error).message}`)
      }
      return
    }
    setRecording(false)
    setTranscribing(true)
    try {
      const blob = await rec.current!.stop()
      const said = await transcribe(blob)
      setText((t) => (t ? t + ' ' : '') + said)
      ta.current?.focus()
    } catch (e) {
      setNotice((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="composer-wrap">
      <div
        className={`composer ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles([...e.dataTransfer.files])
        }}
      >
        {atts.length > 0 && (
          <div className="composer-attachments">
            {atts.map((a, i) => (
              <div className="attachment-chip" key={a.path}>
                {a.base64 ? (
                  <img src={`data:${a.mime};base64,${a.base64}`} style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 4 }} />
                ) : (
                  <FileText size={14} />
                )}
                <span>{a.name}</span>
                <button className="icon-btn sm" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={text}
          placeholder="Ask anything, or drop a file"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length) {
              e.preventDefault()
              void addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="composer-row">
          <button className="round-btn" title="Attach files" onClick={pick}>
            <Plus size={20} />
          </button>
          <div className="spacer" />
          <button
            className={`round-btn ${recording ? 'recording' : ''}`}
            title={recording ? 'Stop dictation' : 'Dictate'}
            onClick={toggleMic}
            disabled={transcribing}
          >
            {transcribing ? <Loader2 size={18} className="spin" /> : recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          {busy ? (
            <button className="send-btn" title="Stop" onClick={stop}>
              <Square size={14} fill="currentColor" />
            </button>
          ) : text.trim() || atts.length ? (
            <button className="send-btn" title="Send" onClick={submit}>
              <ArrowUp size={18} />
            </button>
          ) : (
            <button className="send-btn" title="Voice mode" onClick={() => setVoiceMode(true)}>
              <AudioLines size={18} />
            </button>
          )}
        </div>
      </div>
      {notice && <div className="composer-note" style={{ color: 'var(--danger)' }}>{notice}</div>}
    </div>
  )
}
