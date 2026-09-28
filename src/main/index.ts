import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeTheme, screen, session, shell } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentEvent, Attachment, McpServerStatus, Settings, ToolInfo } from '@shared/types'
import { Agent } from './agent'
import { McpManager } from './mcp'
import { OllamaClient } from './ollama'
import { Store } from './store'
import { builtinTools } from './tools'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Pin the name so userData is always "<config>/GrokBot Local", however the app is launched.
app.setName('GrokBot Local')

let win: BrowserWindow | null = null
const store = new Store(path.join(app.getPath('userData'), 'data'), os.homedir())
const ollama = new OllamaClient('http://127.0.0.1:11434')
const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload)
const mcp = new McpManager((s: McpServerStatus[]) => send('mcp:status', s))

async function screenshot(): Promise<string> {
  const { width, height } = screen.getPrimaryDisplay().size
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  if (!src) throw new Error('no screen available to capture')
  return src.thumbnail.resize({ width: Math.min(width, 1600) }).toPNG().toString('base64')
}

const agent = new Agent({
  store,
  ollama,
  tools: () => [...builtinTools, ...mcp.tools()],
  emit: (e: AgentEvent) => send('agent:event', e),
  screenshot
})

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

async function importFile(botId: string, src: string): Promise<Attachment> {
  const bot = await store.getBot(botId)
  if (!bot) throw new Error('bot not found')
  const dir = path.join(bot.workspace, 'uploads')
  await fs.mkdir(dir, { recursive: true })
  const ext = path.extname(src).toLowerCase()
  let name = path.basename(src)
  let dest = path.join(dir, name)
  for (let i = 1; await fs.stat(dest).then(() => true, () => false); i++) {
    name = `${path.basename(src, ext)}-${i}${ext}`
    dest = path.join(dir, name)
  }
  await fs.copyFile(src, dest)
  const { size } = await fs.stat(dest)
  const mime = IMAGE_TYPES[ext] ?? 'application/octet-stream'
  const base64 = mime.startsWith('image/') && size < 15_000_000 ? (await fs.readFile(dest)).toString('base64') : undefined
  return { name, path: path.relative(bot.workspace, dest), mime, size, base64 }
}

function applySettings(s: Settings) {
  ollama.setHost(s.ollamaHost)
  nativeTheme.themeSource = s.theme
  void mcp.sync(s.mcpServers)
}

function registerIpc() {
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
    const s = await store.updateSettings(patch)
    applySettings(s)
    return s
  })

  ipcMain.handle('ollama:status', () => ollama.status())
  ipcMain.handle('ollama:models', () => ollama.listModels())
  ipcMain.handle('ollama:delete', (_e, model: string) => ollama.deleteModel(model))
  ipcMain.handle('ollama:pull', async (_e, model: string) => {
    try {
      for await (const p of ollama.pull(model)) send('ollama:pull-progress', p)
      send('ollama:pull-progress', { model, status: 'success', done: true })
    } catch (e) {
      send('ollama:pull-progress', { model, status: 'error', done: true, error: e instanceof Error ? e.message : String(e) })
    }
  })

  ipcMain.handle('bots:list', () => store.listBots())
  ipcMain.handle('bots:get', (_e, id: string) => store.getBot(id))
  ipcMain.handle('bots:create', () => store.createBot())
  ipcMain.handle('bots:update', (_e, id: string, patch) => store.updateBot(id, patch))
  ipcMain.handle('bots:delete', (_e, id: string) => {
    agent.stop(id)
    return store.deleteBot(id)
  })
  ipcMain.handle('bots:search', (_e, q: string) => store.search(q))

  ipcMain.handle('agent:send', (_e, botId: string, text: string, atts: Attachment[]) => {
    void agent.send(botId, text, atts).catch((err) => send('agent:event', { type: 'error', botId, error: String(err?.message ?? err) }))
  })
  ipcMain.handle('agent:stop', (_e, botId: string) => agent.stop(botId))
  ipcMain.handle('agent:approve', (_e, botId: string, callId: string, allow: boolean, always: boolean) =>
    agent.respondApproval(botId, callId, allow, always)
  )
  ipcMain.handle('agent:running', (_e, botId: string) => agent.isRunning(botId))

  ipcMain.handle('files:pick', async (_e, botId: string) => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] })
    return Promise.all(res.filePaths.map((p) => importFile(botId, p)))
  })
  ipcMain.handle('files:import', (_e, botId: string, paths: string[]) => Promise.all(paths.map((p) => importFile(botId, p))))

  ipcMain.handle('workspace:open', async (_e, botId: string) => {
    const bot = await store.getBot(botId)
    if (bot) await shell.openPath(bot.workspace)
  })
  ipcMain.handle('dialog:chooseDir', async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('tools:list', (): ToolInfo[] => [
    ...builtinTools.map((t) => ({ name: t.name, description: t.description, source: 'builtin' as const, risky: t.risky })),
    ...mcp.tools().map((t) => ({ name: t.name, description: t.description, source: 'mcp' as const, risky: t.risky }))
  ])
  ipcMain.handle('mcp:status', () => mcp.statuses())

  // Speech-to-text via an OpenAI-compatible transcription server (e.g. whisper.cpp / faster-whisper).
  ipcMain.handle('voice:transcribe', async (_e, audio: ArrayBuffer, mime: string) => {
    const { transcriptionUrl } = await store.getSettings()
    if (!transcriptionUrl) throw new Error('Speech-to-text is not configured. Set a transcription URL in Settings → Voice.')
    const form = new FormData()
    form.append('file', new Blob([audio], { type: mime }), 'speech.webm')
    form.append('model', 'whisper-1')
    const res = await fetch(transcriptionUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Transcription failed: HTTP ${res.status}`)
    const body = (await res.json()) as { text?: string }
    return (body.text ?? '').trim()
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, userData: app.getPath('userData') }))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 500,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  registerIpc()
  applySettings(await store.getSettings())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => void mcp.closeAll())
