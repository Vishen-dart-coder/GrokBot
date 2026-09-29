// Original soundtrack for the GrokBot Local brag video: 120 BPM, A minor, Am–F–C–G.
// Music and SFX are rendered together into one stereo mix with a shared reverb bus.
import fs from 'node:fs'

const SR = 44100
const DUR = 21.0
const N = Math.round(SR * DUR)
const BEAT = 0.5
const dry = [new Float32Array(N), new Float32Array(N)]
const send = new Float32Array(N) // mono reverb send

const midi = (m) => 440 * 2 ** ((m - 69) / 12)
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1

function add(t0, len, fn, { gain = 1, pan = 0, rev = 0 } = {}) {
  const s0 = Math.floor(t0 * SR)
  const n = Math.floor(len * SR)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n; i++) {
    const k = s0 + i
    if (k < 0 || k >= N) continue
    const v = fn(i / SR)
    dry[0][k] += v * gl
    dry[1][k] += v * gr
    send[k] += v * gain * rev
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d))

// ---- Harmony: Am F C G, one chord per bar (2 s) ----
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62] // G
]
const ROOTS = [45, 41, 48, 43]
const chordAt = (t) => Math.floor(t / 2) % 4

// Pad: detuned saws through a one-pole lowpass, whole piece
for (let bar = 0; bar < 11; bar++) {
  const t0 = bar * 2
  const idx = t0 >= 19.5 ? 0 : bar % 4
  const notes = bar >= 9 ? [57, 60, 64, 71] : CHORDS[idx] // outro: Am(add9)-ish shimmer
  for (const [j, m] of notes.entries()) {
    const f = midi(m + 12)
    let lp = 0
    add(
      t0,
      2.6,
      (t) => {
        const ph1 = (t * f * 1.003) % 1
        const ph2 = (t * f * 0.997) % 1
        const saw = ph1 * 2 - 1 + (ph2 * 2 - 1)
        lp += 0.035 * (saw - lp)
        const a = Math.min(1, t / 0.35) * (t > 2.1 ? Math.max(0, 1 - (t - 2.1) / 0.5) : 1)
        return lp * a
      },
      { gain: bar === 0 ? 0.09 : 0.11, pan: (j - 1.5) * 0.35, rev: 0.6 }
    )
  }
}

// Kick: from 0.5 s to 19.5 s, softer during the hook
for (let t0 = 0.5; t0 < 19.5; t0 += BEAT) {
  const g = t0 < 3 ? 0.2 : 0.3
  let ph = 0
  add(
    t0,
    0.35,
    (t) => {
      const f = 45 + 70 * Math.exp(-t / 0.03)
      ph += (2 * Math.PI * f) / SR
      return Math.sin(ph) * Math.exp(-t / 0.13)
    },
    { gain: g }
  )
}

// Hats: offbeat 8ths from 3.0 s, gently panned
for (let t0 = 3.25, i = 0; t0 < 19.5; t0 += BEAT, i++) {
  let prev = 0
  add(
    t0,
    0.06,
    (t) => {
      const n = rnd()
      const hp = n - prev
      prev = n
      return hp * Math.exp(-t / 0.018)
    },
    { gain: 0.045, pan: i % 2 ? 0.3 : -0.3, rev: 0.15 }
  )
}

// Bass: root 8ths from 3.0 s
for (let t0 = 3.0; t0 < 19.5; t0 += BEAT / 2) {
  const f = midi(ROOTS[chordAt(t0)] - 12)
  let lp = 0
  add(
    t0,
    0.24,
    (t) => {
      const s = Math.sin(2 * Math.PI * f * t) + 0.3 * (((t * f) % 1) * 2 - 1)
      lp += 0.2 * (s - lp)
      return lp * env(t, 0.005, 0.12)
    },
    { gain: 0.16 }
  )
}

// Pluck arpeggio: 16ths from 10.5 s to 17.5 s
const ARP = [0, 1, 2, 1, 2, 3, 2, 1]
for (let t0 = 10.5, i = 0; t0 < 17.5; t0 += BEAT / 2, i++) {
  const ch = CHORDS[chordAt(t0)]
  const m = ch[ARP[i % ARP.length] % ch.length] + 24
  const f = midi(m)
  add(
    t0,
    0.4,
    (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env(t, 0.003, 0.11),
    { gain: 0.075 * Math.min(1, (t0 - 10.5) / 1.5 + 0.3), pan: i % 2 ? 0.35 : -0.35, rev: 0.5 }
  )
}

// ---- SFX (in key, same reverb bus, well under the music) ----
const bell = (f, dec) => (t) =>
  (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / (dec * 0.4))) * env(t, 0.004, dec)
const click = (t0, m) => {
  add(t0, 0.12, bell(midi(m), 0.05), { gain: 0.07, rev: 0.25 })
  let prev = 0
  add(t0, 0.01, (t) => { const n = rnd(); const v = n - prev; prev = n; return v * (1 - t / 0.01) }, { gain: 0.03 })
}
const whoosh = (t0, len, gain = 0.05) => {
  let lp = 0, lp2 = 0
  add(t0, len, (t) => {
    const x = t / len
    const c = 0.02 + 0.25 * x
    lp += c * (rnd() - lp)
    lp2 += c * (lp - lp2)
    return (lp - lp2) * Math.sin(Math.PI * x) ** 2 * 3
  }, { gain, rev: 0.5, pan: 0 })
}

// typing ticks: prompt typed 4.0 → 5.2 s (44 chars), tick every 2nd char
for (let i = 0; i < 44; i += 2) {
  const t0 = 4.0 + (i / 44) * 1.2
  let prev = 0
  add(t0, 0.012, (t) => { const n = rnd(); const v = n - prev; prev = n; return v * Math.exp(-t / 0.003) }, { gain: 0.018, pan: (i % 4) ? 0.15 : -0.15, rev: 0.1 })
}
click(5.6, 81) // send (A5)
whoosh(5.7, 0.5)
click(8.0, 81) // Allow once
add(8.12, 0.8, bell(midi(88), 0.25), { gain: 0.04, rev: 0.5, pan: 0.2 }) // done plink E6
add(9.8, 0.8, bell(midi(93), 0.25), { gain: 0.035, rev: 0.5, pan: -0.2 }) // done plink A6
whoosh(13.65, 0.5)
whoosh(14.1, 0.35, 0.03)
whoosh(14.35, 0.35, 0.03)
click(15.6, 76) // pick model (E5)
whoosh(17.15, 0.5)
// Outro chime: A6 + E7 bell over the final chord
add(17.6, 3.2, bell(midi(93), 0.9), { gain: 0.05, rev: 0.7 })
add(17.75, 3.0, bell(midi(100), 0.8), { gain: 0.03, rev: 0.7, pan: 0.25 })

// ---- Reverb (Schroeder: 4 combs + 2 allpasses) on the send bus ----
function reverb(input, combs, aps) {
  const out = new Float32Array(N)
  for (const [d, g] of combs) {
    const buf = new Float32Array(d)
    let p = 0, lp = 0
    for (let i = 0; i < N; i++) {
      const y = buf[p]
      lp += 0.35 * (y - lp)
      buf[p] = input[i] + lp * g
      p = (p + 1) % d
      out[i] += y / combs.length
    }
  }
  for (const [d, g] of aps) {
    const buf = new Float32Array(d)
    let p = 0
    for (let i = 0; i < N; i++) {
      const b = buf[p]
      const y = -out[i] * g + b
      buf[p] = out[i] + b * g
      p = (p + 1) % d
      out[i] = y
    }
  }
  return out
}
const revL = reverb(send, [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.82]], [[225, 0.5], [556, 0.5]])
const revR = reverb(send, [[1580, 0.82], [1640, 0.81], [1514, 0.83], [1445, 0.82]], [[248, 0.5], [579, 0.5]])

// ---- Master: sum, fades, soft clip, normalize to -1 dBFS ----
const L = new Float32Array(N), R = new Float32Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  const fade = Math.min(1, t / 0.25) * Math.min(1, (DUR - t) / 1.2)
  L[i] = Math.tanh((dry[0][i] + revL[i] * 0.35) * 1.1) * fade
  R[i] = Math.tanh((dry[1][i] + revR[i] * 0.35) * 1.1) * fade
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const norm = 0.89 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8)
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4)
}
fs.writeFileSync('soundtrack.wav', buf)
console.log('soundtrack.wav', DUR + 's', 'peak before norm', peak.toFixed(3))
