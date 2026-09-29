// macOS/Linux integration: login-shell PATH and the native application menu.

import { execFileSync } from 'node:child_process'
import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/**
 * Apps launched from Finder/Dock get a minimal PATH (/usr/bin:/bin:…), so tools installed
 * with Homebrew/nvm (npx, python3, ollama) would be missing. Copy PATH from the login shell.
 */
export function inheritShellPath() {
  if (process.platform === 'win32') return
  try {
    const sh = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const out = execFileSync(sh, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const found = /__PATH__(.*)__PATH__/.exec(out)?.[1]
    const extra = ['/opt/homebrew/bin', '/usr/local/bin']
    const parts = [...(found ?? process.env.PATH ?? '').split(':'), ...extra].filter(Boolean)
    process.env.PATH = [...new Set(parts)].join(':')
  } catch {
    process.env.PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':')
  }
}

/** Native menu. Actions that live in the UI are forwarded to the renderer as 'menu' events. */
export function buildMenu(getWin: () => BrowserWindow | null) {
  const send = (action: string) => () => getWin()?.webContents.send('menu', action)
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: send('settings') },
              { label: 'Connect Apps…', click: send('apps') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Bot', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: 'Search…', accelerator: 'CmdOrCtrl+K', click: send('search') },
        { label: 'Open Workspace Folder', accelerator: 'CmdOrCtrl+Shift+O', click: send('workspace') },
        { label: 'Export Chat as Markdown…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: send('sidebar') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Ollama Model Library', click: () => void shell.openExternal('https://ollama.com/search?c=tools') },
        { label: 'Ollama API Docs', click: () => void shell.openExternal('https://github.com/ollama/ollama/blob/main/docs/api.md') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
