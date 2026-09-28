// Microphone capture + speech helpers for dictation and voice mode.

export class Recorder {
  private rec?: MediaRecorder
  private chunks: Blob[] = []
  private stream?: MediaStream
  private ctx?: AudioContext
  analyser?: AnalyserNode

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
    this.chunks = []
    this.rec = new MediaRecorder(this.stream, { mimeType: 'audio/webm' })
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start()
  }

  /** Current input level 0..1 */
  level(): number {
    if (!this.analyser) return 0
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += ((v - 128) / 128) ** 2
    return Math.min(1, Math.sqrt(sum / data.length) * 4)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const done = () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        void this.ctx?.close()
        resolve(new Blob(this.chunks, { type: 'audio/webm' }))
      }
      if (!this.rec || this.rec.state === 'inactive') return done()
      this.rec.onstop = done
      this.rec.stop()
    })
  }
}

export async function transcribe(blob: Blob): Promise<string> {
  return window.grok.voice.transcribe(await blob.arrayBuffer(), blob.type)
}

/** Strips markdown so text-to-speech doesn't read symbols aloud. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function speak(text: string, voiceName: string): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(speakable(text))
    const voice = speechSynthesis.getVoices().find((v) => v.name === voiceName)
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}
