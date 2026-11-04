#!/usr/bin/env python3
"""Generate six design options with the public HF FLUX.1-schnell Space.
No token. Uses curl because this Python's SSL stack has an EOF bug with the Space.
"""
import argparse, json, os, subprocess, sys, time
from PIL import Image

BASE = 'https://black-forest-labs-flux-1-schnell.hf.space'

def curl(args, timeout=180):
    r = subprocess.run(['curl', '-sL', '--max-time', str(timeout)] + args, capture_output=True, text=True)
    return r.stdout

def post(prompt, seed, width, height, steps):
    body = json.dumps({'data': [prompt[:900], seed, False, width, height, steps]})
    open('/tmp/flux-req.json', 'w').write(body)
    txt = curl(['-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '@/tmp/flux-req.json', BASE + '/gradio_api/call/infer'])
    try: return json.loads(txt)['event_id']
    except Exception: return None

def get(eid):
    return curl([BASE + '/gradio_api/call/infer/' + eid], timeout=240)

def parse(txt):
    for line in txt.splitlines():
        if line.startswith('data: '):
            try:
                d = json.loads(line[6:])
                if isinstance(d, list) and d and isinstance(d[0], dict) and d[0].get('url'):
                    return d[0]['url']
            except Exception: pass
    return None

def tasks_from(options_file, prompts_dir):
    out = []
    if options_file and os.path.exists(options_file):
        o = json.load(open(options_file))
        for item in o.get('options', []):
            out.append({'id': item.get('id', 'OPT-' + str(len(out) + 1)), 'prompt': item.get('prompt', '')})
    if prompts_dir and os.path.isdir(prompts_dir):
        for f in sorted(os.listdir(prompts_dir)):
            if f.endswith('.txt'):
                out.append({'id': 'OPT-' + str(len(out) + 1), 'prompt': open(os.path.join(prompts_dir, f)).read().strip()})
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--options', help='design-options.json')
    ap.add_argument('--prompts', help='directory of opt-*.txt')
    ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1024)
    ap.add_argument('--height', type=int, default=576)
    ap.add_argument('--steps', type=int, default=4)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    tasks = tasks_from(a.options, a.prompts)
    if len(tasks) < 6:
        print('FLUX OPTIONS FAIL: need at least 6 prompts, got', len(tasks)); return 1
    if a.dry_run:
        print('FLUX OPTIONS DRY: ' + str(len(tasks)) + ' tasks -> ' + a.out)
        return 0
    os.makedirs(a.out, exist_ok=True)
    imgs = []
    for i, t in enumerate(tasks[:6]):
        url = None
        for attempt in range(4):
            eid = post(t['prompt'], 1000 + i * 17 + attempt, a.width, a.height, a.steps)
            if not eid:
                time.sleep(6); continue
            txt = get(eid); url = parse(txt)
            if url: break
            time.sleep(8)
        if not url:
            print('FAIL', t['id']); return 2
        raw = os.path.join(a.out, 'raw-%d.webp' % (i + 1))
        subprocess.run(['curl', '-sL', '--max-time', '90', '-o', raw, url], check=True)
        im = Image.open(raw).convert('RGB').resize((1920, 1080), Image.LANCZOS)
        im.save(os.path.join(a.out, 'opt-%d.png' % (i + 1)))
        imgs.append(im)
        print('OK', i + 1, t['id'])
    sheet = Image.new('RGB', (2880, 1080), (0, 0, 0))
    for i, im in enumerate(imgs):
        sheet.paste(im.resize((960, 540), Image.LANCZOS), ((i % 3) * 960, (i // 3) * 540))
    sheet.save(os.path.join(a.out, 'sheet.png'))
    print('FLUX OPTIONS OK ->', a.out)
    return 0

if __name__ == '__main__':
    sys.exit(main())
