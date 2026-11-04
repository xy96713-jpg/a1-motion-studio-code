# A shot's colour cast against the film's look (user 2026-10-23: 5:38 的电脑明显是别的线生成的 — a beige CRT plate from
# the shared card library in a film of neutral greys and one red). Per frame: Lab, the accent family (reds, any
# darkness) left out, the median chroma of the rest (cast) and its b* (warm). pieces <mp4...>: one row per piece (the
# worst of three frames); ref <mp4>: the reference's spread over a frame every 2 s (cast p50/p90/p98).
import sys, subprocess, numpy as np, json
from PIL import Image
def lab(rgb):
    c=rgb/255.0; c=np.where(c>0.04045,((c+0.055)/1.055)**2.4,c/12.92)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=c@M.T/np.array([0.95047,1,1.08883])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116)
    return 116*f[...,1]-16, 500*(f[...,0]-f[...,1]), 200*(f[...,1]-f[...,2])
def frames(video, ts):
    out=[]
    for t in ts:
        r=subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',video,'-frames:v','1','-vf','scale=320:180','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True)
        if len(r.stdout)==320*180*3: out.append(np.frombuffer(r.stdout,np.uint8).reshape(180,320,3).astype(float))
    return out
def cast(fr):
    L,a,b=lab(fr); C=np.hypot(a,b); h=np.degrees(np.arctan2(b,a))%360
    accent=(C>8)&((h<60)|(h>330))   # the film's red (and any red): excluded
    m=(~accent)&(L>12)
    if m.sum()<200: return dict(L=float(L.mean()),cast=0.0,warm=0.0)
    return dict(L=float(L.mean()),cast=float(np.median(C[m])),warm=float(np.median(b[m])))
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='pieces':
        for f in sys.argv[2:]:
            d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout or 1)
            fs=frames(f,[d*0.25,d*0.5,d*0.8]); r=[cast(x) for x in fs]
            print(json.dumps({'id':f.split('/')[-1][:-4],'L':round(np.mean([x['L'] for x in r]),1),'cast':round(max(x['cast'] for x in r),1),'warm':round(max(x['warm'] for x in r),1)}))
    elif mode=='images':
        # the approved look's frames (a film with its own world: its colour is its style's, not the reference's)
        r=[cast(np.asarray(Image.open(f).convert('RGB').resize((320,180))).astype(float)) for f in sys.argv[2:]]
        C=sorted(x['cast'] for x in r)
        print(json.dumps({'n':len(r),'cast':{'50':C[len(C)//2],'90':C[int(len(C)*.9)],'98':C[-1]}}))
    else:
        v=sys.argv[2]; d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',v],capture_output=True,text=True).stdout)
        r=[cast(x) for x in frames(v,list(np.arange(1,d,2.0)))]
        C=sorted(x['cast'] for x in r); W=sorted(x['warm'] for x in r)
        print(json.dumps({'n':len(r),'cast':{'50':C[len(C)//2],'90':C[int(len(C)*.9)],'98':C[int(len(C)*.98)]},'warm':{'50':W[len(W)//2],'90':W[int(len(W)*.9)],'98':W[int(len(W)*.98)]}}))
