#!/usr/bin/env bash
# Copies branding assets out of the original Grok Bot app and applies them to GrokBot Local.
#
#   npm run assets:import                       # uses /Applications/Grok Bot.app
#   npm run assets:import -- "/path/to/Other.app"
#
# What it does:
#   1. App icon   → build/icon.icns + build/icon.png   (used by the packaged .app / dmg)
#   2. Images, SVGs and fonts inside the app bundle → assets/grokbot/ (raw dump + MANIFEST.txt)
#   3. Best-guess logo / wordmark → src/renderer/src/assets/brand/ (shown on the home screen and About)
# Everything it replaces is backed up to assets/backup-<timestamp>/ first.
# Replace any of these files later with your own artwork. Then rebuild.
set -euo pipefail

APP="${1:-/Applications/Grok Bot.app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$APP/Contents/Resources"
DUMP="$ROOT/assets/grokbot"
BRAND="$ROOT/src/renderer/src/assets/brand"
BACKUP="$ROOT/assets/backup-$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
[[ -d "$RES" ]] || { echo "Not found: $APP (pass the .app path as the first argument)"; exit 1; }

mkdir -p "$BACKUP" "$DUMP" "$BRAND"
cp -p "$ROOT/build/icon.png" "$BACKUP/" 2>/dev/null || true
cp -p "$ROOT/build/icon.icns" "$BACKUP/" 2>/dev/null || true
cp -pR "$BRAND" "$BACKUP/brand" 2>/dev/null || true

# ---------- 1. App icon ----------
ICON_NAME=""
if command -v plutil >/dev/null 2>&1; then
  ICON_NAME="$(plutil -extract CFBundleIconFile raw "$APP/Contents/Info.plist" 2>/dev/null || true)"
else
  ICON_NAME="$(grep -A1 CFBundleIconFile "$APP/Contents/Info.plist" | sed -n 's:.*<string>\(.*\)</string>.*:\1:p')"
fi
ICNS="$RES/${ICON_NAME%.icns}.icns"
[[ -f "$ICNS" ]] || ICNS="$(ls "$RES"/*.icns 2>/dev/null | head -1 || true)"
if [[ -n "$ICNS" && -f "$ICNS" ]]; then
  cp "$ICNS" "$ROOT/build/icon.icns"
  mkdir -p "$DUMP/app-icon"
  cp "$ICNS" "$DUMP/app-icon/"
  if command -v sips >/dev/null 2>&1; then
    sips -s format png --resampleHeightWidthMax 1024 "$ICNS" --out "$ROOT/build/icon.png" >/dev/null
    cp "$ROOT/build/icon.png" "$DUMP/app-icon/icon-1024.png"
    say "App icon → build/icon.icns + build/icon.png"
  else
    say "App icon → build/icon.icns (no 'sips' here, so build/icon.png was left as is)"
  fi
else
  say "No .icns icon found in $RES"
fi

# ---------- 2. Images + fonts from the bundle ----------
SRC="$TMP/src"
mkdir -p "$SRC/resources"
# Loose files in Contents/Resources (tray icons, dmg art, …) — skip Electron's locale folders.
find "$RES" -maxdepth 2 -type f \( -iname '*.png' -o -iname '*.svg' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.ico' \) \
  ! -path '*.lproj/*' -exec cp {} "$SRC/resources/" \; 2>/dev/null || true

if [[ -f "$RES/app.asar" ]]; then
  say "Extracting app.asar…"
  npx --yes @electron/asar extract "$RES/app.asar" "$SRC/app" >/dev/null
fi
[[ -d "$RES/app.asar.unpacked" ]] && cp -R "$RES/app.asar.unpacked" "$SRC/unpacked"
[[ -d "$RES/app" ]] && cp -R "$RES/app" "$SRC/app-dir"

COUNT=0
while IFS= read -r -d '' f; do
  rel="${f#"$SRC"/}"
  mkdir -p "$DUMP/$(dirname "$rel")"
  cp "$f" "$DUMP/$rel"
  COUNT=$((COUNT + 1))
done < <(find "$SRC" -type f \( -iname '*.png' -o -iname '*.svg' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.ico' \
  -o -iname '*.woff' -o -iname '*.woff2' -o -iname '*.ttf' -o -iname '*.otf' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.lottie' \) \
  ! -path '*/node_modules/*' -print0)

(cd "$DUMP" && find . -type f ! -name MANIFEST.txt -exec ls -l {} \; | awk '{print $5"\t"$9}' | sort -k2) > "$DUMP/MANIFEST.txt"
say "Copied $COUNT asset files → assets/grokbot/ (see MANIFEST.txt)"

# ---------- 3. Logo / wordmark for the UI ----------
pick() { # pick <name-regex> → prints best match (prefers svg, then largest raster)
  local re="$1" best=""
  best="$(find "$DUMP" -type f -iname '*.svg' | grep -iE "$re" | grep -viE 'favicon|tray|template' | head -1 || true)"
  if [[ -z "$best" ]]; then
    best="$(find "$DUMP" -type f \( -iname '*.png' -o -iname '*.webp' \) | grep -iE "$re" | grep -viE 'tray|template' \
      | while read -r f; do echo "$(wc -c <"$f") $f"; done | sort -rn | head -1 | cut -d' ' -f2- || true)"
  fi
  echo "$best"
}
apply() { # apply <target-name> <file>
  local name="$1" file="$2"
  [[ -n "$file" ]] || return 0
  rm -f "$BRAND/$name".{svg,png,webp,jpg,jpeg}
  local ext
  ext="$(echo "${file##*.}" | tr '[:upper:]' '[:lower:]')"
  cp "$file" "$BRAND/$name.$ext"
  say "UI $name ← ${file#"$ROOT"/}"
}
LOGO="$(pick 'logo')"
[[ -z "$LOGO" ]] && LOGO="$(pick 'brand|mark')"
[[ -z "$LOGO" ]] && LOGO="$(pick '(^|/)(app-?)?icon[^/]*$')"
[[ -z "$LOGO" && -f "$DUMP/app-icon/icon-1024.png" ]] && LOGO="$DUMP/app-icon/icon-1024.png"
apply logo "$LOGO"
apply wordmark "$(pick 'wordmark|logotype|word-mark|logo-text|logo_full|full-logo')"

cat <<EOF

Done. Backup of the previous icon/logo: ${BACKUP#"$ROOT"/}
Next:
  • Browse assets/grokbot/ and copy any other file you want into src/renderer/src/assets/brand/
    (logo.* and wordmark.* are picked up automatically).
  • npm run dev        — see it in the app
  • npm run dist:mac   — rebuild the .app/.dmg with the new icon
EOF
