// Soundtrack for the kinetic cut: 120 BPM, A minor. Intro → riser → drop at 3.0 → groove with
// sidechain pump → breakdown + final impact at 16.9. Music and SFX share one reverb bus.
import fs from 'node:fs'

const SR = 44100
const DUR = 20.5
const N = Math.round(SR * DUR)
const BEAT = 0.5
const DROP = 3.0, END_GROOVE = 16.9
const dry = [new Float32Array(N), new Float32Array(N)]
const send = new Float32Array(N)
const midi = (m) => 440 * 2 ** ((m - 69) / 12)
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d))
// sidechain pump after the drop (kick on every beat)
const pump = (T) => (T < DROP || T >= END_GROOVE ? 1 : 1 - 0.55 * Math.exp(-((T - DROP) % BEAT) / 0.09))

function add(t0, len, fn, { gain = 1, pan = 0, rev = 0, pumped = false } = {}) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n; i++) {
    const k = s0 + i
    if (k < 0 || k >= N) continue
    const v = fn(i / SR) * (pumped ? pump(k / SR) : 1)
    dry[0][k] += v * gl; dry[1][k] += v * gr; send[k] += v * gain * rev
  }
}

const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55, 59], [55, 59, 62]] // Am F Cmaj7 G
const ROOTS = [45, 41, 48, 43]
const chordAt = (t) => Math.floor(Math.max(0, t - DROP) / 2) % 4

// ---- Pad ----
function pad(t0, len, notes, gain, pumped) {
  for (const [j, m] of notes.entries()) {
    const f = midi(m + 12)
    let lp = 0
    add(t0, len + 0.6, (t) => {
      const saw = ((t * f * 1.004) % 1) * 2 - 1 + (((t * f * 0.996) % 1) * 2 - 1)
      lp += 0.03 * (saw - lp)
      return lp * Math.min(1, t / 0.4) * (t > len ? Math.max(0, 1 - (t - len) / 0.6) : 1)
    }, { gain, pan: (j - 1.5) * 0.35, rev: 0.6, pumped })
  }
}
pad(0, 3.0, [57, 60, 64, 71], 0.08, false) // intro Am(add9)
for (let t0 = DROP; t0 < END_GROOVE; t0 += 2) pad(t0, Math.min(2, END_GROOVE - t0), CHORDS[chordAt(t0 + 0.01)], 0.11, true)
pad(END_GROOVE, 3.2, [57, 60, 64, 71, 76], 0.1, false) // outro ring

// ---- Intro word thumps (0.25 / 0.5 / 0.75) and line reveal ----
for (const [t0, m] of [[0.25, 45], [0.5, 45], [0.75, 48]]) {
  let ph = 0
  add(t0, 0.5, (t) => { ph += (2 * Math.PI * (midi(m) + 60 * Math.exp(-t / 0.02))) / SR; return Math.sin(ph) * Math.exp(-t / 0.18) }, { gain: 0.3 })
  add(t0, 0.3, (t) => Math.sin(2 * Math.PI * midi(m + 36) * t) * env(t, 0.002, 0.06), { gain: 0.05, rev: 0.4 })
}

// ---- Riser 1.4 → 3.0: noise sweep + rising tone ----
function riser(t0, len, gain) {
  let lp = 0, lp2 = 0, ph = 0
  add(t0, len, (t) => {
    const x = t / len
    const c = 0.01 + 0.35 * x * x
    lp += c * (rnd() - lp); lp2 += c * (lp - lp2)
    ph += (2 * Math.PI * (220 * 2 ** (x * 2))) / SR
    return ((lp - lp2) * 2.5 + 0.25 * Math.sin(ph)) * x ** 2.2
  }, { gain, rev: 0.5 })
}
riser(1.4, 1.6, 0.12)
riser(15.9, 1.0, 0.09)

// ---- Impacts (sub boom + noise crash) ----
function impact(t0, gain) {
  let ph = 0
  add(t0, 1.6, (t) => { ph += (2 * Math.PI * (38 + 90 * Math.exp(-t / 0.05))) / SR; return Math.sin(ph) * Math.exp(-t / 0.45) }, { gain })
  let lp = 0
  add(t0, 1.2, (t) => { lp += 0.25 * (rnd() - lp); return (rnd() * 0.5 + lp) * Math.exp(-t / 0.25) }, { gain: gain * 0.35, rev: 0.8 })
}
impact(DROP, 0.32); impact(6.0, 0.2); impact(9.5, 0.2); impact(END_GROOVE, 0.36)

// ---- Groove: kick, hats, clap, bass (3.0 → 16.9) ----
for (let t0 = DROP; t0 < END_GROOVE - 0.01; t0 += BEAT) {
  let ph = 0
  add(t0, 0.35, (t) => { ph += (2 * Math.PI * (45 + 80 * Math.exp(-t / 0.028))) / SR; return Math.sin(ph) * Math.exp(-t / 0.14) }, { gain: 0.34 })
}
for (let t0 = DROP + 0.25, i = 0; t0 < END_GROOVE; t0 += BEAT / 2, i++) {
  const open = i % 2 === 0
  let prev = 0
  add(t0, open ? 0.12 : 0.05, (t) => { const n = rnd(), hp = n - prev; prev = n; return hp * Math.exp(-t / (open ? 0.05 : 0.015)) }, { gain: open ? 0.04 : 0.025, pan: i % 4 < 2 ? 0.3 : -0.3, rev: 0.15 })
}
for (let t0 = DROP + BEAT; t0 < END_GROOVE; t0 += BEAT * 2) { // clap on 2 & 4
  let lp = 0
  add(t0, 0.25, (t) => { lp += 0.5 * (rnd() - lp); const burst = t < 0.03 ? 1 + 0.6 * Math.sin(t * 700) : 1; return (rnd() - lp) * burst * Math.exp(-t / 0.07) }, { gain: 0.07, rev: 0.45 })
}
for (let t0 = DROP; t0 < END_GROOVE - 0.01; t0 += BEAT / 2) {
  const f = midi(ROOTS[chordAt(t0)] - 12)
  let lp = 0
  add(t0, 0.24, (t) => { const s = Math.sin(2 * Math.PI * f * t) + 0.35 * (((t * f) % 1) * 2 - 1); lp += 0.18 * (s - lp); return lp * env(t, 0.004, 0.11) }, { gain: 0.17, pumped: true })
}
// Arp from 9.5
const ARP = [0, 1, 2, 1, 2, 3, 2, 1]
for (let t0 = 9.5, i = 0; t0 < END_GROOVE; t0 += BEAT / 2, i++) {
  const ch = CHORDS[chordAt(t0)], f = midi(ch[ARP[i % 8] % ch.length] + 24)
  add(t0, 0.4, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env(t, 0.003, 0.1), { gain: 0.06, pan: i % 2 ? 0.35 : -0.35, rev: 0.5 })
}

// ---- SFX ----
const bell = (f, dec) => (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / (dec * 0.4))) * env(t, 0.004, dec)
const click = (t0, m) => {
  add(t0, 0.12, bell(midi(m), 0.05), { gain: 0.07, rev: 0.25 })
  let prev = 0
  add(t0, 0.01, (t) => { const n = rnd(), v = n - prev; prev = n; return v * (1 - t / 0.01) }, { gain: 0.03 })
}
const whoosh = (t0, len, gain = 0.06, pan = 0) => {
  let lp = 0, lp2 = 0
  add(t0, len, (t) => { const x = t / len, c = 0.02 + 0.3 * x; lp += c * (rnd() - lp); lp2 += c * (lp - lp2); return (lp - lp2) * Math.sin(Math.PI * x) ** 2 * 3 }, { gain, rev: 0.5, pan })
}
for (let i = 0; i < 44; i += 2) { // typing 3.6 → 4.8
  let prev = 0
  add(3.6 + (i / 44) * 1.2, 0.012, (t) => { const n = rnd(), v = n - prev; prev = n; return v * Math.exp(-t / 0.003) }, { gain: 0.016, pan: i % 4 ? 0.15 : -0.15 })
}
click(5.4, 81)
whoosh(5.55, 0.5, 0.07, -0.4) // whip-pan
whoosh(6.05, 0.4, 0.04, 0.4) // card flies in
click(7.7, 81)
add(7.8, 0.9, bell(midi(88), 0.3), { gain: 0.045, rev: 0.5 })
whoosh(9.15, 0.45, 0.06)
whoosh(9.55, 0.35, 0.035, 0.3); whoosh(10.05, 0.35, 0.035, 0.3)
whoosh(12.75, 0.35, 0.05)
for (const [t0, p] of [[13.0, 0.4], [14.3, 0.4], [15.6, 0.4]]) whoosh(t0 - 0.1, 0.45, 0.05, p)
add(17.0, 3.2, bell(midi(93), 1.0), { gain: 0.05, rev: 0.7 })
add(17.15, 3.0, bell(midi(100), 0.9), { gain: 0.03, rev: 0.7, pan: 0.25 })

// ---- Reverb + master ----
function reverb(input, combs, aps) {
  const out = new Float32Array(N)
  for (const [d, g] of combs) { const buf = new Float32Array(d); let p = 0, lp = 0; for (let i = 0; i < N; i++) { const y = buf[p]; lp += 0.35 * (y - lp); buf[p] = input[i] + lp * g; p = (p + 1) % d; out[i] += y / combs.length } }
  for (const [d, g] of aps) { const buf = new Float32Array(d); let p = 0; for (let i = 0; i < N; i++) { const b = buf[p], y = -out[i] * g + b; buf[p] = out[i] + b * g; p = (p + 1) % d; out[i] = y } }
  return out
}
const revL = reverb(send, [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.82]], [[225, 0.5], [556, 0.5]])
const revR = reverb(send, [[1580, 0.82], [1640, 0.81], [1514, 0.83], [1445, 0.82]], [[248, 0.5], [579, 0.5]])
const L = new Float32Array(N), R = new Float32Array(N)
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.05) * Math.min(1, (DUR - t) / 1.4)
  L[i] = Math.tanh((dry[0][i] + revL[i] * 0.35) * 1.2) * fade
  R[i] = Math.tanh((dry[1][i] + revR[i] * 0.35) * 1.2) * fade
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const norm = 0.89 / peak, buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4) }
fs.writeFileSync('soundtrack.wav', buf)
console.log('soundtrack.wav', DUR + 's')
