#!/usr/bin/env bash
# Brands the generated Capacitor Android project: launcher icons, splash,
# full-screen activity and version numbers.
# Usage: tools/android-customize.sh <tag, e.g. v1.2.0> <build number> <splash color>
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-v1.0.0}"; CODE="${2:-1}"; BG="${3:-#3a1a6e}"
VERSION="${TAG#v}"
APP_ID=$(node -p "require('./capacitor.config.json').appId")
RES=android/app/src/main/res

declare -A SIZES=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
for d in "${!SIZES[@]}"; do
  s=${SIZES[$d]}; fg=$((s * 9 / 4))
  convert icons/icon-512.png -resize "${s}x${s}" "$RES/mipmap-$d/ic_launcher.png"
  convert icons/icon-512.png -resize "${s}x${s}" "$RES/mipmap-$d/ic_launcher_round.png"
  convert icons/maskable-512.png -resize "${fg}x${fg}" "$RES/mipmap-$d/ic_launcher_foreground.png"
done

find "$RES" -name 'splash.png' | while read -r f; do
  wh=$(identify -format '%w %h' "$f"); w=${wh% *}; h=${wh#* }
  s=$(( (w < h ? w : h) / 3 ))
  convert -size "${w}x${h}" "xc:$BG" \( icons/icon-512.png -resize "${s}x${s}" \) -gravity center -composite "$f"
done

PKG_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"
sed "s/__APP_ID__/$APP_ID/" tools/MainActivity.java > "$PKG_DIR/MainActivity.java"

sed -i -E "s/versionCode [0-9]+/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" android/app/build.gradle
echo "Customized $APP_ID $VERSION ($CODE)"
