from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, random, argparse
W,H=1920,1080
ap=argparse.ArgumentParser()
ap.add_argument('--image',required=True)
ap.add_argument('--title',default='同一棵香蕉')
ap.add_argument('--sub',default='ONE CLONE / 4011')
ap.add_argument('--out',required=True)
ap.add_argument('--crop-left',type=int,default=0)
args=ap.parse_args()
TITLE=args.title; SUB=args.sub
out=args.out; os.makedirs(out,exist_ok=True)
ref=Image.open(args.image).convert('RGB')
art=ref.crop((args.crop_left,0,ref.width,ref.height))
CREAM=(239,232,218); INK=(17,17,17); RED=(224,32,27); YEL=(242,195,0)
SONG='/System/Library/Fonts/Supplemental/Songti.ttc'
SERIF='/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/assets/fonts/SourceHanSerifCN-Heavy.otf'
LAT='/System/Library/Fonts/Helvetica.ttc'
def font(path,size,index=0):
 try: return ImageFont.truetype(path,size,index=index)
 except: return ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc',size)
def fill(im,box):
 x0,y0,x1,y1=box; bw,bh=x1-x0,y1-y0; r=im.copy(); ir=im.width/im.height; br=bw/bh
 if ir>br:
  nh=bh; nw=int(nh*ir); r=r.resize((nw,nh),Image.LANCZOS); r=r.crop(((nw-bw)//2,0,(nw-bw)//2+bw,bh))
 else:
  nw=bw; nh=int(nw/ir); r=r.resize((nw,nh),Image.LANCZOS); r=r.crop((0,(nh-bh)//2,bw,(nh-bh)//2+bh))
 return r
def grain(im,amount=6):
 px=im.load(); random.seed(7)
 for _ in range(18000):
  x=random.randrange(W); y=random.randrange(H); a=random.randint(-amount,amount)
  r,g,b=px[x,y]; px[x,y]=(max(0,min(255,r+a)),max(0,min(255,g+a)),max(0,min(255,b+a)))
 return im
def title(draw,txt,xy,size,fill,vertical=False,gap=1.0):
 f=font(SONG,size)
 if vertical:
  x,y=xy
  for ch in txt: draw.text((x,y),ch,font=f,fill=fill); y+=int(size*gap)
 else: draw.text(xy,txt,font=f,fill=fill)
def label(draw,txt,xy,size=28,fill=INK):
 draw.text(xy,txt,font=font(LAT,size),fill=fill)
def base(color=CREAM): return Image.new('RGB',(W,H),color)
imgs=[]
# A evidence full bleed
im=fill(art,(0,0,W,H)); d=ImageDraw.Draw(im)
grad=Image.new('L',(W,H),0); gd=ImageDraw.Draw(grad)
for x in range(W):
 v=int(220*max(0,1-x/1250)); gd.line([(x,0),(x,H)],fill=v)
im=Image.composite(Image.new('RGB',(W,H),(0,0,0)),im,grad); d=ImageDraw.Draw(im)
title(d,TITLE,(80,740),190,(239,232,218)); label(d,SUB+' · A / EVIDENCE',(88,990),28,(239,232,218)); imgs.append(grain(im))
# B print split
im=base(); d=ImageDraw.Draw(im); im.paste(fill(art,(520,0,W,H)),(520,0)); d.rectangle([0,0,520,H],fill=CREAM)
title(d,TITLE,(120,90),120,INK,vertical=True,gap=1.18); label(d,SUB+' · B / PRINT',(126,930),28); d.rectangle([510,0,520,H],fill=RED); imgs.append(grain(im))
# C count grid
im=base((10,10,10)); d=ImageDraw.Draw(im); cols,rows=4,2; gap=12; cw=(W-gap*(cols+1))//cols; ch=(H-gap*(rows+1))//rows
for j in range(rows):
 for i in range(cols):
  x=gap+i*(cw+gap); y=gap+j*(ch+gap)
  if (i,j)==(3,1): d.rectangle([x,y,x+cw,y+ch],fill=RED)
  else: im.paste(fill(art,(x,y,x+cw,y+ch)),(x,y))
title(d,'同一棵香蕉',(60,44),140,YEL); label(d,SUB+' · C / COUNT',(1500,1010),26,CREAM); imgs.append(grain(im,3))
# D type-led
im=base(YEL); d=ImageDraw.Draw(im); im.paste(fill(art,(0,720,W,1080)),(0,720)); d.rectangle([0,0,W,720],fill=YEL); title(d,'同一棵香蕉',(60,20),300,INK); label(d,SUB+' · D / TYPE',(80,1000),28,INK); imgs.append(grain(im))
# E process split
im=base(CREAM); d=ImageDraw.Draw(im); d.rectangle([54,54,W-54,H-54],outline=INK,width=3)
im.paste(fill(art,(84,84,980,996)),(84,84)); d.line([(1020,100),(1020,980)],fill=INK,width=2)
title(d,'同一棵香蕉',(1080,120),118,INK); f=font(SONG,38)
for k,t in enumerate(['01 一根','02 一排','03 一片']): d.text((1080,520+k*90),t,font=f,fill=INK)
label(d,SUB+' · E / PROCESS',(1080,940),26); imgs.append(grain(im))
# F minimal dark
im=base((12,12,12)); d=ImageDraw.Draw(im); d.rectangle([110,110,540,970],fill=INK); title(d,'同一棵香蕉',(150,150),112,YEL,vertical=True,gap=1.18)
im.paste(fill(art,(650,180,1680,900)),(650,180)); d.ellipse([1470,930,1590,1050],outline=RED,width=10); label(d,SUB+' · F / MATERIAL',(650,980),26,CREAM); imgs.append(grain(im,3))
for i,im in enumerate(imgs,1): im.save(f'{out}/opt-{i}.png')
# contact sheet
sheet=Image.new('RGB',(2880,1080),(0,0,0)); sf=font(LAT,30)
for i,im in enumerate(imgs):
 x=(i%3)*960; y=(i//3)*540; sheet.paste(im.resize((960,540),Image.LANCZOS),(x,y)); ImageDraw.Draw(sheet).text((x+18,y+18),'ABCDEF'[i],font=font(LAT,40),fill=(255,255,255))
sheet.save(f'{out}/sheet.png'); print('done',out)