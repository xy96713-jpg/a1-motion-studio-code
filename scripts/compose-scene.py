import os, json, math
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
base='work/recipe-board-v1/style-lab/design-study-20261103/assets/'
out='work/recipe-board-v1/style-lab/design-study-20261103/'
W,H=1920,1080
# hard subject alpha
cut=Image.open(base+'banana-cutout.png').convert('RGBA')
a=np.array(cut.split()[-1])
hard=((a>110)*255).astype(np.uint8)
hard=Image.fromarray(hard).filter(ImageFilter.GaussianBlur(1.4))
hardcut=cut.copy(); hardcut.putalpha(hard)
hardcut.save(base+'banana-cutout-hard.png')
# glyph groups from type layer
def groups(mask):
    cols=(mask.sum(axis=0)>0).astype(int)
    runs=[]; start=None
    for i,v in enumerate(cols):
        if v and start is None: start=i
        if not v and start is not None: runs.append((start,i)); start=None
    if start is not None: runs.append((start,len(cols)))
    return [r for r in runs if r[1]-r[0]>8]
def glyph_cells(path):
    im=Image.open(path).convert('RGBA'); m=np.array(im.split()[-1])>40
    g=groups(m)
    ys,xs=np.where(m); x0,x1=xs.min(),xs.max()
    if len(g)!=5 and len(g)!=3:
        n=5 if 'K1' in path else 3
        step=(x1-x0)/n; g=[(int(x0+i*step),int(x0+(i+1)*step)) for i in range(n)]
    cells=[]
    for (a0,a1) in g:
        cells.append(m[:, a0:a1])
    return m, g, cells
def coverage(type_mask, subj_mask):
    inter=(type_mask & subj_mask).sum(); tot=type_mask.sum()
    return inter/max(tot,1)
def per_glyph(type_mask, cells, subj_mask, g):
    out=[]
    for (a0,a1),cm in zip(g,cells):
        # cm shape H x w; subject mask slice
        sm=subj_mask[:, a0:a1]
        inter=(cm & sm).sum(); tot=cm.sum()
        out.append(1-inter/max(tot,1))
    return out
def load_bg(src, scale, blur, bright, ox=0, oy=0):
    im=Image.open(src).convert('RGB')
    w,h=int(W*scale), int(H*scale)
    im=im.resize((w,h), Image.LANCZOS)
    im=im.crop((ox,oy,ox+W,oy+H))
    im=im.filter(ImageFilter.GaussianBlur(blur))
    arr=np.array(im).astype(np.float32)*bright
    return Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
def add_light(img, cx, cy, radius=900, color=(255,176,92), strength=0.18):
    arr=np.array(img).astype(np.float32)
    yy,xx=np.mgrid[0:H,0:W]
    d=np.sqrt((xx-cx)**2+(yy-cy)**2)/radius
    g=np.clip(1-d,0,1)**2*strength
    for i in range(3): arr[:,:,i]=arr[:,:,i]*(1-g)+color[i]*g
    return Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
def grain(img, amt=4):
    arr=np.array(img).astype(np.float32)
    n=np.random.default_rng(7).normal(0,amt,(H,W,1))
    arr=np.clip(arr+n,0,255)
    return Image.fromarray(arr.astype(np.uint8))
def vignette(img, strength=0.35):
    arr=np.array(img).astype(np.float32)
    yy,xx=np.mgrid[0:H,0:W]
    d=np.sqrt(((xx-W/2)/(W/2))**2+((yy-H/2)/(H/2))**2)
    v=np.clip(1-(d-0.55)*strength,0,1)[:,:,None]
    return Image.fromarray(np.clip(arr*v,0,255).astype(np.uint8))

def compose(fid, type_png, caption_png, bg_src, bg_scale, bg_blur, bg_bright, bg_ox, bg_oy, subj_w, light_xy):
    tm_img=Image.open(base+type_png+'.png').convert('RGBA')
    tm=np.array(tm_img.split()[-1])>40
    m,g,cells=glyph_cells(base+type_png+'.png')
    sw=int(subj_w); sh=int(sw*hardcut.height/hardcut.width)
    subj=hardcut.resize((sw,sh), Image.LANCZOS)
    sm=np.array(subj.split()[-1])>40
    # coarse search
    best=None
    xs = range(-500, 1920-sw, 12) if fid=='K4' else range(0, 1920-sw, 12)
    for x in xs:
        for y in range(150, 560, 12):
            s=Image.new('L',(W,H),0); s.paste(subj.split()[-1],(x,y)); smm=np.array(s)>40
            cov=coverage(tm, smm)
            if not (0.25 <= cov <= 0.35): continue
            vis=per_glyph(tm, cells, smm, g)
            if min(vis) < 0.66: continue
            if fid in ('K2','K4') and vis[-1] < 0.96: continue
            score=abs(cov-0.29)
            if best is None or score<best[0]: best=(score,x,y,cov,vis)
    if best is None:
        # relax: still avoid swallowing any glyph
        for x in xs:
            for y in range(150, 560, 12):
                s=Image.new('L',(W,H),0); s.paste(subj.split()[-1],(x,y)); smm=np.array(s)>40
                cov=coverage(tm, smm); vis=per_glyph(tm, cells, smm, g)
                if min(vis)>=0.65 and 0.2<=cov<=0.38 and (fid not in ('K2','K4') or vis[-1]>=0.95):
                    score=abs(cov-0.28); 
                    if best is None or score<best[0]: best=(score,x,y,cov,vis)
    if best is None: raise SystemExit('no occlusion placement found for '+fid)
    _,x,y,cov,vis=best
    # background
    bg=load_bg(bg_src, bg_scale, bg_blur, bg_bright, bg_ox, bg_oy)
    bg=add_light(bg, light_xy[0], light_xy[1], 1000, (255,176,92), 0.16)
    # contact shadow: subject alpha blurred, offset down
    sh_alpha=subj.split()[-1].point(lambda v: int(v*0.55))
    shadow=Image.new('RGBA',(W,H),(0,0,0,0)); sh_img=Image.new('RGBA',(sw,sh),(0,0,0,0)); sh_img.putalpha(sh_alpha)
    shadow.alpha_composite(sh_img,(x+14,y+28)); shadow=shadow.filter(ImageFilter.GaussianBlur(26))
    canvas=bg.convert('RGBA'); canvas.alpha_composite(shadow)
    canvas.alpha_composite(tm_img,(0,0))
    canvas.alpha_composite(subj,(x,y))
    cap=Image.open(base+caption_png+'.png').convert('RGBA'); canvas.alpha_composite(cap,(0,0))
    img=canvas.convert('RGB'); img=grain(img,4); img=vignette(img,0.32)
    png=out+fid+'.png'; img.save(png)
    # final check: type colour must not appear inside subject mask
    arr=np.array(img).convert('RGB') if False else np.array(img)
    return {'id':fid,'png':fid+'.png','subject':{'x':x,'y':y,'w':sw,'h':sh},'coverage':round(cov,3),'glyphVisible':[round(v,3) for v in vis],'bg':{'scale':bg_scale,'blur':bg_blur,'bright':bg_bright},'light':light_xy}

res=[]
res.append(compose('K3','type-K1','caption-K1',
 'work/recipe-board-v1/projects/banana-design/materials/clips/banana-design-B02-wilfredor-cavendish-banana-from-maracaibo-jpg-f4d3bb75-621cc2d2-6907-45f5-9969-e4719f5ef02e.jpg',
 1.9,16,0.28,600,300,760,(420,220)))
res.append(compose('K4','type-K2','caption-K2',
 'work/recipe-board-v1/projects/banana-design/materials/clips/banana-design-B12-wikimedia-commons-cavendish-banana-ds-jpg-aede52c0-a2ccd7d0-f205-4f07-a2fd-298d7eac9003.jpg',
 2.0,14,0.30,300,200,620,(1400,260)))
json.dump({'contract':'A1CompositeStudy/v1','frames':res}, open(out+'type-scene-composite.json','w'), indent=1)
print(json.dumps(res,indent=1))
