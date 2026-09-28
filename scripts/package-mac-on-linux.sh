#!/usr/bin/env bash
# Cross-build macOS apps from Linux: electron-builder --dir, ad-hoc sign with rcodesign,
# and zip with symlinks preserved (framework symlinks must survive or the app won't launch).
# On a Mac, just use `npm run dist:mac` instead.
set -euo pipefail
RCODESIGN="${RCODESIGN:-rcodesign}"
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")

npm run build | grep -E "error|built in"
rm -rf dist
npx electron-builder --mac dir --arm64 --x64 -c.mac.identity=null --publish never

for d in mac-arm64:arm64 mac:x64; do
  dir=${d%%:*}; arch=${d##*:}
  app="dist/$dir/GrokBot Local.app"
  "$RCODESIGN" sign "$app"
  (cd "dist/$dir" && zip -qry "../GrokBot-Local-$VERSION-mac-$arch.zip" "GrokBot Local.app")
done
ls -lh dist/*.zip
