#!/usr/bin/env python3
"""
ChatGPT Artwork Pipeline — one command: new conversation → upload refs → send prompt → poll → download.

Usage:
  python3 chatgpt-artwork-pipeline.py --prompt /path/to/prompt.txt --outdir /path/to/output [--prefix v7] [--refs ref1.png ref2.png ref3.png]

Requires: macOS, Google Chrome with AppleScript JS enabled, python3.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time

# ── Config ──────────────────────────────────────────────────────────────
CHATGPT_NEW_URL = "https://chatgpt.com/?no_universal_links=1"
POLL_INTERVAL = 15       # seconds between generation polls
POLL_TIMEOUT = 600       # max seconds to wait for generation
DOWNLOAD_CHUNK = 40000   # base64 chars per AppleScript read

# ── Helpers ─────────────────────────────────────────────────────────────

def run_osascript(script: str, timeout: int = 30) -> str:
    """Run an AppleScript string, return stdout."""
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip()


def run_osascript_file(path: str, timeout: int = 30) -> str:
    """Run an AppleScript file, return stdout."""
    r = subprocess.run(["osascript", path], capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip()


def chrome_js(js_code: str, url_match: str, timeout: int = 30) -> str:
    """Execute JS in the Chrome tab matching url_match. Returns result string."""
    # Write JS to temp file to avoid AppleScript escaping hell
    js_path = "/tmp/_cg_pipe_js.js"
    with open(js_path, "w") as f:
        f.write(js_code)

    scpt = f'''tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "{url_match}" then
        set jsCode to read POSIX file "{js_path}"
        return execute t javascript jsCode
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell'''
    scpt_path = "/tmp/_cg_pipe.scpt"
    with open(scpt_path, "w") as f:
        f.write(scpt)
    return run_osascript_file(scpt_path, timeout)


def find_chatgpt_tab(exclude_ids: list[str] | None = None) -> str | None:
    """Find a ChatGPT tab URL, optionally excluding known conversation IDs."""
    scpt = '''tell application "Google Chrome"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "chatgpt.com" then
        set out to out & (URL of t) & linefeed
      end if
    end repeat
  end repeat
  return out
end tell'''
    urls = run_osascript(scpt).split("\n")
    for u in urls:
        u = u.strip()
        if not u or "chatgpt.com" not in u:
            continue
        if exclude_ids and any(eid in u for eid in exclude_ids):
            continue
        return u
    return None


# ── Pipeline Steps ──────────────────────────────────────────────────────

def step_open_new_conversation() -> str:
    """Open a fresh ChatGPT conversation, return the conversation ID."""
    print("[1/5] Opening new ChatGPT conversation...")
    run_osascript(f'''tell application "Google Chrome"
  tell front window
    set URL of active tab to "{CHATGPT_NEW_URL}"
  end tell
end tell''')

    # Wait for page load
    for _ in range(20):
        time.sleep(1)
        result = chrome_js(
            'document.querySelector("[contenteditable]") ? "READY" : "NOT_READY"',
            "chatgpt.com"
        )
        if result == "READY":
            break
    else:
        print("  ERROR: ChatGPT page did not load")
        sys.exit(1)

    # Send "hi" to create a conversation
    js = """(function(){
  var el = document.querySelector('[contenteditable="true"]');
  if(!el) return 'NO_EL';
  el.focus();
  el.innerText = 'hi';
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
  setTimeout(function(){
    var btn = document.querySelector('[data-testid="send-button"]');
    if(!btn){
      var allBtns = document.querySelectorAll('button');
      for(var i=0;i<allBtns.length;i++){
        var al = allBtns[i].getAttribute('aria-label') || '';
        if((al.indexOf('Send') !== -1 || al.indexOf('发送') !== -1) || (allBtns[i].innerText||'').trim()==='发送'){ btn = allBtns[i]; break; }
      }
    }
    if(btn && !btn.disabled) btn.click();
  }, 600);
  return 'SENT_HI';
})()"""
    result = chrome_js(js, "chatgpt.com")
    print(f"  Sent hi: {result}")

    # Wait for conversation URL to appear
    for _ in range(30):
        time.sleep(2)
        url = find_chatgpt_tab()
        if url and "/c/" in url:
            conv_id = url.split("/c/")[-1].split("?")[0]
            print(f"  Conversation: {conv_id}")
            return conv_id

    print("  ERROR: No conversation created")
    sys.exit(1)


def step_upload_references(conv_id: str, ref_paths: list[str]):
    """Upload reference images to the conversation."""
    if not ref_paths:
        print("[2/5] No reference images to upload, skipping.")
        return

    print(f"[2/5] Uploading {len(ref_paths)} reference images...")
    for path in ref_paths:
        fname = os.path.basename(path)
        label = os.path.splitext(fname)[0]
        size = os.path.getsize(path)

        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        b64_file = f"/tmp/_cg_ref_{label}.b64"
        with open(b64_file, "w") as f:
            f.write(b64)

        js = f"""(function(){{
  var b64 = '';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'file://{b64_file}', false);
  try {{ xhr.send(); }} catch(e) {{}}
  if(xhr.responseText) b64 = xhr.responseText.trim();
  if(!b64) return 'NO_B64';
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for(var i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  var blob = new Blob([bytes], {{type: 'image/png'}});
  var file = new File([blob], '{fname}', {{type: 'image/png'}});
  var dt = new DataTransfer();
  dt.items.add(file);
  var input = document.querySelector('input[type=file]') || document.querySelector('#upload-photos');
  if(!input) return 'NO_INPUT';
  input.files = dt.files;
  input.dispatchEvent(new Event('change', {{bubbles: true}}));
  return 'UPLOADED_{label}';
}})()"""
        # file:// won't work in Chrome — use AppleScript to inject b64 directly
        scpt = f'''tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "{conv_id}" then
        set b64Data to read POSIX file "{b64_file}"
        set jsCode to "(function(){{
          var b64 = '" & b64Data & "';
          var binary = atob(b64);
          var bytes = new Uint8Array(binary.length);
          for(var i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
          var blob = new Blob([bytes], {{type: 'image/png'}});
          var file = new File([blob], '{fname}', {{type: 'image/png'}});
          var dt = new DataTransfer();
          dt.items.add(file);
          var input = document.querySelector('input[type=file]') || document.querySelector('#upload-photos');
          if(!input) return 'NO_INPUT';
          input.files = dt.files;
          input.dispatchEvent(new Event('change', {{bubbles: true}}));
          return 'UPLOADED_{label}';
        }})()"
        return execute t javascript jsCode
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell'''
        scpt_path = f"/tmp/_cg_upload_{label}.scpt"
        with open(scpt_path, "w") as f:
            f.write(scpt)

        result = run_osascript_file(scpt_path, timeout=30)
        print(f"  {fname} ({size} bytes): {result}")
        time.sleep(1)  # let ChatGPT process the upload


def step_send_prompt(conv_id: str, prompt_text: str):
    """Send the generation prompt through the current ProseMirror composer; Enter submits."""
    print("[3/5] Sending prompt...")
    js_str = json.dumps(prompt_text, ensure_ascii=False)
    js = f"""(function(){{
  var text = {js_str};
  var el = document.querySelector('[contenteditable="true"]');
  if(!el) return 'NO_EL';
  el.focus();
  el.innerText = text;
  el.dispatchEvent(new InputEvent('input', {{bubbles: true, inputType: 'insertText', data: text}}));
  el.dispatchEvent(new Event('change', {{bubbles: true}}));
  var ev = new KeyboardEvent('keydown', {{key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true}});
  el.dispatchEvent(ev);
  return 'SENT_' + (el.innerText || '').length;
}})()"""
    result = chrome_js(js, conv_id)
    print(f"  Send: {result}")
    if "NO_EL" in result:
        print("  ERROR: composer missing")
        sys.exit(1)


def step_poll_generation(conv_id: str) -> int:
    """Poll until generation completes. Returns number of square images."""
    print("[4/5] Waiting for generation...")
    start = time.time()
    last_count = 0

    while time.time() - start < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        js = """(function(){
  var imgs = document.querySelectorAll('img');
  var sq = 0;
  for(var i=0;i<imgs.length;i++){
    if(imgs[i].naturalWidth > 1000 && imgs[i].naturalWidth === imgs[i].naturalHeight && imgs[i].src.indexOf('estuary') !== -1) sq++;
  }
  var gen = document.querySelector('[data-testid="stop-button"]');
  return sq + '|' + (gen ? 'yes' : 'no');
})()"""
        result = chrome_js(js, conv_id)
        parts = result.split("|")
        count = int(parts[0]) if parts[0].isdigit() else 0
        generating = parts[1] if len(parts) > 1 else "no"

        elapsed = int(time.time() - start)
        if count != last_count:
            print(f"  [{elapsed}s] {count} images, generating: {generating}")
            last_count = count

        if generating == "no" and count > 0:
            # Wait a bit more to make sure it's really done
            time.sleep(5)
            result2 = chrome_js(js, conv_id)
            parts2 = result2.split("|")
            count2 = int(parts2[0]) if parts2[0].isdigit() else 0
            gen2 = parts2[1] if len(parts2) > 1 else "no"
            if gen2 == "no":
                print(f"  Generation complete: {count2} images")
                return count2

    print(f"  TIMEOUT after {POLL_TIMEOUT}s, last count: {last_count}")
    return last_count


def step_download(conv_id: str, outdir: str, prefix: str) -> list[str]:
    """Download all generated square images. Returns list of saved file paths."""
    print(f"[5/5] Downloading images to {outdir}...")
    os.makedirs(outdir, exist_ok=True)

    # Discover image URLs
    js_discover = """(function(){
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
  return 'FOUND_' + urls.length;
})()"""
    result = chrome_js(js_discover, conv_id)
    print(f"  {result}")
    count = int(result.split("_")[1]) if "_" in result else 0
    if count == 0:
        print("  No images to download.")
        return []

    saved = []
    for idx in range(count):
        name = f"{prefix}-shot-{idx:02d}.png"
        print(f"  Fetching {idx}/{count} -> {name} ...")

        # Async fetch -> base64 -> window variable
        js_fetch = f"""(function(){{
  window.__imgB64 = null;
  window.__imgReady = false;
  window.__imgError = null;
  var url = window.__imgUrls[{idx}];
  if(!url){{ window.__imgError = 'NO_URL'; window.__imgReady = true; return 'NO_URL'; }}
  fetch(url).then(function(r){{
    if(!r.ok) throw new Error('HTTP_' + r.status);
    return r.arrayBuffer();
  }}).then(function(buf){{
    var arr = new Uint8Array(buf);
    var b64 = '';
    var chunk = 8192;
    for(var i=0;i<arr.length;i+=chunk){{
      b64 += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i+chunk, arr.length)));
    }}
    window.__imgB64 = btoa(b64);
    window.__imgReady = true;
  }}).catch(function(e){{
    window.__imgError = e.message;
    window.__imgReady = true;
  }});
  return 'FETCHING';
}})()"""
        chrome_js(js_fetch, conv_id)

        # Poll until ready
        js_poll = """(function(){
  if(window.__imgReady) return 'READY_' + (window.__imgB64 ? window.__imgB64.length : 0) + (window.__imgError ? '_ERR_' + window.__imgError : '');
  return 'WAITING';
})()"""
        b64_len = 0
        for _ in range(120):
            time.sleep(0.5)
            poll = chrome_js(js_poll, conv_id)
            if poll.startswith("READY_"):
                b64_len = int(poll.split("_")[1].split("_ERR")[0])
                if "_ERR_" in poll:
                    print(f"    ERROR: {poll}")
                break
        else:
            print(f"    TIMEOUT fetching image {idx}")
            continue

        if b64_len == 0:
            continue

        # Read base64 in chunks
        b64_file = f"/tmp/_cg_b64_{idx}.txt"
        with open(b64_file, "w") as f:
            pass  # truncate

        offset = 0
        while offset < b64_len:
            end = min(offset + DOWNLOAD_CHUNK, b64_len)
            js_chunk = f"(function(){{ return window.__imgB64.substring({offset}, {end}); }})()"
            chunk = chrome_js(js_chunk, conv_id)
            with open(b64_file, "a") as f:
                f.write(chunk)
            offset = end

        # Decode and save
        out_path = os.path.join(outdir, name)
        with open(b64_file, "r") as f:
            b64 = f.read().strip()
        pad = 4 - (len(b64) % 4) if len(b64) % 4 != 0 else 0
        b64 += "=" * pad
        data = base64.b64decode(b64)
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"    Saved: {len(data)} bytes -> {out_path}")
        saved.append(out_path)
        os.remove(b64_file)

    return saved


# ── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ChatGPT Artwork Pipeline")
    parser.add_argument("--prompt", required=True, help="Path to prompt text file")
    parser.add_argument("--outdir", required=True, help="Output directory for images")
    parser.add_argument("--prefix", default="v7", help="Filename prefix (default: v7)")
    parser.add_argument("--refs", nargs="*", default=[], help="Reference image paths to upload")
    parser.add_argument("--conv-id", default=None, help="Reuse existing conversation ID (skip new conv)")
    args = parser.parse_args()

    # Read prompt
    with open(args.prompt, "r") as f:
        prompt_text = f.read()
    print(f"Prompt: {len(prompt_text)} chars from {args.prompt}")

    # Step 1: Open conversation (or reuse)
    if args.conv_id:
        conv_id = args.conv_id
        print(f"[1/5] Reusing conversation: {conv_id}")
    else:
        conv_id = step_open_new_conversation()

    # Step 2: Upload references
    step_upload_references(conv_id, args.refs)

    # Step 3: Send prompt
    step_send_prompt(conv_id, prompt_text)

    # Step 4: Poll for generation
    count = step_poll_generation(conv_id)
    if count == 0:
        print("ERROR: No images generated.")
        sys.exit(1)

    # Step 5: Download
    saved = step_download(conv_id, args.outdir, args.prefix)
    print(f"\nDone. {len(saved)} images saved to {args.outdir}")
    print(f"Conversation ID: {conv_id}")
    for p in saved:
        print(f"  {p}")


if __name__ == "__main__":
    main()
