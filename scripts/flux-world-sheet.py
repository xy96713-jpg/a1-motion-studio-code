#!/usr/bin/env python3
"""One FLUX call -> one world sheet -> crop panels -> coherence report."""
import argparse, json, os, subprocess, sys, time
from PIL import Image
BASE='https://black-forest-labs-flux-1-schnell.hf.space'
def curl(a,t=300): return subprocess.run(['curl','-sL','--max-time',str(t)]+a,capture_output=True,text=True).stdout
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--prompt',required=True); ap.add_argument('--out',required=True); ap.add_argument('--rows',type=int,default=3); ap.add_argument('--cols',type=int,default=3); a=ap.parse_args()
 os.makedirs(a.out,exist_ok=True); sheet=os.path.join(a.out,'world-sheet.webp')
 url=None
 for attempt in range(4):
  body=json.dumps({'data':[a.prompt[:900],9100+attempt,False,1024,1024,4]}); open('/tmp/fws.json','w').write(body)
  r=curl(['-X','POST','-H','Content-Type: application/json','--data-binary','@/tmp/fws.json',BASE+'/gradio_api/call/infer'])
  try: eid=json.loads(r)['event_id']
  except: time.sleep(8); continue
  txt=curl([BASE+'/gradio_api/call/infer/'+eid],360)
  for line in txt.splitlines():
   if line.startswith('data: '):
    try:
     d=json.loads(line[6:]);
     if isinstance(d,list) and d and isinstance(d[0],dict) and d[0].get('url'): url=d[0]['url']
    except: pass
  if url: break
  time.sleep(8)
 if not url: print('WORLD SHEET FAIL: no image'); return 2
 subprocess.run(['curl','-sL','--max-time','120','-o',sheet,url],check=True)
 im=Image.open(sheet).convert('RGB'); im.save(os.path.join(a.out,'world-sheet.png'))
 panel_out=os.path.join(a.out,'panels'); meta=os.path.join(a.out,'world-sheet.json')
 rc=subprocess.run(['python3',os.path.join(os.path.dirname(__file__),'world-sheet.py'),'--image',os.path.join(a.out,'world-sheet.png'),'--rows',str(a.rows),'--cols',str(a.cols),'--out',panel_out,'--json-out',meta],capture_output=True,text=True)
 print(rc.stdout[-2000:]); print('WORLD SHEET ->',a.out); return rc.returncode
if __name__=='__main__': sys.exit(main())
