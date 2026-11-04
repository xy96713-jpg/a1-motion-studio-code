"""Build editable-source, isolated bilingual title layers for internal review."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'work/presenter-eva-depth-v1/_stage'
FONTS = [Path.home() / 'Library/Fonts/SourceHanSerifCN-Heavy.otf', Path('/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf'), ROOT / 'remotion-renderer/public/a1-editorial-fonts/fusion-pixel.ttf']
PLANS = {
    'ED-31': [('可控', 0, 490, .60, 1., 110, 210), ('TAKE CONTROL', 1, 100, .70, 1.15, 110, 710), ('一套可控的工作流', 2, 36, 1., 1., 110, 845)],
    'ED-07': [('直接写完？', 0, 232, .60, 1., 110, 270), ('LET AI FINISH IT?', 1, 88, .70, 1.15, 110, 590), ('为什么不让它直接写完全文', 2, 36, 1., 1., 110, 760)],
}

def glyph(text, font, size, sx, sy):
    f = ImageFont.truetype(str(font), size)
    # Reject fonts whose missing-glyph box masquerades as valid content.
    missing = bytes(f.getmask('\U0010ffff'))
    for char in text.replace(' ', ''):
        assert bytes(f.getmask(char)) != missing, (font, char)
    b = f.getbbox(text)
    m = Image.new('RGBA', (b[2]-b[0]+8, b[3]-b[1]+8))
    ImageDraw.Draw(m).text((4-b[0], 4-b[1]), text, font=f, fill=(244,240,229,255))
    m = m.crop(m.getbbox())
    return m.resize((round(m.width*sx), round(m.height*sy)), Image.Resampling.LANCZOS)

for shot, plan in PLANS.items():
    folder = STAGE / shot
    target = Image.open(folder/'base.png').convert('RGBA')
    # Preserve the room: no vignette, panel, guide or poster background.
    Image.new('RGBA', target.size).save(folder/'vig.png')
    records = []
    for name, spec in zip(['main', 'english', 'sub'], plan):
        text, fi, size, sx, sy, x, y = spec
        ink = glyph(text, FONTS[fi], size, sx, sy)
        assert x+ink.width < 900, (shot, name, ink.size)
        layer = Image.new('RGBA', target.size)
        layer.alpha_composite(ink, (x, y))
        layer.save(folder/(name+'.png'))
        target = Image.alpha_composite(target, layer)
        records.append(dict(layer=name, text=text, font=str(FONTS[fi]), size=size, scaleX=sx, scaleY=sy, bounds=[x,y,ink.width,ink.height]))
    # No foreground cutout is needed: all title pixels stay left of the subject.
    target.convert('RGB').save(folder/'target.png')
    (folder/'typography-plan.json').write_text(json.dumps(dict(shot=shot, layers=records, productionAdmission=False), ensure_ascii=False, indent=2))
    print(shot, 'PASS', [(r['layer'],r['bounds']) for r in records])
