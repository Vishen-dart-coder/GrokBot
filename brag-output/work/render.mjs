// Renders video.html frame by frame (30 fps) and pipes PNGs into ffmpeg with the soundtrack.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import path from 'node:path'
const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')
const FF = (await import('ffmpeg-static')).default
const FPS = 30, DUR = 21.0, POSTER_T = Number(process.env.POSTER_T ?? 2.0)
const frames = Math.round(FPS * DUR)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('file://' + path.resolve('video.html'))
await p.evaluate(() => Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(w + ' 20px Inter'))))
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))

const ff = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-i', 'soundtrack.wav',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', '../brag.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] })
const t0 = Date.now()
for (let f = 0; f < frames; f++) {
  // Frame 0 is the poster (so every platform's thumbnail shows it); duration & sync unchanged.
  const t = f === 0 ? POSTER_T : f / FPS
  await p.evaluate((t) => window.renderAt(t), t)
  const png = await p.screenshot({ type: 'png' })
  if (f === 0) await p.screenshot({ path: '../brag.jpg', type: 'jpeg', quality: 92 })
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r))
  if (f % 90 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await b.close()
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'errors:', errs)
