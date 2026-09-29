// Kinetic cut: window.renderAt(t) sets every element from time t (no CSS animation, no state).
const ICONS = window.__ICONS
document.querySelectorAll('[data-icon]').forEach((el) => {
  const size = el.dataset.size || 18
  el.innerHTML = ICONS[el.dataset.icon].replace('<svg', '<svg width="' + size + '" height="' + size + '"')
  if (el.tagName === 'SPAN') { el.classList.add('icon'); el.style.display = 'inline-flex' }
})
const $ = (id) => document.getElementById(id)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const seg = (t, a, b) => clamp((t - a) / (b - a))
const eo = (x) => 1 - Math.pow(1 - x, 3)
const eo5 = (x) => 1 - Math.pow(1 - x, 5)
const ei = (x) => x * x * x
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const eback = (x) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) }
const lerp = (a, b, x) => a + (b - a) * x
const vis = (el, on) => { el.style.display = on ? '' : 'none' }
const fx = (el, o, tr, blur = 0) => { el.style.opacity = o; el.style.transform = tr; el.style.filter = blur > 0.3 ? 'blur(' + blur.toFixed(1) + 'px)' : 'none' }
const rect = (el) => el.getBoundingClientRect()
const center = (el) => { const r = rect(el); return [r.left + r.width / 2, r.top + r.height / 2] }
// keyframe interpolation: kf = [[t, {k: v}], ...] with eio easing between keys
function kf(t, frames) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 0; i < frames.length - 1; i++) {
    const [ta, a] = frames[i], [tb, b] = frames[i + 1]
    if (t <= tb) { const x = (frames[i][2] || eio)(seg(t, ta, tb)); const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], x); return o }
  }
  return frames[frames.length - 1][1]
}
const T3 = (p) => `translate3d(${p.x || 0}px,${p.y || 0}px,${p.z || 0}px) rotateX(${p.rx || 0}deg) rotateY(${p.ry || 0}deg) rotateZ(${p.rz || 0}deg) scale(${p.s ?? 1})`

// --- one-time layout: lift the composer out of the window so it can move in Z ---
const lift = $('lift'), ghost = $('composerGhost'), winwrap = $('winwrap')
winwrap.appendChild(lift)
{
  let x = 0, y = 0, el = ghost
  while (el && el.id !== 'win') { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent }
  Object.assign(lift.style, { left: x + 'px', top: y + 'px', width: ghost.offsetWidth + 'px' })
}
const PROMPT = 'Create hello.py in your workspace and run it'
const SVG = (n, s, extra = '') => ICONS[n].replace('<svg', '<svg width="' + s + '" height="' + s + '" ' + extra)
const letters = [...document.querySelectorAll('#word6 .ltr')]
let lastCursor = [1500, 1000]

window.renderAt = function (t) {
  // ---------- background ----------
  $('grid').style.opacity = seg(t, 5.9, 6.4) * (1 - seg(t, 16.7, 17.1))
  $('bgglow').style.setProperty('--gx', 50 + 8 * Math.sin(t * 0.6) + '%')
  $('bgglow').style.setProperty('--gy', 45 + 5 * Math.cos(t * 0.5) + '%')

  // ---------- S1 hook (0–2.6) ----------
  vis($('s1'), t < 2.6)
  if (t < 2.6) {
    ;[['w1', 0.25], ['w2', 0.5], ['w3', 0.75]].forEach(([id, tw]) => {
      const k = eo5(seg(t, tw - 0.03, tw + 0.2))
      fx($(id), k, `scale(${1.6 - 0.6 * k})`, (1 - k) * 16)
    })
    const up = eio(seg(t, 1.2, 1.5)), out = ei(seg(t, 2.0, 2.35))
    fx($('l1'), 1 - out, `translateY(${-50 * up - 320 * out}px) scale(${1 - 0.12 * up})`, out * 24)
    const rv = eo(seg(t, 1.3, 1.65))
    $('l2in').style.transform = `translateY(${(1 - rv) * 110}%)`
    fx($('l2'), 1 - out, `translateY(${-30 * up + 320 * out}px)`, out * 24)
  }

  // ---------- S2 app window (2.55–6.0) ----------
  const s2 = t >= 2.5 && t < 6.05
  vis($('s2'), s2)
  if (s2) {
    const p = kf(t, [
      [2.5, { x: 0, y: 90, z: -700, rx: 24, ry: -28, rz: 4, s: 1.38 }],
      [3.8, { x: 0, y: 20, z: 0, rx: 7, ry: -10, rz: 0, s: 1.38 }],
      [5.45, { x: 10, y: 10, z: 240, rx: 4, ry: -5, rz: 0, s: 1.38 }],
      [6.0, { x: -2900, y: 10, z: -150, rx: 4, ry: 38, rz: -3, s: 1.38 }, ei]
    ])
    winwrap.style.transform = T3(p)
    winwrap.style.opacity = seg(t, 2.5, 2.75)
    const lz = 150 * eback(seg(t, 3.35, 3.8)) * (1 - eo(seg(t, 5.42, 5.6)))
    lift.style.transform = `translateZ(${lz}px) scale(${1 + lz / 3000})`
    const n = Math.round(seg(t, 3.6, 4.8) * PROMPT.length)
    const hi = $('homeInput')
    hi.classList.toggle('ph', n === 0)
    const caret = t > 3.4 && t < 5.4 && (t < 4.85 || Math.floor(t * 2.4) % 2 === 0)
    hi.innerHTML = (n === 0 ? 'Ask anything, or drop a file' : PROMPT.slice(0, n)) + (caret && n > 0 ? '<span class="caret"></span>' : '')
    $('homeSend').innerHTML = t >= 5.4 ? SVG('square', 14, 'fill="currentColor"') : n > 0 ? SVG('arrow-up', 18) : SVG('audio-lines', 18)
  }

  // ---------- orb (hook → match cut; outro) ----------
  const orb = $('orb'), glow = $('orbGlow')
  let orbOn = false, ox = 960, oy = 470, os = 0, go = 0
  if (t >= 1.95 && t < 3.0) {
    orbOn = true
    const g = eback(seg(t, 1.95, 2.4))
    os = g
    go = seg(t, 1.95, 2.3) * (1 - seg(t, 2.6, 3.0))
    if (t >= 2.5) { // shrink into the app's home logo (match cut)
      const r = rect($('homeLogo')), k = eio(seg(t, 2.5, 3.0))
      ox = lerp(960, r.left + r.width / 2, k); oy = lerp(470, r.top + r.height / 2, k); os = lerp(1, Math.max(r.width, r.height) / 300, k)
    }
  } else if (t >= 16.75) {
    orbOn = true
    const g = eback(seg(t, 16.75, 17.2))
    ox = 960; oy = 330; os = 0.72 * g * (1 + 0.015 * Math.sin((t - 17.2) * 3.2) * (t > 17.2 ? 1 : 0))
    go = seg(t, 16.75, 17.1) * 0.8
  }
  vis(orb, orbOn && os > 0.01)
  orb.style.transform = `translate(${ox - 150}px,${oy - 150}px) scale(${os})`
  glow.style.opacity = go
  glow.style.transform = `translate(${ox}px,${oy}px) scale(${0.6 + 0.4 * Math.min(os, 1)})`
  $('homeLogo').style.visibility = t >= 3.0 ? 'visible' : 'hidden'

  // ---------- S3 asks first (6.0–9.5) ----------
  const s3 = t >= 5.95 && t < 9.55
  vis($('s3'), s3)
  if (s3) {
    const out = ei(seg(t, 9.15, 9.5))
    $('s3').style.transform = `translateZ(${out * 700}px)`
    $('s3').style.opacity = 1 - out
    $('s3').style.filter = out > 0.02 ? `blur(${out * 18}px)` : 'none'
    $('k3a').style.transform = `translateY(${(1 - eo(seg(t, 6.05, 6.32))) * 115}%)`
    $('k3b').style.transform = `translateY(${(1 - eo(seg(t, 6.25, 6.52))) * 115}%)`
    const c = eo(seg(t, 6.7, 7.0)); fx($('k3c'), c, `translateY(${(1 - c) * 20}px)`)
    const settle = eio(seg(t, 7.95, 8.5))
    const pin = eo5(seg(t, 6.0, 6.55))
    fx($('p3'), seg(t, 6.0, 6.2), T3({ x: (1 - pin) * 800, z: (1 - pin) * -500, ry: lerp(58, lerp(14, 8, settle), pin), rx: lerp(10, 4, pin), rz: (1 - pin) * -6, s: 1.42 }), (1 - pin) * 18)
    const done = t >= 7.7
    $('card1badge').className = 'badge ' + (done ? 'done' : 'pending-approval')
    $('card1badge').textContent = done ? 'done' : 'pending approval'
    vis($('card1appr'), t < 8.0)
    $('allowBtn').style.transform = t >= 7.64 && t < 7.8 ? 'scale(0.93)' : ''
    const rk = seg(t, 7.72, 8.35), ring = $('ring1'), cr = $('card1')
    vis(ring, rk > 0 && rk < 1)
    Object.assign(ring.style, { left: -8 + 'px', top: -8 + 'px', width: cr.offsetWidth + 16 + 'px', height: cr.offsetHeight + 16 + 'px' })
    ring.style.opacity = 1 - rk; ring.style.transform = `scale(${1 + 0.07 * eo(rk)})`
  }

  // ---------- S4 does the work (9.5–13.0) ----------
  const s4 = t >= 9.45 && t < 13.05
  vis($('s4'), s4)
  if (s4) {
    $('k4a').style.transform = `translateY(${(1 - eo(seg(t, 9.55, 9.82))) * 115}%)`
    $('k4b').style.transform = `translateY(${(1 - eo(seg(t, 9.75, 10.02))) * 115}%)`
    const a = eo5(seg(t, 9.6, 10.05)), b = eo5(seg(t, 10.1, 10.55))
    fx($('p4a'), seg(t, 9.6, 9.75), T3({ x: (1 - a) * 700, z: (1 - a) * -400, ry: lerp(60, 12, a), rx: 5, s: 1.25 }), (1 - a) * 16)
    fx($('p4b'), seg(t, 10.1, 10.25), T3({ x: (1 - b) * 700, z: 90 + (1 - b) * -400, ry: lerp(60, 12, b), rx: 5, s: 1.25 }), (1 - b) * 16)
    // dolly onto the output + text exit
    const d = eio(seg(t, 11.3, 12.4))
    $('s4').style.transform = 'none'
    const [cx, cy] = center($('out4'))
    $('s4').style.transformOrigin = `${cx}px ${cy}px`
    const out = ei(seg(t, 12.75, 13.0))
    $('s4').style.transform = `translate(${(960 - cx) * d - 1800 * out}px, ${(470 - cy) * d}px) scale(${1 + 0.6 * d})`
    $('s4').style.filter = out > 0.02 ? `blur(${out * 20}px)` : 'none'
    $('s4').style.opacity = 1 - out
    const g = seg(t, 11.5, 11.9) * (1 - 0.6 * seg(t, 12.3, 12.8))
    $('out4').style.color = `rgb(${Math.round(163 + 92 * g)},${Math.round(163 + 92 * g)},${Math.round(163 + 92 * g)})`
    $('out4').style.textShadow = g > 0.02 ? `0 0 ${16 * g}px rgba(255,255,255,${0.7 * g})` : 'none'
    const txtOut = eio(seg(t, 11.2, 11.6))
    ;['k4a', 'k4b'].forEach((id) => { $(id).parentElement.style.opacity = 1 - txtOut })
  }

  // ---------- S5 carousel (13.0–16.9) ----------
  const s5 = t >= 12.95 && t < 16.95
  vis($('s5'), s5)
  if (s5) {
    ;[['p5a', 'k5a', 13.0], ['p5b', 'k5b', 14.3], ['p5c', 'k5c', 15.6]].forEach(([pid, kid, st], i) => {
      const en = st + 1.3, last = i === 2
      const inK = eo5(seg(t, st, st + 0.42)), outK = ei(seg(t, en - 0.3, en))
      const on = t >= st - 0.02 && t < en + 0.02
      vis($(pid), on); vis($(kid).parentElement, on)
      if (!on) return
      const drift = seg(t, st + 0.42, en - 0.3)
      const base = { x: (1 - inK) * 750, z: (1 - inK) * -500, ry: lerp(62, lerp(14, 8, drift), inK), rx: 4 }
      if (!last) { base.x -= 1000 * outK; base.ry -= 60 * outK; base.z -= 250 * outK }
      let s = 2.05
      if (i === 1) s = 1.42
      if (i === 2) s = 1.8
      if (last) { // collapse into the orb
        const c = ei(seg(t, 16.55, 16.9))
        base.x = lerp(base.x, 960 - 1350, c); base.y = lerp(0, 60, c); s *= 1 - 0.9 * c
      }
      base.s = s
      $(pid).style.transformOrigin = '0 0'
      fx($(pid), seg(t, st, st + 0.15) * (last ? 1 - seg(t, 16.75, 16.9) : 1 - outK), T3(base), ((1 - inK) + outK) * 16)
      const kin = eo(seg(t, st + 0.06, st + 0.36)), kout = ei(seg(t, en - 0.26, en))
      $(kid).style.transform = `translateY(${(1 - kin) * 110 - kout * 110}%)`
    })
  }

  // ---------- S6 outro (16.9–20.5) ----------
  const s6 = t >= 16.85
  vis($('s6'), s6)
  if (s6) {
    const sk = seg(t, 16.9, 17.7)
    Object.assign($('shock').style, { opacity: (1 - sk) * 0.8, transform: `translate(-50%,-50%) scale(${1 + 160 * eo(sk)})`, display: sk > 0 && sk < 1 ? '' : 'none' })
    letters.forEach((el, i) => { const k = eo5(seg(t, 17.2 + i * 0.035, 17.6 + i * 0.035)); fx(el, k, `translateY(${(1 - k) * 70}px)`, (1 - k) * 12) })
    const g = eo(seg(t, 17.95, 18.35)), p = eo(seg(t, 18.3, 18.7))
    fx($('tag6'), g, `translateY(${(1 - g) * 24}px)`)
    fx($('pill6'), p, `translateX(-50%) translateY(${(1 - p) * 20}px) scale(${0.9 + 0.1 * p})`)
  }
  $('flash').style.opacity = 0.35 * Math.max(Math.exp(-Math.max(0, t - 3.0) / 0.06) * (t >= 3.0 ? 1 : 0), Math.exp(-Math.max(0, t - 16.9) / 0.08) * (t >= 16.9 ? 1 : 0))

  // ---------- cursor ----------
  const cur = $('cursor'), rip = $('ripple')
  let pos = null, clickT = null, a = 0, b = 0
  if (t >= 4.8 && t < 5.75) { const [x, y] = center($('homeSend')); const k = eio(seg(t, 4.8, 5.28)); pos = [lerp(1560, x - 4, k), lerp(980, y - 4, k)]; clickT = 5.4; a = 4.8; b = 5.6 }
  else if (t >= 6.85 && t < 8.1) { const tgt = t < 8.0 ? center($('allowBtn')) : lastCursor; const k = eio(seg(t, 6.85, 7.5)); pos = [lerp(1500, tgt[0] - 6, k), lerp(1000, tgt[1] - 6, k)]; clickT = 7.7; a = 6.85; b = 7.95 }
  if (pos) lastCursor = pos
  const fade = pos ? Math.min(seg(t, a, a + 0.15), 1 - seg(t, b, b + 0.15)) : 0
  if (pos && fade > 0) {
    const down = t >= clickT - 0.06 && t < clickT + 0.1
    cur.style.display = ''; cur.style.opacity = fade
    cur.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${down ? 0.86 : 1})`
  } else cur.style.display = 'none'
  const rk = clickT !== null ? seg(t, clickT, clickT + 0.45) : 0
  if (pos && rk > 0 && rk < 1) { rip.style.display = ''; rip.style.left = pos[0] + 4 + 'px'; rip.style.top = pos[1] + 4 + 'px'; rip.style.opacity = 1 - rk; rip.style.transform = `scale(${0.4 + 1.2 * eo(rk)})` }
  else rip.style.display = 'none'
}
window.renderAt(0)
