import { memo, useEffect, useId, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ text, size = 14 }: { text: string; size?: number }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="icon-btn sm"
      title="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? <Check size={size} /> : <Copy size={size} />}
    </button>
  )
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

function Mermaid({ code }: { code: string }) {
  const id = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
      try {
        const out = await mermaid.render(id, code)
        if (alive) setSvg(out.svg)
      } catch (e) {
        if (alive) setErr(String(e))
      }
    })
    return () => {
      alive = false
    }
  }, [code, id])
  if (err) return <pre className="muted">{code}</pre>
  return <div className="mermaid-box" dangerouslySetInnerHTML={{ __html: svg }} />
}

export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} onClick={(e) => (e.preventDefault(), href && window.grok.openExternal(href))}>
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            const className = (child as { props?: { className?: string } })?.props?.className ?? ''
            const lang = /language-(\S+)/.exec(className)?.[1] ?? ''
            const code = textOf(children).replace(/\n$/, '')
            if (lang === 'mermaid' && !streaming) return <Mermaid code={code} />
            return (
              <div className="codeblock">
                <div className="codeblock-head">
                  <span>{lang || 'text'}</span>
                  <CopyButton text={code} size={13} />
                </div>
                <pre>{children}</pre>
              </div>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
