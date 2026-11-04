#!/bin/bash
# chatgpt-imagegen-fixed.sh — generate/download one image from a ChatGPT project conversation.
# Usage: ./chatgpt-imagegen-fixed.sh <prompt_file> <output.png> [conversation_url]
# Fixed 2026-11-04: contenteditable composer, Enter submit, blob/estuary images, wide 16:9 accepted.
set -euo pipefail
PROMPT_FILE="${1:?prompt file}"; OUTPUT="${2:?output png}"; CONV_URL="${3:-}"
PROMPT=$(cat "$PROMPT_FILE"); TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

run_js() {
  cat > "$TMP/js.js" <<JSEOF
$1
JSEOF
  cat > "$TMP/run.scpt" <<SCPT
tell application "Google Chrome"
 tell front window
  set jsCode to read POSIX file "$TMP/js.js"
  return execute active tab javascript jsCode
 end tell
end tell
SCPT
  osascript "$TMP/run.scpt" 2>/dev/null || true
}

if [ -n "$CONV_URL" ]; then
  osascript -e "tell application \"Google Chrome\" to tell front window to set URL of active tab to \"$CONV_URL\""
  sleep 3
fi

# wait composer
for i in $(seq 1 20); do
  R=$(run_js 'document.querySelector("[contenteditable]")?"READY":"WAIT"')
  [ "$R" = "READY" ] && break
  sleep 2
done
[ "$R" = "READY" ] || { echo "ERROR: composer not ready"; exit 1; }

# count images before
BEFORE=$(run_js '(function(){return [...document.querySelectorAll("img")].filter(function(i){return i.naturalWidth>1000&&(i.src.indexOf("blob:")===0||i.src.indexOf("estuary")>=0)}).length})()')
echo "images before: $BEFORE"

# set prompt
python3 - "$PROMPT" > "$TMP/set.js" <<'PY'
import json,sys
p=sys.argv[1]
print("(function(){var e=document.querySelector('[contenteditable]');if(!e)return 'NO_EL';e.focus();e.innerText="+json.dumps(p)+";e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:"+json.dumps(p)+"}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'SET_'+((e.innerText||'').length)})()")
PY
R=$(run_js "$(cat "$TMP/set.js")")
echo "set: $R"; [[ "$R" == SET_* ]] || exit 1
sleep 1
# submit via Enter (fixed; button selectors drift)
run_js '(function(){var e=document.querySelector("[contenteditable]");if(!e)return "NO";e.focus();e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}));e.dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}));return "ENTER"})()'

# poll for new image + no generator
for i in $(seq 1 100); do
  sleep 3
  R=$(run_js '(function(){var a=[...document.querySelectorAll("img")].filter(function(i){return i.naturalWidth>1000&&(i.src.indexOf("blob:")===0||i.src.indexOf("estuary")>=0)});var stop=document.querySelector("[data-testid=\"stop-button\"]");return a.length+"|"+(stop?"yes":"no")})()')
  echo "poll $i: $R"
  N="${R%%|*}"; G="${R#*|}"
  if [ "${N:-0}" -gt "${BEFORE:-0}" ] 2>/dev/null && [ "$G" = "no" ]; then sleep 3; break; fi
done
[ "${N:-0}" -gt "${BEFORE:-0}" ] || { echo "ERROR: no new image"; exit 1; }

# download latest image via canvas
run_js '(function(){var a=[...document.querySelectorAll("img")].filter(function(i){return i.naturalWidth>1000&&(i.src.indexOf("blob:")===0||i.src.indexOf("estuary")>=0)});var img=a[a.length-1];if(!img)return "NO";var c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d").drawImage(img,0,0);window.__b64=c.toDataURL("image/png").split(",")[1];return "B64_"+window.__b64.length})()'
LEN=$(run_js '(function(){return window.__b64?window.__b64.length:0})()')
echo "b64 length: $LEN"; [ "${LEN:-0}" -gt 0 ] || exit 1
> "$TMP/b64.txt"; OFF=0
while [ $OFF -lt "$LEN" ]; do END=$((OFF+40000)); [ $END -gt "$LEN" ] && END=$LEN; run_js "(function(){return window.__b64.substring($OFF,$END)})()" >> "$TMP/b64.txt"; OFF=$END; done
python3 - "$TMP/b64.txt" "$OUTPUT" <<'PY'
import base64,sys
b=open(sys.argv[1]).read().strip(); b+="="*((4-len(b)%4)%4); open(sys.argv[2],"wb").write(base64.b64decode(b))
print("saved",sys.argv[2])
PY
