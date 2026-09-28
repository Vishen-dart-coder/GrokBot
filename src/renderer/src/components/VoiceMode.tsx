import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Recorder, speak, transcribe } from '@/lib/audio'

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

/**
 * Hands-free conversation: record → local speech-to-text → agent → text-to-speech.
 * Tap the orb (or the mic) to start/stop talking.
 */
export function VoiceMode() {
  const { setVoiceMode, send, settings, currentId, running, bot } = useApp()
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('Tap to talk')
  const [scale, setScale] = useState(1)
  const rec = useRef<Recorder | null>(null)
  const raf = useRef(0)
  const awaitingReply = useRef(false)
  const lastSpoken = useRef<string | undefined>(undefined)

  useEffect(() => () => {
    cancelAnimationFrame(raf.current)
    speechSynthesis.cancel()
    void rec.current?.stop()
  }, [])

  // When the agent finishes, read the latest assistant reply aloud.
  const isRunning = currentId ? running[currentId] : false
  useEffect(() => {
    if (!awaitingReply.current || isRunning || !bot) return
    const last = [...bot.messages].reverse().find((m) => m.role === 'assistant' && m.content)
    if (!last || last.id === lastSpoken.current) return
    awaitingReply.current = false
    lastSpoken.current = last.id
    setPhase('speaking')
    setStatus(last.content.slice(0, 160))
    void speak(last.content, settings?.voiceName ?? '').then(() => {
      setPhase('idle')
      setStatus('Tap to talk')
    })
  }, [isRunning, bot, settings?.voiceName])

  const start = async () => {
    speechSynthesis.cancel()
    try {
      rec.current = new Recorder()
      await rec.current.start()
    } catch (e) {
      setStatus(`Microphone unavailable: ${(e as Error).message}`)
      return
    }
    setPhase('listening')
    setStatus('Listening…')
    const tick = () => {
      setScale(1 + (rec.current?.level() ?? 0) * 0.5)
      raf.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const finish = async () => {
    cancelAnimationFrame(raf.current)
    setScale(1)
    setPhase('transcribing')
    setStatus('Transcribing…')
    try {
      const text = await transcribe(await rec.current!.stop())
      if (!text) {
        setPhase('idle')
        setStatus("Didn't catch that. Tap to try again.")
        return
      }
      setPhase('thinking')
      setStatus(`“${text}”`)
      awaitingReply.current = true
      await send(text, [])
    } catch (e) {
      setPhase('idle')
      setStatus((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const toggle = () => {
    if (phase === 'idle') void start()
    else if (phase === 'listening') void finish()
    else if (phase === 'speaking') {
      speechSynthesis.cancel()
      setPhase('idle')
      setStatus('Tap to talk')
    }
  }

  return (
    <div className="voice-overlay">
      <button className={`voice-orb ${phase === 'idle' || phase === 'thinking' ? 'idle' : ''}`} style={{ transform: `scale(${scale})` }} onClick={toggle} />
      <div className="voice-status">{phase === 'thinking' && isRunning ? `${status} — thinking…` : status}</div>
      <div className="voice-controls">
        <button className="round-btn" title={phase === 'listening' ? 'Done talking' : 'Talk'} onClick={toggle}>
          {phase === 'listening' ? <Square size={20} /> : <Mic size={22} />}
        </button>
        <button className="round-btn" title="Exit voice mode" onClick={() => setVoiceMode(false)}>
          <X size={22} />
        </button>
      </div>
    </div>
  )
}
