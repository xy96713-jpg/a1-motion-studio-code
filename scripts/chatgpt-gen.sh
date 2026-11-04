#!/bin/bash
# chatgpt-gen.sh — Generate one image via ChatGPT web (AppleScript + Chrome)
# Usage: ./chatgpt-gen.sh <prompt_file> <output.png> [conversation_url]
#
# Proven flow (2026-07-25):
#   1. Close extra ChatGPT tabs (keep only one)
#   2. Navigate to conversation URL (or new chat)
#   3. Wait for #prompt-textarea
#   4. Set prompt via innerText + input event (React-compatible)
#   5. Wait for send button to enable, then click it
#   6. Poll active tab for stop-button disappearance + square images
#   7. Download via canvas.toDataURL (sync, no async fetch)
#   8. Decode base64 → PNG
#
# Pitfalls avoided:
#   - NEVER use System Events keystroke (needs accessibility permission)
#   - NEVER use KeyboardEvent dispatch for Enter (React ignores it)
#   - NEVER use async fetch in AppleScript execute (Promise not supported)
#   - NEVER use "result" as AppleScript variable (reserved word)
#   - NEVER scan all tabs — only operate on active tab
#   - ALWAYS close extra ChatGPT tabs first (polling matches wrong tab otherwise)
#   - ALWAYS wait for send button enabled before clicking (React needs time)

set -euo pipefail

PROMPT_FILE="${1:?Usage: chatgpt-gen.sh <prompt_file> <output.png> [conv_url]}"
OUTPUT="${2:?Usage: chatgpt-gen.sh <prompt_file> <output.png> [conv_url]}"
CONV_URL="${3:-}"

PROMPT=$(cat "$PROMPT_FILE")
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== chatgpt-gen: $(basename "$PROMPT_FILE") → $(basename "$OUTPUT") ==="

# --- Step 0: Close extra ChatGPT tabs, keep only one ---
osascript -e 'tell application "Google Chrome"
  set kept to false
  repeat with w in windows
    set tabList to tabs of w
    repeat with i from (count of tabList) to 1 by -1
      set t to item i of tabList
      if URL of t contains "chatgpt.com" then
        if kept then
          close t
        else
          set kept to true
        end if
      end if
    end repeat
  end repeat
  return "TABS_CLEANED kept=" & kept
end tell'
echo "Step 0: extra tabs closed"

# --- Step 1: Navigate ---
if [ -n "$CONV_URL" ]; then
  osascript -e "tell application \"Google Chrome\"
    tell front window
      set URL of active tab to \"$CONV_URL\"
    end tell
  end tell"
else
  osascript -e 'tell application "Google Chrome"
    tell front window
      set URL of active tab to "https://chatgpt.com/?no_universal_links=1"
    end tell
  end tell'
fi

# Wait for textarea (up to 40s)
for i in $(seq 1 20); do
  ready=$(osascript -e 'tell application "Google Chrome"
    tell front window
      return execute active tab javascript "document.querySelector(\"#prompt-textarea\") ? \"READY\" : \"WAIT\""
    end tell
  end tell' 2>/dev/null || echo "ERR")
  [ "$ready" = "READY" ] && break
  sleep 2
done
[ "$ready" = "READY" ] || { echo "ERROR: textarea not ready after 40s"; exit 1; }
echo "Step 1: page ready"

# --- Step 2: Set prompt (React-compatible: innerText + input event) ---
python3 -c "
import json, sys
prompt = sys.argv[1]
js = '''(function(){
  var el = document.querySelector('#prompt-textarea');
  if(!el) return 'NO_EL';
  el.focus();
  el.innerText = '';
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.innerText = ''' + json.dumps(prompt) + ''';
  el.dispatchEvent(new Event('input', {bubbles: true}));
  return 'SET_' + (el.innerText || '').length;
})()'''
with open(sys.argv[2], 'w') as f:
    f.write(js)
" "$PROMPT" "$TMPDIR/set.js"

set_result=$(osascript -e "tell application \"Google Chrome\"
  tell front window
    set jsCode to read POSIX file \"$TMPDIR/set.js\"
    return execute active tab javascript jsCode
  end tell
end tell")
echo "Step 2: $set_result"
[[ "$set_result" == SET_* ]] || { echo "ERROR: failed to set prompt"; exit 1; }

# --- Step 3: Wait for send button, then click ---
# React needs a moment to process the input and enable the button
for i in $(seq 1 10); do
  btn_state=$(osascript -e 'tell application "Google Chrome"
    tell front window
      return execute active tab javascript "(function(){ var b = document.querySelector(\"[data-testid=send-button]\"); if(!b) return \"NO_BTN\"; return b.disabled ? \"DISABLED\" : \"ENABLED\"; })()"
    end tell
  end tell' 2>/dev/null || echo "ERR")
  [ "$btn_state" = "ENABLED" ] && break
  sleep 1
done

if [ "$btn_state" = "ENABLED" ]; then
  click_result=$(osascript -e 'tell application "Google Chrome"
    tell front window
      return execute active tab javascript "(function(){ var b = document.querySelector(\"[data-testid=send-button]\"); if(!b) return \"NO_BTN\"; b.click(); return \"CLICKED\"; })()"
    end tell
  end tell')
  echo "Step 3: $click_result"
else
  echo "ERROR: send button not enabled after 10s (state=$btn_state)"
  exit 1
fi

sleep 3

# --- Step 4: Poll for generation complete ---
cat > "$TMPDIR/poll.js" << 'JSEOF'
(function(){
  var imgs = document.querySelectorAll('img');
  var sq = 0;
  for(var i=0;i<imgs.length;i++){
    if(imgs[i].naturalWidth > 1000 && imgs[i].naturalWidth === imgs[i].naturalHeight && imgs[i].src.indexOf('estuary') !== -1) sq++;
  }
  var gen = document.querySelector('[data-testid="stop-button"]');
  return 'IMAGES:' + sq + ' GENERATING:' + (gen ? 'yes' : 'no');
})()
JSEOF

echo "Step 4: polling..."
for i in $(seq 1 40); do
  poll_result=$(osascript -e "tell application \"Google Chrome\"
    tell front window
      set jsCode to read POSIX file \"$TMPDIR/poll.js\"
      return execute active tab javascript jsCode
    end tell
  end tell" 2>/dev/null || echo "POLL_ERR")
  gen=$(echo "$poll_result" | grep -o 'GENERATING:[a-z]*' | cut -d: -f2)
  imgs=$(echo "$poll_result" | grep -o 'IMAGES:[0-9]*' | cut -d: -f2)
  echo "  [${i}] imgs=${imgs:-0} gen=${gen:-?}"
  if [ "$gen" = "no" ] && [ "${imgs:-0}" -gt 0 ] 2>/dev/null; then
    sleep 5
    poll2=$(osascript -e "tell application \"Google Chrome\"
      tell front window
        set jsCode to read POSIX file \"$TMPDIR/poll.js\"
        return execute active tab javascript jsCode
      end tell
    end tell" 2>/dev/null || echo "POLL_ERR")
    gen2=$(echo "$poll2" | grep -o 'GENERATING:[a-z]*' | cut -d: -f2)
    imgs2=$(echo "$poll2" | grep -o 'IMAGES:[0-9]*' | cut -d: -f2)
    if [ "$gen2" = "no" ] && [ "${imgs2:-0}" -gt 0 ] 2>/dev/null; then
      echo "  Generation complete: $imgs2 images"
      break
    fi
  fi
  sleep 10
done

# --- Step 5: Download via canvas (sync, no async) ---
cat > "$TMPDIR/canvas.js" << 'JSEOF'
(function(){
  var imgs = document.querySelectorAll('img');
  for(var i=0;i<imgs.length;i++){
    if(imgs[i].naturalWidth > 1000 && imgs[i].naturalWidth === imgs[i].naturalHeight && imgs[i].src.indexOf('estuary') !== -1){
      var c = document.createElement('canvas');
      c.width = imgs[i].naturalWidth;
      c.height = imgs[i].naturalHeight;
      c.getContext('2d').drawImage(imgs[i], 0, 0);
      return c.toDataURL('image/png');
    }
  }
  return 'NO_IMAGE';
})()
JSEOF

osascript -e "tell application \"Google Chrome\"
  tell front window
    set jsCode to read POSIX file \"$TMPDIR/canvas.js\"
    set jsResult to execute active tab javascript jsCode
    set filePath to POSIX file \"$TMPDIR/img_b64.txt\"
    set fileRef to open for access filePath with write permission
    set eof fileRef to 0
    write jsResult to fileRef
    close access fileRef
    return \"WRITTEN\"
  end tell
end tell"

# --- Step 6: Decode and save ---
python3 -c "
import base64, sys
with open(sys.argv[1]) as f:
    data = f.read().strip()
if data.startswith('data:'):
    b64 = data.split(',', 1)[1]
    raw = base64.b64decode(b64)
    with open(sys.argv[2], 'wb') as f:
        f.write(raw)
    print(f'Step 6: SAVED {len(raw)} bytes -> {sys.argv[2]}')
else:
    print('ERROR: ' + data[:80])
    sys.exit(1)
" "$TMPDIR/img_b64.txt" "$OUTPUT"

echo "=== DONE ==="
