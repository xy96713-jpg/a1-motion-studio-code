from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'work/banana-representative-stills-reference-20261030/layout-proof'
results={}
for version in ['before','after']:
    im=Image.open(out/f'{version}.png').convert('RGB');a=np.asarray(im)
    # ROI partition is specific to this held, isolated B10 proof, not a general OCR/occlusion detector.
    rois={'title':(0,0,1920,370),'evidence':(0,380,1920,820),'source':(0,820,1920,960)}
    measured={};overlay=im.copy();d=ImageDraw.Draw(overlay)
    d.rectangle((120,96,1800,935),outline='#ffbf40',width=2);d.line((960,0,960,1080),fill='#ffbf40',width=2)
    for name,(x0,y0,x1,y1) in rois.items():
        tile=a[y0:y1,x0:x1];mask=(tile[:,:,0]>100)&(tile[:,:,1]>100)&(tile[:,:,2]>90)
        ys,xs=np.where(mask);assert len(xs),name
        b=[int(xs.min()+x0),int(ys.min()+y0),int(xs.max()+x0+1),int(ys.max()+y0+1)]
        measured[name]={'pixelBoundsLTRB':b,'centerX':(b[0]+b[2])/2,'leftMargin':b[0],'rightMargin':1920-b[2],'pixels':len(xs)}
        color={'title':'#ff80c0','evidence':'#40ffb0','source':'#80bfff'}[name]
        d.rectangle(b,outline=color,width=3);d.text((b[0],b[1]-18),name+' '+str(b),fill=color)
        if name=='evidence':
            # Contour from actual bright-carrier pixels, not the rectangular canvas.
            rows=np.where(mask.any(axis=1))[0]
            left=[(int(np.where(mask[y])[0].min()+x0),int(y+y0)) for y in rows[::4]]
            right=[(int(np.where(mask[y])[0].max()+x0),int(y+y0)) for y in rows[::4]][::-1]
            d.line(left+right+left[:1],fill='#ff6060',width=2)
    measured['axisDelta']=abs(measured['title']['centerX']-measured['evidence']['centerX'])
    measured['scope']='Final rendered pixels, RGB threshold in explicit per-element ROIs. Evidence bounds are light carrier, NOT quote glyph extents. Bloom/outer lens can move edges. No unseen occlusion claim.'
    measured['sha256']=hashlib.sha256((out/f'{version}.png').read_bytes()).hexdigest()
    overlay.save(out/f'{version}-overlay.png');results[version]=measured
assert results['after']['title']['pixelBoundsLTRB'][1]>=96, 'final title violates TYPE top margin (not grid optical alignment)'
assert results['after']['axisDelta']<=6,results
assert results['after']['evidence']['leftMargin']>=120 and results['after']['evidence']['rightMargin']>=120
assert results['before']['axisDelta']>6
pair=Image.new('RGB',(1920,600),'#151515');d=ImageDraw.Draw(pair)
for i,v in enumerate(['before','after']):
    pair.paste(Image.open(out/f'{v}.png').resize((960,540)),(i*960,40));d.text((i*960+24,12),v.upper()+' - same engine, same t=21.65; static only',fill='white')
pair.save(out/'before-after.jpg',quality=95)
(out/'pixel-measurements.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
