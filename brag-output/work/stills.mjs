import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')
const times = process.argv.slice(2).map(Number)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('file://' + path.resolve('video.html'))
await p.evaluate(() => document.fonts.ready)
for (const t of times) {
  await p.evaluate((t) => window.renderAt(t), t)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.screenshot({ path: `still-${t.toFixed(2)}.png` })
}
console.log('fonts:', await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + f.weight).join(',')), 'errors:', errs)
await b.close()
