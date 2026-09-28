// Branding lives in src/renderer/src/assets/brand/. Drop in logo.(svg|png|webp|jpg) and
// wordmark.(svg|png|webp) to rebrand; scripts/import-grokbot-assets.sh fills these from Grok Bot.app.
const files = import.meta.glob('../assets/brand/*.{svg,png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>

function pick(name: string): string | undefined {
  for (const ext of ['svg', 'png', 'webp', 'jpg', 'jpeg']) {
    const hit = files[`../assets/brand/${name}.${ext}`]
    if (hit) return hit
  }
  return undefined
}

export const brand = {
  name: 'GrokBot Local',
  logo: pick('logo'),
  wordmark: pick('wordmark')
}
