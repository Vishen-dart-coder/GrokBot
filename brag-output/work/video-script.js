const ICONS = window.__ICONS;
document.querySelectorAll('[data-icon]').forEach((el) => {
  const size = el.dataset.size || 18
  el.innerHTML = ICONS[el.dataset.icon].replace('<svg', '<svg width="' + size + '" height="' + size + '"')
  if (el.tagName === 'SPAN') el.classList.add('icon'), el.style.display = 'inline-flex'
})
document.getElementById('homeSend').innerHTML = ICONS['audio-lines'].replace('<svg', '<svg width="18" height="18"')
const $ = (id) => document.getElementById(id)

// ---- timing helpers ----
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const seg = (t, a, b) => clamp((t - a) / (b - a))
const eo = (x) => 1 - Math.pow(1 - x, 3)
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const eback = (x) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) }
const lerp = (a, b, x) => a + (b - a) * x
const set = (el, o, tr) => { el.style.opacity = o; if (tr !== undefined) el.style.transform = tr }
const vis = (el, on) => { el.style.display = on ? '' : 'none' }
const PROMPT = 'Create hello.py in your workspace and run it'
const ICON_STOP = ICONS['square'].replace('<svg', '<svg width="14" height="14" fill="currentColor"')
const ICON_UP = ICONS['arrow-up'].replace('<svg', '<svg width="18" height="18"')
const ICON_WAVE = ICONS['audio-lines'].replace('<svg', '<svg width="18" height="18"')
const A3 = [
  'Done! I created **hello.py** and ran it:',
  '```python\nprint("hello from GrokBot")\n```',
  'It printed `hello from GrokBot`. Want me to turn it into a CLI next?'
]
function md(text) {
  // tiny markdown for the streamed answer: paragraphs, **bold**, `code`, fenced python block
  return text.split('\n\n').map((block) => {
    if (block.startsWith('```')) {
      const code = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      const hl = code.replace(/(".*?")/g, '<span style="color:#a5d6ff">$1</span>').replace(/^print/, '<span style="color:#ff7b72">print</span>')
      return '<div class="codeblock"><div class="codeblock-head"><span>python</span><span class="icon" style="display:inline-flex;padding:6px">' +
        ICONS['copy'].replace('<svg', '<svg width="13" height="13"') + '</span></div><pre><code>' + hl + '</code></pre></div>'
    }
    return '<p>' + block.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>') + '</p>'
  }).join('')
}

// camera for the app window: [t, scale, focusX, focusY] in app coordinates
const CAM = [
  [3.0, 1.18, 640, 400], [3.8, 1.3, 640, 400], [5.8, 1.3, 640, 400],
  [6.25, 1.86, 790, 250], [8.6, 1.86, 790, 270], [9.6, 1.86, 790, 335], [10.8, 1.8, 790, 400], [11.8, 1.8, 790, 440], [13.9, 1.8, 790, 470]
]
function camAt(t) {
  let a = CAM[0], b = CAM[CAM.length - 1]
  for (let i = 0; i < CAM.length - 1; i++) if (t >= CAM[i][0] && t <= CAM[i + 1][0]) { a = CAM[i]; b = CAM[i + 1]; break }
  if (t < CAM[0][0]) b = a
  const x = b === a ? 0 : eio(seg(t, a[0], b[0]))
  return [lerp(a[1], b[1], x), lerp(a[2], b[2], x), lerp(a[3], b[3], x)]
}
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }

window.renderAt = function (t) {
  // ---------- Scene 1: hook (0–3.0) ----------
  const s1 = t < 3.05
  vis($('s1'), s1)
  if (s1) {
    const out = 1 - eo(seg(t, 2.72, 3.0))
    const orbIn = eback(seg(t, 0.05, 0.75))
    const pulse = 1 + 0.035 * Math.exp(-((t - 0.5) % 0.5) / 0.12) * (t > 0.5 ? 1 : 0)
    set($('orb1'), Math.min(1, seg(t, 0.05, 0.4)) * out, 'scale(' + (0.6 + 0.4 * orbIn) * pulse + ')')
    set($('bloom1'), seg(t, 0.1, 0.9) * 0.9 * out, 'scale(' + (0.7 + 0.3 * eo(seg(t, 0.1, 1.2))) + ')')
    const a = eo(seg(t, 0.55, 0.95)), b = eo(seg(t, 1.05, 1.45))
    set($('h1a'), a * out, 'translateY(' + (1 - a) * 40 + 'px)')
    set($('h1b'), b * out, 'translateY(' + (1 - b) * 40 + 'px)')
  }

  // ---------- Scenes 2–4: app window (3.0–14.0) ----------
  const s2 = t >= 2.95 && t < 14.05
  vis($('s2'), s2)
  const inChat = t >= 5.95
  if (s2) {
    const [sc, fx, fy] = camAt(t)
    const winIn = eo(seg(t, 3.0, 3.45))
    const winOut = 1 - eo(seg(t, 13.7, 14.0))
    $('winwrap').style.transform = 'translate(' + (960 - fx * sc) + 'px,' + (540 - fy * sc + (1 - winIn) * 40) + 'px) scale(' + sc + ')'
    $('winwrap').style.opacity = winIn * winOut

    // home vs chat (old content out, then new in)
    vis($('home'), !inChat); vis($('chatScroll'), inChat); vis($('chatComposer'), inChat)
    vis($('chatTitle'), inChat); vis($('folderBtn'), inChat)
    $('home').style.opacity = 1 - seg(t, 5.72, 5.92)
    $('chatScroll').style.opacity = eo(seg(t, 6.0, 6.25))
    // sidebar: new bot appears at top when the chat starts
    const nb = eo(seg(t, 5.95, 6.3))
    vis($('botNew'), t >= 5.95)
    $('botNew').style.opacity = nb
    $('botNew').style.transform = 'translateX(' + (1 - nb) * -20 + 'px)'
    $('botA').classList.toggle('active', false)
    const running = t >= 5.95 && t < 12.6
    vis($('botSpin'), running)
    $('botSpin').style.opacity = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 / 1.2))

    // home composer typing 4.0–5.2
    const n = Math.round(seg(t, 4.0, 5.2) * PROMPT.length)
    const typed = PROMPT.slice(0, n)
    const hi = $('homeInput')
    hi.classList.toggle('ph', n === 0)
    const caretOn = t >= 3.6 && Math.floor(t * 2.2) % 2 === 0 || (t >= 4.0 && t < 5.3)
    hi.innerHTML = (n === 0 ? 'Ask anything, or drop a file' : typed.replace(/&/g, '&amp;')) + (t > 3.5 && t < 5.7 && caretOn && n > 0 ? '<span class="caret"></span>' : '')
    $('homeSend').innerHTML = n > 0 ? ICON_UP : ICON_WAVE

    // ---- chat content ----
    vis($('a1text'), t >= 6.35); vis($('card1'), t >= 6.6)
    const a1 = eo(seg(t, 6.35, 6.6))
    set($('a1text'), a1, 'translateY(' + (1 - a1) * 8 + 'px)')
    const c1 = eo(seg(t, 6.6, 6.9))
    set($('card1'), c1, 'translateY(' + (1 - c1) * 10 + 'px)')
    const approved = t >= 8.0
    const b1 = $('card1badge')
    b1.className = 'badge ' + (approved ? 'done' : 'pending-approval')
    b1.textContent = approved ? 'done' : 'pending approval'
    vis($('card1body'), t < 8.35); vis($('card1appr'), t < 8.35)
    $('allowBtn').style.transform = t >= 7.95 && t < 8.1 ? 'scale(0.94)' : ''
    vis($('mA2'), t >= 8.8)
    const c2 = eo(seg(t, 8.8, 9.1))
    set($('card2'), c2, 'translateY(' + (1 - c2) * 10 + 'px)')
    $('card2status').innerHTML = t < 9.8 ? '<span class="spinner-dot" style="opacity:' + (0.3 + 0.7 * (0.5 + 0.5 * Math.cos(t * 9))) + '"></span>' : '<span class="badge done">done</span>'
    vis($('card2body'), t >= 9.85)
    const glow = Math.exp(-Math.max(0, t - 9.9) / 0.5) * (t >= 9.9 ? 1 : 0)
    $('card2out').style.color = 'rgb(' + [163 + 92 * glow, 163 + 92 * glow, 163 + 92 * glow].map(Math.round).join(',') + ')'
    $('card2out').style.textShadow = glow > 0.02 ? '0 0 ' + 18 * glow + 'px rgba(255,255,255,' + 0.8 * glow + ')' : 'none'

    // streamed answer 10.6–12.6
    vis($('mA3'), t >= 10.6)
    let answer = ''
    if (t >= 10.6) {
      const p1 = A3[0].split(' '), p3 = A3[2].split(' ')
      const w1 = Math.round(seg(t, 10.6, 11.1) * p1.length)
      answer = p1.slice(0, w1).join(' ')
      if (t >= 11.15) answer += '\n\n' + A3[1]
      const w3 = Math.round(seg(t, 11.5, 12.5) * p3.length)
      if (w3 > 0) answer += '\n\n' + p3.slice(0, w3).join(' ')
    }
    $('a3md').innerHTML = md(answer)
    vis($('thinkingDot'), running && ((t > 6.0 && t < 6.35) || (t > 8.35 && t < 8.8) || (t > 10.0 && t < 10.6)))
    $('chatSend').innerHTML = running ? ICON_STOP : ICON_WAVE

    // auto-scroll like the real app (stick to bottom)
    const sc2 = $('chatScroll')
    sc2.scrollTop = sc2.scrollHeight

    // captions
    const k3 = eo(seg(t, 6.3, 6.6)) * (1 - seg(t, 10.2, 10.45))
    const k4 = eo(seg(t, 10.65, 10.95)) * (1 - seg(t, 13.55, 13.85))
    set($('cap3'), k3, 'translateY(' + (1 - eo(seg(t, 6.3, 6.6))) * 24 + 'px)')
    set($('cap4'), k4, 'translateY(' + (1 - eo(seg(t, 10.65, 10.95))) * 24 + 'px)')
    $('capband').style.opacity = clamp(seg(t, 6.1, 6.5) * (1 - seg(t, 13.6, 13.95)))
  }

  // ---------- Scene 5: models + apps (14.0–17.5) ----------
  const s5 = t >= 13.98 && t < 17.52
  vis($('s5'), s5)
  if (s5) {
    const out = 1 - eo(seg(t, 17.2, 17.48))
    $('s5').style.opacity = out
    const c = eo(seg(t, 14.1, 14.45))
    set($('cap5'), c, 'translateY(' + (1 - c) * 24 + 'px)')
    const m = eo(seg(t, 14.25, 14.7))
    set($('pModels'), m, 'translateX(' + (1 - m) * -120 + 'px) scale(1.75)')
    const ap = eo(seg(t, 14.5, 14.95))
    set($('pApps'), ap, 'translateX(' + (1 - ap) * 120 + 'px) scale(1.3)')
    document.querySelectorAll('#pModels .mi').forEach((el, i) => {
      const k = eo(seg(t, 14.28 + i * 0.06, 14.58 + i * 0.06)); set(el, k, 'translateY(' + (1 - k) * 10 + 'px)')
    })
    document.querySelectorAll('#pApps .ac').forEach((el, i) => {
      const k = eo(seg(t, 14.55 + i * 0.07, 14.85 + i * 0.07)); set(el, k, 'translateY(' + (1 - k) * 12 + 'px)')
    })
    const picked = t >= 15.6
    $('chk0').style.opacity = picked ? 0 : 1; $('chk1').style.opacity = 0; $('chk2').style.opacity = picked ? 1 : 0
    $('miGpt').style.background = t >= 15.2 && t < 15.75 ? 'var(--bg-hover)' : ''
  }

  // ---------- Scene 6: outro (17.5–21.0) ----------
  const s6 = t >= 17.5
  vis($('s6'), s6)
  if (s6) {
    const o = eback(seg(t, 17.55, 18.15))
    set($('orb6'), seg(t, 17.55, 17.85), 'scale(' + (0.7 + 0.3 * o) + ')')
    const w = eo(seg(t, 17.9, 18.3)), g = eo(seg(t, 18.3, 18.7)), p = eo(seg(t, 18.7, 19.05))
    set($('word6'), w, 'translateY(' + (1 - w) * 30 + 'px)')
    set($('tag6'), g, 'translateY(' + (1 - g) * 24 + 'px)')
    set($('pill6'), p, 'translateX(-50%) translateY(' + (1 - p) * 20 + 'px)')
  }

  // ---------- cursor ----------
  const cur = $('cursor'), rip = $('ripple')
  let pos = null, down = 0, clickT = null
  if (t >= 4.9 && t < 6.0) { // to send button
    const [tx, ty] = center($('homeSend'))
    const k = eio(seg(t, 4.9, 5.5))
    pos = [lerp(1500, tx - 4, k), lerp(900, ty - 4, k)]; clickT = 5.6
  } else if (t >= 6.9 && t < 8.6) { // to Allow once
    const target = t < 8.35 ? center($('allowBtn')) : null
    if (target) { const k = eio(seg(t, 6.9, 7.8)); pos = [lerp(1500, target[0] - 6, k), lerp(980, target[1] - 6, k)] }
    else pos = window.__lastCur
    clickT = 8.0
  } else if (t >= 14.9 && t < 16.3) { // pick gpt-oss
    const [tx, ty] = center($('miGpt'))
    const k = eio(seg(t, 14.9, 15.45))
    pos = [lerp(760, tx - 40, k), lerp(980, ty - 2, k)]; clickT = 15.6
  }
  if (pos) window.__lastCur = pos
  const fade = pos ? Math.min(seg(t, (t < 6 ? 4.9 : t < 9 ? 6.9 : 14.9), (t < 6 ? 5.1 : t < 9 ? 7.1 : 15.1)), 1 - seg(t, (t < 6 ? 5.8 : t < 9 ? 8.35 : 16.0), (t < 6 ? 5.95 : t < 9 ? 8.55 : 16.25))) : 0
  if (pos && fade > 0) {
    down = clickT !== null && t >= clickT - 0.06 && t < clickT + 0.1 ? 1 : 0
    cur.style.display = ''
    cur.style.opacity = fade
    cur.style.transform = 'translate(' + pos[0] + 'px,' + pos[1] + 'px) scale(' + (down ? 0.86 : 1) + ')'
  } else cur.style.display = 'none'
  const rk = clickT !== null ? seg(t, clickT, clickT + 0.45) : 0
  if (pos && rk > 0 && rk < 1) {
    rip.style.display = ''
    rip.style.left = pos[0] + 4 + 'px'; rip.style.top = pos[1] + 4 + 'px'
    rip.style.opacity = 1 - rk; rip.style.transform = 'scale(' + (0.4 + 1.2 * eo(rk)) + ')'
  } else rip.style.display = 'none'
}
window.renderAt(0)
