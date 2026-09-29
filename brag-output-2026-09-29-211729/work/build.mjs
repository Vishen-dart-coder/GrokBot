// Generates video.html for the kinetic cut: every frame is window.renderAt(t) (pure function of time).
// Reuses GrokBot Local's real stylesheet, class names, copy and logo; page logic lives in video-script.js.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('../..')
const appCss = fs.readFileSync(path.join(ROOT, 'src/renderer/src/styles.css'), 'utf8')
const logo = fs.readFileSync(path.join(ROOT, 'src/renderer/src/assets/brand/logo.svg'), 'utf8')
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64')
const ICON_NAMES = ['panel-left', 'search', 'plus', 'plug', 'mic', 'audio-lines', 'arrow-up', 'chevron-right', 'chevron-down', 'terminal',
  'folder-open', 'code-xml', 'globe', 'sparkles', 'check', 'settings-2', 'copy', 'square', 'x', 'pin']
const icons = Object.fromEntries(ICON_NAMES.map((n) => [n, fs.readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()]))
const font = (w) => `@font-face{font-family:Inter;font-weight:${w};src:url(node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2) format('woff2')}`
const letters = (s) => [...s].map((c) => `<span class="ltr">${c === ' ' ? '&nbsp;' : c}</span>`).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700, 800].filter((w) => fs.existsSync(`node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`)).map(font).join('\n')}
${appCss}
:root { --font: Inter, sans-serif; --mono: 'DejaVu Sans Mono', ui-monospace, monospace; }
*, *::before, *::after { transition: none !important; animation: none !important; }
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0a0a0a; }
#stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #0a0a0a; font-family: Inter, sans-serif; perspective: 2200px; perspective-origin: 50% 45%; }
.layer { position: absolute; inset: 0; transform-style: preserve-3d; }
.abs { position: absolute; }
.bgglow { position: absolute; inset: -200px; background: radial-gradient(1000px 700px at var(--gx, 50%) var(--gy, 45%), rgba(255,255,255,0.075), transparent 70%); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 80px 80px; mask-image: radial-gradient(900px 600px at 50% 50%, #000 30%, transparent 75%); }
.kin { position: absolute; color: #fff; font-weight: 700; letter-spacing: -0.045em; line-height: 0.95; white-space: nowrap; }
.kin.sub { font-weight: 500; letter-spacing: -0.015em; color: #a3a3a3; }
.mask { overflow: hidden; padding: 0.06em 0.02em 0.12em; }
.mask > span { display: inline-block; }
/* hook */
.hw { display: inline-block; margin: 0 0.12em; }
#orb { position: absolute; width: 300px; height: 300px; left: 0; top: 0; transform-origin: 50% 50%; z-index: 20; }
#orbGlow { position: absolute; width: 1000px; height: 1000px; margin: -500px 0 0 -500px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.22), transparent 60%); }
/* app window */
#winwrap { position: absolute; left: 320px; top: 140px; width: 1280px; height: 800px; transform-style: preserve-3d; transform-origin: 50% 50%; }
#win { position: absolute; inset: 0; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.14); background: var(--bg);
  box-shadow: 0 60px 160px rgba(0,0,0,0.75); }
#win .app { height: 100%; }
.lights { position: absolute; left: 18px; top: 19px; display: flex; gap: 8px; z-index: 5; }
.lights i { width: 12px; height: 12px; border-radius: 50%; display: block; }
.fake-input { width: 100%; padding: 8px 10px 4px; min-height: 24px; line-height: 1.5; color: var(--text); white-space: pre; }
.fake-input.ph { color: var(--text-3); }
.caret { display: inline-block; width: 2px; height: 18px; background: #fff; vertical-align: -3px; margin-left: 1px; }
#lift { position: absolute; transform-style: preserve-3d; }
#lift .composer { box-shadow: 0 30px 80px rgba(0,0,0,0.65); }
/* floating product panels */
.panel { position: absolute; transform-style: preserve-3d; }
.panel .tool-card, .panel .codeblock { box-shadow: 0 40px 120px rgba(0,0,0,0.7); background: #151515; }
.panel .codeblock { margin: 0; }
.ring { position: absolute; border-radius: 18px; border: 3px solid #4ade80; pointer-events: none; }
#cursor { position: absolute; left: 0; top: 0; width: 34px; height: 44px; z-index: 50; transform-origin: 4px 4px; }
#ripple { position: absolute; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.85); z-index: 49; }
.menu.static { position: static; width: 300px; box-shadow: 0 40px 120px rgba(0,0,0,0.7); }
.modal.static { width: 620px; max-height: none; box-shadow: 0 40px 120px rgba(0,0,0,0.7); }
.sidebar.static { height: 460px; width: 300px; border: 1px solid var(--border-strong); border-radius: 14px; box-shadow: 0 40px 120px rgba(0,0,0,0.7); }
/* outro */
#word6 { position: absolute; left: 0; right: 0; top: 470px; text-align: center; color: #fff; font-size: 132px; font-weight: 700; letter-spacing: -0.04em; }
#word6 .ltr { display: inline-block; }
#tag6 { position: absolute; left: 0; right: 0; top: 655px; text-align: center; color: #a3a3a3; font-size: 46px; font-weight: 500; letter-spacing: -0.01em; }
#pill6 { position: absolute; left: 50%; top: 772px; padding: 18px 34px; border-radius: 999px; background: #fff; color: #0a0a0a; font-size: 34px; font-weight: 600; white-space: nowrap; }
#shock { position: absolute; left: 960px; top: 320px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.7); }
#flash { position: absolute; inset: 0; background: #fff; pointer-events: none; z-index: 60; }
</style></head><body><div id="stage">

<div class="layer" id="bg"><div class="bgglow" id="bgglow"></div><div class="grid" id="grid"></div></div>

<!-- S1 hook -->
<div class="layer" id="s1">
  <div class="kin" id="l1" style="left:0;right:0;text-align:center;top:330px;font-size:200px"><span class="hw" id="w1">Your</span><span class="hw" id="w2">AI</span><span class="hw" id="w3">agent.</span></div>
  <div class="kin sub mask" id="l2" style="left:0;right:0;text-align:center;top:585px;font-size:120px"><span id="l2in">lives on your <b style="color:#fff;font-weight:700">Mac.</b></span></div>
</div>

<!-- S2 app window -->
<div class="layer" id="s2">
  <div id="winwrap"><div id="win">
    <div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
    <div class="app mac">
      <aside class="sidebar">
        <div class="sidebar-header"><div class="row"><button class="icon-btn" data-icon="panel-left"></button><button class="icon-btn" data-icon="search"></button><button class="icon-btn" data-icon="plus"></button></div></div>
        <div class="bot-list"><div class="sidebar-section">Bots</div>
          <div class="bot-item"><span class="title">Study sheet: Big-O notation</span></div>
          <div class="bot-item"><span class="title">Plan a 3-day trip to Lisbon</span></div>
          <div class="bot-item"><span class="title">Clean up my Downloads folder</span></div></div>
        <div class="sidebar-footer"><div class="avatar">V</div><div style="flex:1"></div><button class="pill-btn"><span data-icon="plug" data-size="14"></span> Connect apps</button></div>
      </aside>
      <main class="main">
        <div class="topbar"><div class="spacer"></div><button class="model-chip"><span class="status-dot ok"></span>qwen3:8b <span data-icon="chevron-down" data-size="14" style="opacity:.6"></span></button></div>
        <div class="home">
          <img class="brand-logo" id="homeLogo" src="${logoUri}">
          <h1>Good evening, Vishen. What should we work on?</h1>
          <div class="composer-wrap" style="width:100%"><div class="composer" id="composerGhost" style="visibility:hidden"><div class="fake-input">x</div><div class="composer-row"><button class="round-btn"></button></div></div></div>
          <div class="cards">
            <button class="card"><strong><span data-icon="code-xml" data-size="15"></span> Build a web app</strong>Build a small to-do web app in plain HTML/CSS/JS in my workspace, then tell me how to open it.</button>
            <button class="card"><strong><span data-icon="terminal" data-size="15"></span> Check my machine</strong>Look at this computer: OS version, disk space, and the largest folders in my home directory.</button>
            <button class="card"><strong><span data-icon="globe" data-size="15"></span> Research a page</strong>Fetch https://ollama.com/blog and summarize the three most recent posts.</button>
            <button class="card"><strong><span data-icon="sparkles" data-size="15"></span> Study helper</strong>Make me a one-page study sheet on Big-O notation with examples, saved as notes.md.</button>
          </div>
        </div>
      </main>
    </div>
    <div id="lift"><div class="composer" style="width:100%">
      <div class="fake-input" id="homeInput"></div>
      <div class="composer-row"><button class="round-btn" data-icon="plus" data-size="20"></button><div class="spacer"></div><button class="round-btn" data-icon="mic" data-size="18"></button><button class="send-btn" id="homeSend"></button></div>
    </div></div>
  </div></div>
</div>

<!-- S3 asks first -->
<div class="layer" id="s3">
  <div class="kin mask" style="left:130px;top:300px;font-size:170px"><span id="k3a">Asks</span></div>
  <div class="kin mask" style="left:130px;top:470px;font-size:170px"><span id="k3b">first.</span></div>
  <div class="kin sub" id="k3c" style="left:136px;top:690px;font-size:42px;line-height:1.3">Shell, files, web:<br>you approve each one.</div>
  <div class="panel" id="p3" style="left:860px;top:370px;width:720px;transform-origin:0 0">
    <div class="tool-card" id="card1">
      <div class="tool-head"><span data-icon="chevron-right" data-size="14"></span><span data-icon="terminal" data-size="14"></span><span class="name">write_file</span><span class="summary">hello.py</span><span class="badge" id="card1badge"></span></div>
      <div class="tool-body" id="card1body"><div class="label">Input</div><pre>{
  "path": "hello.py",
  "content": "print(\\"hello from GrokBot\\")\\n"
}</pre></div>
      <div class="tool-approval" id="card1appr"><span class="q">Allow GrokBot to run this on your computer?</span><button class="btn">Deny</button><button class="btn primary" id="allowBtn">Allow once</button></div>
    </div>
    <div class="ring" id="ring1"></div>
  </div>
</div>

<!-- S4 does the work -->
<div class="layer" id="s4">
  <div class="kin mask" style="left:130px;top:350px;font-size:128px"><span id="k4a">Then it</span></div>
  <div class="kin mask" style="left:130px;top:480px;font-size:128px"><span id="k4b">does the work.</span></div>
  <div class="panel" id="p4a" style="left:1060px;top:230px;width:680px;transform-origin:0 0">
    <div class="tool-card"><div class="tool-head"><span data-icon="chevron-down" data-size="14"></span><span data-icon="terminal" data-size="14"></span><span class="name">run_shell</span><span class="summary">python3 hello.py</span><span class="badge done">done</span></div>
      <div class="tool-body"><div class="label">Output</div><pre id="out4">hello from GrokBot
[exit code 0]</pre></div></div>
  </div>
  <div class="panel" id="p4b" style="left:1110px;top:640px;width:640px;transform-origin:0 0">
    <div class="codeblock"><div class="codeblock-head"><span>python</span><span class="icon" style="display:inline-flex;padding:6px" data-icon="copy" data-size="13"></span></div>
      <pre><code><span style="color:#ff7b72">print</span>(<span style="color:#a5d6ff">"hello from GrokBot"</span>)</code></pre></div>
  </div>
</div>

<!-- S5 carousel -->
<div class="layer" id="s5">
  <div class="kin mask" style="left:130px;top:430px;font-size:118px"><span id="k5a">Any Ollama<br>model.</span></div>
  <div class="kin mask" style="left:130px;top:430px;font-size:118px"><span id="k5b">Any MCP<br>app.</span></div>
  <div class="kin mask" style="left:130px;top:430px;font-size:118px"><span id="k5c">Chats stay<br>on your Mac.</span></div>
  <div class="panel" id="p5a" style="left:1080px;top:190px"><div class="menu static model-menu">
    <div class="menu-label">Installed models</div>
    <button class="menu-item"><span class="grow">qwen3:8b<div class="meta">8B · Q4_K_M</div></span><span data-icon="check" data-size="15"></span></button>
    <button class="menu-item"><span class="grow">llama3.1:8b<div class="meta">8B · Q4_K_M</div></span></button>
    <button class="menu-item"><span class="grow">gpt-oss:20b<div class="meta">20B · MXFP4</div></span></button>
    <button class="menu-item"><span class="grow">gemma3:12b<div class="meta">12B · Q4_K_M</div></span></button>
    <div class="menu-sep"></div>
    <button class="menu-item"><span data-icon="settings-2" data-size="15"></span> <span class="grow">Manage models…</span></button>
  </div></div>
  <div class="panel" id="p5b" style="left:900px;top:250px"><div class="modal static">
    <div class="modal-head"><h2>Connect apps</h2><button class="icon-btn" data-icon="x" data-size="16"></button></div>
    <div class="modal-content"><div class="sidebar-section" style="padding-left:0">Suggested</div>
      <div class="cards" style="grid-template-columns:1fr 1fr">
        <button class="card"><strong>Browser (Playwright)</strong>Let the agent open and control a web browser.</button>
        <button class="card"><strong>Filesystem</strong>Read and write files in a folder you choose.</button>
        <button class="card"><strong>Memory</strong>Persistent knowledge-graph memory across bots.</button>
        <button class="card"><strong>GitHub</strong>Issues, PRs and repos.</button>
      </div></div></div></div>
  <div class="panel" id="p5c" style="left:1150px;top:130px"><aside class="sidebar static">
    <div class="sidebar-header" style="padding-left:10px"><div class="row"><button class="icon-btn" data-icon="panel-left"></button><button class="icon-btn" data-icon="search"></button><button class="icon-btn" data-icon="plus"></button></div></div>
    <div class="bot-list"><div class="sidebar-section">Pinned</div>
      <div class="bot-item active"><span class="title">Create hello.py in your workspace…</span></div>
      <div class="sidebar-section">Bots</div>
      <div class="bot-item"><span class="title">Study sheet: Big-O notation</span></div>
      <div class="bot-item"><span class="title">Plan a 3-day trip to Lisbon</span></div>
      <div class="bot-item"><span class="title">Clean up my Downloads folder</span></div>
      <div class="bot-item"><span class="title">Summarize the Ollama blog</span></div></div>
    <div class="sidebar-footer"><div class="avatar">V</div><div style="flex:1"></div><button class="pill-btn"><span data-icon="folder-open" data-size="14"></span> ~/GrokBot</button></div>
  </aside></div>
</div>

<!-- S6 outro -->
<div class="layer" id="s6">
  <div id="shock"></div>
  <div id="word6">${letters('GrokBot Local')}</div>
  <div id="tag6">Runs on your Mac. Your chats stay there.</div>
  <div id="pill6">github.com/Vishen-dart-coder/GrokBot</div>
</div>

<div id="orbGlow"></div>
<img id="orb" src="${logoUri}">
<div id="ripple"></div>
<svg id="cursor" viewBox="0 0 34 44"><path d="M4 3 L4 35 L12 27.5 L17.5 40 L23 37.5 L17.6 25.3 L28.5 25 Z" fill="#fff" stroke="#000" stroke-width="2.2" stroke-linejoin="round"/></svg>
<div id="flash"></div>
</div>
<script>
${'window.__ICONS = ' + JSON.stringify(icons) + ';\n' + fs.readFileSync('video-script.js', 'utf8')}
</script></body></html>`
fs.writeFileSync('video.html', html)
console.log('video.html', (html.length / 1024).toFixed(0) + ' KB')
