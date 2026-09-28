import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { GrokApi } from './api'

const on =
  <T,>(channel: string) =>
  (cb: (payload: T) => void) => {
    const listener = (_e: unknown, payload: T) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => void ipcRenderer.removeListener(channel, listener)
  }

const api: GrokApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status'),
    models: () => ipcRenderer.invoke('ollama:models'),
    pull: (model) => ipcRenderer.invoke('ollama:pull', model),
    remove: (model) => ipcRenderer.invoke('ollama:delete', model),
    onPullProgress: on('ollama:pull-progress')
  },
  bots: {
    list: () => ipcRenderer.invoke('bots:list'),
    get: (id) => ipcRenderer.invoke('bots:get', id),
    create: () => ipcRenderer.invoke('bots:create'),
    update: (id, patch) => ipcRenderer.invoke('bots:update', id, patch),
    remove: (id) => ipcRenderer.invoke('bots:delete', id),
    search: (q) => ipcRenderer.invoke('bots:search', q)
  },
  agent: {
    send: (botId, text, atts) => ipcRenderer.invoke('agent:send', botId, text, atts),
    stop: (botId) => ipcRenderer.invoke('agent:stop', botId),
    approve: (botId, callId, allow, always) => ipcRenderer.invoke('agent:approve', botId, callId, allow, always),
    isRunning: (botId) => ipcRenderer.invoke('agent:running', botId),
    onEvent: on('agent:event')
  },
  files: {
    pick: (botId) => ipcRenderer.invoke('files:pick', botId),
    importFiles: (botId, files) =>
      ipcRenderer.invoke('files:import', botId, files.map((f) => webUtils.getPathForFile(f)).filter(Boolean))
  },
  workspace: {
    open: (botId) => ipcRenderer.invoke('workspace:open', botId),
    chooseDir: () => ipcRenderer.invoke('dialog:chooseDir')
  },
  tools: { list: () => ipcRenderer.invoke('tools:list') },
  mcp: { status: () => ipcRenderer.invoke('mcp:status'), onStatus: on('mcp:status') },
  voice: { transcribe: (audio, mime) => ipcRenderer.invoke('voice:transcribe', audio, mime) },
  onMenu: on('menu'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  platform: process.platform
}

contextBridge.exposeInMainWorld('grok', api)
