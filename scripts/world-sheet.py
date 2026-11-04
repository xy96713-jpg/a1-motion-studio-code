#!/usr/bin/env python3
"""Crop one world sheet into panels and measure whether they share one world."""
import argparse,json,os,sys
from PIL import Image,ImageStat
import numpy as np

def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('--image',required=True); ap.add_argument('--rows',type=int,default=3); ap.add_argument('--cols',type=int,default=3)
 ap.add_argument('--out',required=True); ap.add_argument('--json-out',default='')
 a=ap.parse_args(); os.makedirs(a.out,exist_ok=True)
 im=Image.open(a.image).convert('RGB'); W,H=im.size
 pw,ph=W//a.cols,H//a.rows
 panels=[]; rows=[]
 for r in range(a.rows):
  for c in range(a.cols):
   box=(c*pw,r*ph,(c+1)*pw,(r+1)*ph); p=im.crop(box); name='panel-%02d.png'%(len(panels)+1); p.save(os.path.join(a.out,name))
   arr=np.asarray(p).astype(np.float32); mean=arr.reshape(-1,3).mean(axis=0)
   lum=arr.mean(axis=2); edge=float(np.abs(np.diff(lum,axis=0)).mean()+np.abs(np.diff(lum,axis=1)).mean())
   panels.append({'index':len(panels)+1,'file':name,'box':box,'mean':[round(float(x),1) for x in mean],'edge':round(edge,2),'std':round(float(lum.std()),2)})
 means=np.array([p['mean'] for p in panels]); center=means.mean(axis=0); dists=np.sqrt(((means-center)**2).sum(axis=1))
 coherence=float(dists.max()); warnings=[]
 if coherence>45: warnings.append('palette distance %.1f >45; confirm same world by design review' % coherence)
 ok=len(panels)>=6 and coherence<=120
 out={'contract':'A1WorldSheet/v1','source':a.image,'size':[W,H],'rows':a.rows,'cols':a.cols,'panels':panels,'coherenceMaxColorDistance':round(coherence,1),'warnings':warnings,'ok':ok}
 if a.json_out: open(a.json_out,'w').write(json.dumps(out,ensure_ascii=False,indent=1)+'\n')
 print(json.dumps(out,ensure_ascii=False,indent=1)); return 0 if ok else 1
if __name__=='__main__': sys.exit(main())