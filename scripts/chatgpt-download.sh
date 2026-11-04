#!/bin/bash
# chatgpt-download.sh — Download generated images from ChatGPT via Chrome JS
# Usage: ./chatgpt-download.sh <chat_id> <output_dir> [prefix]
# Requires: Google Chrome with AppleScript JS enabled, python3
set -euo pipefail

CHAT_ID="${1:?Usage: chatgpt-download.sh <chat_id> <output_dir> [prefix]}"
OUT_DIR="${2:?Usage: chatgpt-download.sh <chat_id> <output_dir> [prefix]}"
PREFIX="${3:-v5}"
CHUNK_SIZE=40000

mkdir -p "$OUT_DIR"

run_js() {
  osascript -e "tell application \"Google Chrome\"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains \"${CHAT_ID}\" then
          return execute t javascript (read POSIX file \"$1\")
        end if
      end repeat
    end repeat
    return \"TAB_NOT_FOUND\"
  end tell" 2>/dev/null
}

echo "[1/4] Discovering generated images..."

# Step 1: Find all unique square image URLs and store in window.__imgUrls
cat > /tmp/cg-discover.js << 'JSEOF'
(function(){
  var imgs = document.querySelectorAll('img');
  var seen = {};
  var urls = [];
  for(var i=0;i<imgs.length;i++){
    var img = imgs[i];
    if(img.naturalWidth < 1000 || img.naturalWidth !== img.naturalHeight) continue;
    if(img.src.indexOf('estuary/content') === -1) continue;
    var m = img.src.match(/id=([^&]+)/);
    var key = m ? m[1] : img.src;
    if(seen[key]) continue;
    seen[key] = true;
    urls.push(img.src);
  }
  window.__imgUrls = urls;
  window.__imgIdx = 0;
  window.__imgB64 = null;
  window.__imgReady = false;
  return 'FOUND_' + urls.length;
})()
JSEOF

RESULT=$(run_js /tmp/cg-discover.js)
echo "  $RESULT"
COUNT=$(echo "$RESULT" | sed 's/FOUND_//')

if [ "$COUNT" = "0" ] || [ "$RESULT" = "TAB_NOT_FOUND" ]; then
  echo "No images found or tab not found."
  exit 1
fi

# Step 2: For each image, async fetch -> base64 -> window.__imgB64
for IDX in $(seq 0 $((COUNT - 1))); do
  NAME="${PREFIX}-shot-$(printf '%02d' $IDX).png"
  echo "[2/4] Fetching image $IDX/$COUNT -> $NAME ..."

  cat > /tmp/cg-fetch.js << JSEOF
(function(){
  window.__imgB64 = null;
  window.__imgReady = false;
  window.__imgError = null;
  var url = window.__imgUrls[$IDX];
  if(!url){ window.__imgError = 'NO_URL'; window.__imgReady = true; return 'NO_URL'; }
  fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP_' + r.status);
    return r.arrayBuffer();
  }).then(function(buf){
    var arr = new Uint8Array(buf);
    var b64 = '';
    var chunk = 8192;
    for(var i=0;i<arr.length;i+=chunk){
      b64 += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i+chunk, arr.length)));
    }
    window.__imgB64 = btoa(b64);
    window.__imgReady = true;
  }).catch(function(e){
    window.__imgError = e.message;
    window.__imgReady = true;
  });
  return 'FETCHING';
})()
JSEOF

  run_js /tmp/cg-fetch.js > /dev/null

  # Poll until ready (max 30s)
  cat > /tmp/cg-poll.js << 'JSEOF'
(function(){
  if(window.__imgReady) return 'READY_' + (window.__imgB64 ? window.__imgB64.length : 0) + (window.__imgError ? '_ERR_' + window.__imgError : '');
  return 'WAITING';
})()
JSEOF

  for TRIE in $(seq 1 60); do
    sleep 0.5
    POLL=$(run_js /tmp/cg-poll.js)
    if [[ "$POLL" == READY_* ]]; then break; fi
  done

  if [[ "$POLL" != READY_* ]]; then
    echo "  TIMEOUT waiting for image $IDX"
    continue
  fi

  if [[ "$POLL" == *_ERR_* ]]; then
    echo "  ERROR: $POLL"
    continue
  fi

  B64_LEN=$(echo "$POLL" | sed 's/READY_//' | sed 's/_ERR.*//')
  echo "  Base64 length: $B64_LEN"

  # Step 3: Read base64 in chunks
  echo "[3/4] Reading $NAME in chunks..."
  B64_FILE="/tmp/cg-b64-${IDX}.txt"
  > "$B64_FILE"

  OFFSET=0
  while [ $OFFSET -lt $B64_LEN ]; do
    END=$((OFFSET + CHUNK_SIZE))
    if [ $END -gt $B64_LEN ]; then END=$B64_LEN; fi

    cat > /tmp/cg-chunk.js << JSEOF
(function(){ return window.__imgB64.substring($OFFSET, $END); })()
JSEOF

    CHUNK=$(run_js /tmp/cg-chunk.js)
    printf '%s' "$CHUNK" >> "$B64_FILE"
    OFFSET=$END
  done

  # Step 4: Decode and save
  echo "[4/4] Decoding -> $OUT_DIR/$NAME"
  python3 -c "
import base64, sys
with open('$B64_FILE', 'r') as f:
    b64 = f.read().strip()
# Fix padding
pad = 4 - (len(b64) % 4) if len(b64) % 4 != 0 else 0
b64 += '=' * pad
data = base64.b64decode(b64)
with open('$OUT_DIR/$NAME', 'wb') as f:
    f.write(data)
print(f'  Saved: {len(data)} bytes')
"
  rm -f "$B64_FILE"
done

echo ""
echo "Done. Files in $OUT_DIR:"
ls -la "$OUT_DIR/${PREFIX}"-*.png 2>/dev/null || echo "  (none)"
