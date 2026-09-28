// Built-in agent tools. They operate on the bot's workspace directory ("GrokBot's computer").
// File tools are confined to the workspace; shell commands run with the workspace as cwd.

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface ToolContext {
  workspace: string
  signal?: AbortSignal
  shellTimeoutSec: number
  /** Provided by the Electron main process; returns a base64 PNG of the primary display. */
  screenshot?: () => Promise<string>
}

export interface ToolResult {
  output: string
  images?: string[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** Risky tools mutate state and need approval unless approvalMode === 'auto'. */
  risky: boolean
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

const MAX_OUTPUT = 30_000

export function truncate(text: string, max = MAX_OUTPUT): string {
  if (text.length <= max) return text
  const half = Math.floor(max / 2)
  return `${text.slice(0, half)}\n\n… [${text.length - max} characters truncated] …\n\n${text.slice(-half)}`
}

/** Resolves a user/model supplied path inside the workspace, rejecting escapes. */
export function resolveInWorkspace(workspace: string, p: unknown): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path is required')
  const root = path.resolve(workspace)
  const full = path.resolve(root, p)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`path "${p}" is outside the workspace (${root})`)
  }
  return full
}

function str(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key]
  if (typeof v === 'string') return v
  if (v === undefined || v === null) {
    if (required) throw new Error(`missing required argument "${key}"`)
    return ''
  }
  return String(v)
}

export function runShell(command: string, ctx: ToolContext): Promise<ToolResult> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const child = spawn(isWin ? 'cmd.exe' : process.env.SHELL || '/bin/bash', isWin ? ['/c', command] : ['-lc', command], {
      cwd: ctx.workspace,
      env: { ...process.env, GROKBOT_WORKSPACE: ctx.workspace },
      signal: ctx.signal
    })
    let out = ''
    const onData = (d: Buffer) => {
      out += d.toString()
      if (out.length > MAX_OUTPUT * 4) out = out.slice(-MAX_OUTPUT * 2)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => {
      out += `\n[timed out after ${ctx.shellTimeoutSec}s]`
      child.kill('SIGKILL')
    }, ctx.shellTimeoutSec * 1000)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ output: truncate(`${out}\n[error] ${e.message}`) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ output: truncate(`${out.trimEnd()}\n[exit code ${code ?? 'killed'}]`.trimStart()) })
    })
  })
}

async function walk(dir: string, root: string, depth: number, out: string[], limit: number) {
  if (depth < 0 || out.length >= limit) return
  const entries = await fs.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    if (out.length >= limit) return
    if (e.name === 'node_modules' || e.name === '.git') continue
    const full = path.join(dir, e.name)
    const rel = path.relative(root, full)
    out.push(e.isDirectory() ? rel + '/' : rel)
    if (e.isDirectory()) await walk(full, root, depth - 1, out, limit)
  }
}

export const builtinTools: ToolDef[] = [
  {
    name: 'run_shell',
    description:
      'Run a shell command on the local computer with the workspace as the working directory. Returns combined stdout/stderr and the exit code.',
    risky: true,
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The shell command to run' } },
      required: ['command']
    },
    run: (args, ctx) => runShell(str(args, 'command'), ctx)
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace. Optionally restrict to a line range (1-based, inclusive).',
    risky: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace' },
        start_line: { type: 'integer' },
        end_line: { type: 'integer' }
      },
      required: ['path']
    },
    async run(args, ctx) {
      const file = resolveInWorkspace(ctx.workspace, args.path)
      let text = await fs.readFile(file, 'utf8')
      const start = Number(args.start_line) || 0
      const end = Number(args.end_line) || 0
      if (start || end) {
        const lines = text.split('\n')
        text = lines.slice(Math.max(0, start - 1), end || lines.length).join('\n')
      }
      return { output: truncate(text) }
    }
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file in the workspace with the given content. Parent directories are created.',
    risky: true,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    },
    async run(args, ctx) {
      const file = resolveInWorkspace(ctx.workspace, args.path)
      const content = str(args, 'content', false)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, content, 'utf8')
      return { output: `Wrote ${Buffer.byteLength(content)} bytes to ${path.relative(ctx.workspace, file)}` }
    }
  },
  {
    name: 'edit_file',
    description:
      'Replace an exact snippet of text in a workspace file. old_text must appear exactly once unless replace_all is true.',
    risky: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
        replace_all: { type: 'boolean' }
      },
      required: ['path', 'old_text', 'new_text']
    },
    async run(args, ctx) {
      const file = resolveInWorkspace(ctx.workspace, args.path)
      const oldText = str(args, 'old_text')
      const newText = str(args, 'new_text', false)
      if (!oldText) throw new Error('old_text must not be empty')
      const text = await fs.readFile(file, 'utf8')
      const count = text.split(oldText).length - 1
      if (count === 0) throw new Error('old_text not found in file')
      if (count > 1 && !args.replace_all) throw new Error(`old_text occurs ${count} times; make it unique or set replace_all`)
      const updated = args.replace_all ? text.split(oldText).join(newText) : text.replace(oldText, () => newText)
      await fs.writeFile(file, updated, 'utf8')
      return { output: `Edited ${path.relative(ctx.workspace, file)} (${args.replace_all ? count : 1} replacement(s))` }
    }
  },
  {
    name: 'list_dir',
    description: 'List files and folders in a workspace directory (recursive up to depth).',
    risky: false,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Defaults to the workspace root' }, depth: { type: 'integer' } },
      required: []
    },
    async run(args, ctx) {
      const dir = resolveInWorkspace(ctx.workspace, (args.path as string) || '.')
      const out: string[] = []
      await walk(dir, dir, Math.min(Number(args.depth) || 2, 6) - 1, out, 500)
      return { output: out.length ? out.join('\n') : '(empty directory)' }
    }
  },
  {
    name: 'search_files',
    description: 'Search workspace text files for a regular expression. Returns matching lines as path:line: text.',
    risky: false,
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string' } },
      required: ['pattern']
    },
    async run(args, ctx) {
      const re = new RegExp(str(args, 'pattern'), 'i')
      const dir = resolveInWorkspace(ctx.workspace, (args.path as string) || '.')
      const files: string[] = []
      await walk(dir, dir, 8, files, 5000)
      const hits: string[] = []
      for (const rel of files) {
        if (rel.endsWith('/') || hits.length >= 200) continue
        const full = path.join(dir, rel)
        const stat = await fs.stat(full)
        if (stat.size > 2_000_000) continue
        const text = await fs.readFile(full, 'utf8')
        if (text.includes('\u0000')) continue
        text.split('\n').forEach((line, i) => {
          if (hits.length < 200 && re.test(line)) hits.push(`${rel}:${i + 1}: ${line.slice(0, 300)}`)
        })
      }
      return { output: hits.length ? hits.join('\n') : 'No matches.' }
    }
  },
  {
    name: 'web_fetch',
    description: 'Fetch a URL over HTTP(S) and return its text content (HTML is converted to plain text).',
    risky: false,
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async run(args, ctx) {
      const url = new URL(str(args, 'url'))
      if (!/^https?:$/.test(url.protocol)) throw new Error('only http(s) URLs are allowed')
      const res = await fetch(url, { signal: ctx.signal ?? AbortSignal.timeout(20_000), redirect: 'follow' })
      const type = res.headers.get('content-type') ?? ''
      let text = await res.text()
      if (type.includes('html')) text = htmlToText(text)
      return { output: truncate(`HTTP ${res.status} ${url.href}\n\n${text}`, 20_000) }
    }
  },
  {
    name: 'take_screenshot',
    description: "Capture a screenshot of the user's primary display so you can see it (requires a vision-capable model).",
    risky: true,
    parameters: { type: 'object', properties: {}, required: [] },
    async run(_args, ctx) {
      if (!ctx.screenshot) throw new Error('screenshots are not available')
      const png = await ctx.screenshot()
      return { output: 'Screenshot captured and attached.', images: [png] }
    }
  }
]

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}
