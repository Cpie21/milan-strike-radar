#!/bin/sh
# Re-download the App Store screenshots used as design references.
cd "$(dirname "$0")"
for pair in "flighty:id1358823008" "citymapper:id469463298" "transit:id498151501" "apple-weather:id1069513131" "apple-sports:id6446788829"; do
  name=${pair%%:*}; id=${pair#*:}; i=0
  html=$(curl -sL -A "Mozilla/5.0 (Macintosh)" "https://apps.apple.com/us/app/$id")
  for u in $(echo "$html" | grep -oE 'https://is[0-9]-ssl\.mzstatic\.com/image/thumb/[^" ]+/[^/" ]+\.(png|jpg|jpeg)/600x1300bb-60\.jpg' | awk '!seen[$0]++' | head -8); do
    i=$((i+1)); curl -s -o "$name-$i.jpg" "$u"
  done
  echo "$name: $i"
done
