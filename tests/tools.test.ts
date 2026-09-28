import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinTools, htmlToText, resolveInWorkspace, type ToolContext } from '../src/main/tools'

const tool = (name: string) => builtinTools.find((t) => t.name === name)!
let ctx: ToolContext

beforeEach(async () => {
  ctx = { workspace: await mkdtemp(path.join(os.tmpdir(), 'grokbot-')), shellTimeoutSec: 10 }
})

describe('workspace sandbox', () => {
  it('rejects paths escaping the workspace', () => {
    expect(() => resolveInWorkspace('/ws', '../etc/passwd')).toThrow(/outside the workspace/)
    expect(() => resolveInWorkspace('/ws', '/etc/passwd')).toThrow(/outside the workspace/)
    expect(() => resolveInWorkspace('/ws', '/ws2/x')).toThrow(/outside the workspace/)
    expect(resolveInWorkspace('/ws', 'a/b.txt')).toBe(path.resolve('/ws/a/b.txt'))
  })
})

describe('file tools', () => {
  it('writes, reads, edits and lists files', async () => {
    await tool('write_file').run({ path: 'src/hello.txt', content: 'one\ntwo\nthree' }, ctx)
    expect((await tool('read_file').run({ path: 'src/hello.txt', start_line: 2, end_line: 3 }, ctx)).output).toBe('two\nthree')
    await tool('edit_file').run({ path: 'src/hello.txt', old_text: 'two', new_text: '2' }, ctx)
    expect(await readFile(path.join(ctx.workspace, 'src/hello.txt'), 'utf8')).toBe('one\n2\nthree')
    expect((await tool('list_dir').run({}, ctx)).output).toBe('src/\nsrc/hello.txt')
  })

  it('refuses ambiguous edits', async () => {
    await writeFile(path.join(ctx.workspace, 'a.txt'), 'x x')
    await expect(tool('edit_file').run({ path: 'a.txt', old_text: 'x', new_text: 'y' }, ctx)).rejects.toThrow(/occurs 2 times/)
    await tool('edit_file').run({ path: 'a.txt', old_text: 'x', new_text: '$&y', replace_all: true }, ctx)
    expect(await readFile(path.join(ctx.workspace, 'a.txt'), 'utf8')).toBe('$&y $&y')
  })

  it('searches file contents', async () => {
    await writeFile(path.join(ctx.workspace, 'notes.md'), 'alpha\nbeta gamma\n')
    expect((await tool('search_files').run({ pattern: 'gam+a' }, ctx)).output).toBe('notes.md:2: beta gamma')
  })
})

describe('run_shell', () => {
  it('runs in the workspace and reports exit code', async () => {
    const res = await tool('run_shell').run({ command: 'pwd && echo hi >&2 && exit 3' }, ctx)
    expect(res.output).toContain(ctx.workspace)
    expect(res.output).toContain('hi')
    expect(res.output).toContain('[exit code 3]')
  })

  it('times out long commands', async () => {
    const res = await tool('run_shell').run({ command: 'sleep 5' }, { ...ctx, shellTimeoutSec: 1 })
    expect(res.output).toContain('timed out')
  })
})

describe('htmlToText', () => {
  it('strips tags and scripts', () => {
    expect(htmlToText('<p>Hi&amp;bye</p><script>x()</script><b>bold</b>')).toBe('Hi&bye\nbold')
  })
})
