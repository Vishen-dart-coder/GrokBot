// Generates video.html: a 1920×1080 stage whose every frame is a pure function of time (window.renderAt(t)).
// Reuses GrokBot Local's real stylesheet, class names, copy and brand logo.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('../..')
const appCss = fs.readFileSync(path.join(ROOT, 'src/renderer/src/styles.css'), 'utf8')
const logo = fs.readFileSync(path.join(ROOT, 'src/renderer/src/assets/brand/logo.svg'), 'utf8')
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64')
const ICON_NAMES = ['panel-left', 'search', 'plus', 'plug', 'mic', 'audio-lines', 'arrow-up', 'chevron-right', 'chevron-down', 'terminal',
  'folder-open', 'code-xml', 'globe', 'sparkles', 'check', 'settings-2', 'copy', 'square', 'pencil', 'pin', 'trash-2', 'x']
const icons = Object.fromEntries(ICON_NAMES.map((n) => [n, fs.readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()]))
const font = (w) => `@font-face{font-family:Inter;font-weight:${w};src:url(node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2) format('woff2')}`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700].map(font).join('\n')}
${appCss}
:root { --font: Inter, sans-serif; --mono: 'DejaVu Sans Mono', ui-monospace, monospace; }
*, *::before, *::after { transition: none !important; animation: none !important; }
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0a0a0a; }
#stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #0a0a0a; font-family: Inter, sans-serif; }
.layer { position: absolute; inset: 0; }
.glow { position: absolute; inset: 0; background: radial-gradient(900px 600px at 50% 45%, rgba(255,255,255,0.07), transparent 70%); }
/* hook */
#orb1 { position: absolute; left: 50%; top: 330px; width: 300px; height: 300px; margin-left: -150px; }
.orb-bloom { position: absolute; left: 50%; top: 480px; width: 900px; height: 900px; margin: -450px 0 0 -450px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 60%); }
.hook-line { position: absolute; left: 0; right: 0; text-align: center; color: #ececec; font-weight: 600; letter-spacing: -0.02em; }
/* app window */
#winwrap { position: absolute; left: 0; top: 0; width: 1280px; height: 800px; transform-origin: 0 0; }
#win { width: 1280px; height: 800px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.6); background: var(--bg); position: relative; }
#win .app { height: 100%; }
.lights { position: absolute; left: 18px; top: 19px; display: flex; gap: 8px; z-index: 5; }
.lights i { width: 12px; height: 12px; border-radius: 50%; display: block; }
.fake-input { width: 100%; padding: 8px 10px 4px; min-height: 24px; line-height: 1.5; color: var(--text); white-space: pre; }
.fake-input.ph { color: var(--text-3); }
.caret { display: inline-block; width: 2px; height: 18px; background: #fff; vertical-align: -3px; margin-left: 1px; }
.icon svg { display: block; }
/* captions */
#capband { position: absolute; left: 0; right: 0; bottom: 0; height: 330px; background: linear-gradient(to top, rgba(10,10,10,0.97) 38%, rgba(10,10,10,0)); }
.cap { position: absolute; left: 0; right: 0; bottom: 86px; text-align: center; color: #fff; font-size: 64px; font-weight: 600; letter-spacing: -0.02em; }
/* cursor */
#cursor { position: absolute; left: 0; top: 0; width: 34px; height: 44px; z-index: 50; transform-origin: 4px 4px; }
#ripple { position: absolute; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.8); z-index: 49; }
/* scene 5 */
#cap5 { position: absolute; left: 0; right: 0; top: 118px; text-align: center; color: #fff; font-size: 72px; font-weight: 600; letter-spacing: -0.02em; }
#pModels { position: absolute; left: 190px; top: 330px; transform-origin: 0 0; }
#pModels .menu { position: static; width: 300px; }
#pApps { position: absolute; left: 880px; top: 300px; transform-origin: 0 0; }
#pApps .modal { width: 620px; max-height: none; }
/* outro */
#orb6 { position: absolute; left: 50%; top: 210px; width: 220px; height: 220px; margin-left: -110px; }
#word6 { position: absolute; left: 0; right: 0; top: 470px; text-align: center; color: #fff; font-size: 124px; font-weight: 700; letter-spacing: -0.035em; }
#tag6 { position: absolute; left: 0; right: 0; top: 648px; text-align: center; color: #a3a3a3; font-size: 46px; font-weight: 500; letter-spacing: -0.01em; }
#pill6 { position: absolute; left: 50%; top: 770px; transform: translateX(-50%); padding: 18px 34px; border-radius: 999px; background: #fff; color: #0a0a0a;
  font-size: 34px; font-weight: 600; white-space: nowrap; }
</style></head><body><div id="stage">

<!-- Scene 1: hook -->
<div class="layer" id="s1">
  <div class="orb-bloom" id="bloom1"></div>
  <img id="orb1" src="${logoUri}">
  <div class="hook-line" id="h1a" style="top:690px;font-size:92px">Your AI agent.</div>
  <div class="hook-line" id="h1b" style="top:800px;font-size:92px;color:#a3a3a3">Now it lives on your Mac.</div>
</div>

<!-- Scenes 2–4: the real app -->
<div class="layer" id="s2">
  <div id="winwrap"><div id="win">
    <div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
    <div class="app mac">
      <aside class="sidebar">
        <div class="sidebar-header"><div class="row">
          <button class="icon-btn" data-icon="panel-left"></button><button class="icon-btn" data-icon="search"></button><button class="icon-btn" data-icon="plus"></button>
        </div></div>
        <div class="bot-list">
          <div class="sidebar-section">Bots</div>
          <div class="bot-item active" id="botNew"><span class="spinner-dot" id="botSpin"></span><span class="title">Create hello.py in your workspace…</span></div>
          <div class="bot-item" id="botA"><span class="title">Study sheet: Big-O notation</span></div>
          <div class="bot-item"><span class="title">Plan a 3-day trip to Lisbon</span></div>
          <div class="bot-item"><span class="title">Clean up my Downloads folder</span></div>
        </div>
        <div class="sidebar-footer"><div class="avatar">V</div><div style="flex:1"></div><button class="pill-btn"><span data-icon="plug" data-size="14"></span> Connect apps</button></div>
      </aside>
      <main class="main">
        <div class="topbar">
          <span class="title" id="chatTitle">Create hello.py in your workspace and run it</span>
          <div class="spacer"></div>
          <button class="icon-btn" id="folderBtn" data-icon="folder-open" data-size="17"></button>
          <button class="model-chip"><span class="status-dot ok"></span>qwen3:8b <span data-icon="chevron-down" data-size="14" style="opacity:.6"></span></button>
        </div>

        <!-- home -->
        <div class="home" id="home">
          <img class="brand-logo" src="${logoUri}">
          <h1>Good evening, Vishen. What should we work on?</h1>
          <div class="composer-wrap" style="width:100%"><div class="composer">
            <div class="fake-input" id="homeInput"></div>
            <div class="composer-row"><button class="round-btn" data-icon="plus" data-size="20"></button><div class="spacer"></div>
              <button class="round-btn" data-icon="mic" data-size="18"></button><button class="send-btn" id="homeSend"></button></div>
          </div></div>
          <div class="cards">
            <button class="card"><strong><span data-icon="code-xml" data-size="15"></span> Build a web app</strong>Build a small to-do web app in plain HTML/CSS/JS in my workspace, then tell me how to open it.</button>
            <button class="card"><strong><span data-icon="terminal" data-size="15"></span> Check my machine</strong>Look at this computer: OS version, disk space, and the largest folders in my home directory.</button>
            <button class="card"><strong><span data-icon="globe" data-size="15"></span> Research a page</strong>Fetch https://ollama.com/blog and summarize the three most recent posts.</button>
            <button class="card"><strong><span data-icon="sparkles" data-size="15"></span> Study helper</strong>Make me a one-page study sheet on Big-O notation with examples, saved as notes.md.</button>
          </div>
        </div>

        <!-- chat -->
        <div class="chat-scroll" id="chatScroll" style="display:none"><div class="chat">
          <div class="msg-user" id="mUser"><div class="bubble">Create hello.py in your workspace and run it</div></div>
          <div class="msg-assistant" id="mA1">
            <div class="md" id="a1text"><p>I’ll create the file in my workspace.</p></div>
            <div class="tool-card" id="card1">
              <div class="tool-head"><span data-icon="chevron-right" data-size="14" id="card1chev"></span><span data-icon="terminal" data-size="14"></span>
                <span class="name">write_file</span><span class="summary">hello.py</span><span class="badge" id="card1badge"></span></div>
              <div class="tool-body" id="card1body"><div class="label">Input</div><pre>{
  "path": "hello.py",
  "content": "print(\\"hello from GrokBot\\")\\n"
}</pre></div>
              <div class="tool-approval" id="card1appr"><span class="q">Allow GrokBot to run this on your computer?</span>
                <button class="btn">Deny</button><button class="btn">Always allow write_file</button><button class="btn primary" id="allowBtn">Allow once</button></div>
            </div>
          </div>
          <div class="msg-assistant tools-only" id="mA2">
            <div class="tool-card" id="card2">
              <div class="tool-head"><span data-icon="chevron-down" data-size="14"></span><span data-icon="terminal" data-size="14"></span>
                <span class="name">run_shell</span><span class="summary">python3 hello.py</span><span id="card2status"></span></div>
              <div class="tool-body" id="card2body"><div class="label">Output</div><pre id="card2out">hello from GrokBot
[exit code 0]</pre></div>
            </div>
          </div>
          <div class="msg-assistant" id="mA3"><div class="md" id="a3md"></div></div>
          <span class="spinner-dot" id="thinkingDot" style="margin:4px 2px"></span>
        </div></div>
        <div class="composer-wrap" id="chatComposer" style="display:none"><div class="composer">
          <div class="fake-input ph">Ask anything, or drop a file</div>
          <div class="composer-row"><button class="round-btn" data-icon="plus" data-size="20"></button><div class="spacer"></div>
            <button class="round-btn" data-icon="mic" data-size="18"></button><button class="send-btn" id="chatSend"></button></div>
        </div></div>
      </main>
    </div>
  </div></div>
  <div id="capband"></div>
  <div class="cap" id="cap3">It asks before it touches anything.</div>
  <div class="cap" id="cap4">Then it actually does the work.</div>
</div>

<!-- Scene 5 -->
<div class="layer" id="s5">
  <div class="glow"></div>
  <div id="cap5">Any Ollama model. Any MCP app.</div>
  <div id="pModels"><div class="menu model-menu">
    <div class="menu-label">Installed models</div>
    <button class="menu-item mi"><span class="grow">qwen3:8b<div class="meta">8B · Q4_K_M</div></span><span class="chk" id="chk0" data-icon="check" data-size="15"></span></button>
    <button class="menu-item mi"><span class="grow">llama3.1:8b<div class="meta">8B · Q4_K_M</div></span><span class="chk" id="chk1" data-icon="check" data-size="15"></span></button>
    <button class="menu-item mi" id="miGpt"><span class="grow">gpt-oss:20b<div class="meta">20B · MXFP4</div></span><span class="chk" id="chk2" data-icon="check" data-size="15"></span></button>
    <div class="menu-sep mi"></div>
    <button class="menu-item mi"><span data-icon="settings-2" data-size="15"></span> <span class="grow">Manage models…</span></button>
  </div></div>
  <div id="pApps"><div class="modal">
    <div class="modal-head"><h2>Connect apps</h2><button class="icon-btn" data-icon="x" data-size="16"></button></div>
    <div class="modal-content">
      <p class="muted" style="margin-top:0">Apps are Model Context Protocol (MCP) servers. Their tools become available to every bot.</p>
      <div class="sidebar-section" style="padding-left:0">Suggested</div>
      <div class="cards" style="grid-template-columns:1fr 1fr">
        <button class="card ac"><strong>Browser (Playwright)</strong>Let the agent open and control a web browser.</button>
        <button class="card ac"><strong>Filesystem</strong>Read and write files in a folder you choose.</button>
        <button class="card ac"><strong>Memory</strong>Persistent knowledge-graph memory across bots.</button>
        <button class="card ac"><strong>GitHub</strong>Issues, PRs and repos.</button>
      </div>
    </div>
  </div></div>
</div>

<!-- Scene 6: outro -->
<div class="layer" id="s6">
  <div class="glow"></div>
  <img id="orb6" src="${logoUri}">
  <div id="word6">GrokBot Local</div>
  <div id="tag6">Runs on your Mac. Your chats stay there.</div>
  <div id="pill6">github.com/Vishen-dart-coder/GrokBot</div>
</div>

<div id="ripple"></div>
<svg id="cursor" viewBox="0 0 34 44"><path d="M4 3 L4 35 L12 27.5 L17.5 40 L23 37.5 L17.6 25.3 L28.5 25 Z" fill="#fff" stroke="#000" stroke-width="2.2" stroke-linejoin="round"/></svg>
</div>

<script>
${'window.__ICONS = ' + JSON.stringify(icons) + ';\n' + fs.readFileSync('video-script.js', 'utf8')}
</script></body></html>`
fs.writeFileSync('video.html', html)
console.log('video.html', (html.length / 1024).toFixed(0) + ' KB')
