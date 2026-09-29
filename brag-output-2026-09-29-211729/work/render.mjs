// Renders video.html with motion blur: 3 sub-frames per output frame (180° shutter) averaged by ffmpeg.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import path from 'node:path'
const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')
const FF = (await import('ffmpeg-static')).default
const FPS = 30, DUR = 20.5, SUB = 3, POSTER_T = Number(process.env.POSTER_T ?? 1.8)
const frames = Math.round(FPS * DUR)
const shutter = 0.5 / FPS // 180°
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('file://' + path.resolve('video.html'))
await p.evaluate(() => Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(w + ' 20px Inter'))))
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
const ff = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-c:v', 'png', '-i', '-',
  '-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`, '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', 'video-only.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] })
const t0 = Date.now()
for (let f = 0; f < frames; f++) {
  for (let k = 0; k < SUB; k++) {
    const t = f === 0 ? POSTER_T : Math.max(0, f / FPS + (k / (SUB - 1) - 0.5) * shutter)
    await p.evaluate((t) => window.renderAt(t), t)
    const png = await p.screenshot({ type: 'png' })
    if (f === 0 && k === 0) await p.screenshot({ path: '../brag.jpg', type: 'jpeg', quality: 92 })
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  if (f % 120 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await b.close()
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'errors:', errs)
