import * as H0 from './house.mjs';
// Layouts: compositions taken from designed pieces in the user's Pinterest (style-library.json refs), not
// from a template grid. What makes those pieces read as designed is the composition, not the texture:
// one cut-out subject at a big scale, type that works with it (a full-width band, words around it,
// a vertical edge line), notes in the corners, a frame or a plate. Each layout here is one such device
// with the reference it came from. `fits` follows the director (DESIGN-harmony.md, 风格只换长相): a
// layout that fills the frame with a drawn plate fits only metaphor shots; evidence keeps its own cards. Content goes in as words and images; every readable word is set
// by code, images arrive already printed with the film's inks (inkprint.mjs).
//
// layoutHtml(id, content, inks, { fontDir }) -> a 1920x1080 page.
// content: { title, sub, kicker, meta: [tl, tr, bl, br], image, imageB, labels, day, month, weekday, number }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const corners = (meta = [], color) => meta.map((t, i) => t ? `<div class="a mono" style="${['left:72px;top:56px', 'right:72px;top:56px', 'left:72px;bottom:52px', 'right:72px;bottom:52px'][i]};font-size:22px;color:${color}">${esc(t)}</div>` : '').join('');

// fit: the element's text is sized to fill its own width (data-fit) — headline bands, numerals
const FIT = `<script>document.fonts.ready.then(()=>{for(const e of document.querySelectorAll('[data-fit]')){const w=+e.dataset.fit;const r=document.createRange();r.selectNodeContents(e);let s=parseFloat(getComputedStyle(e).fontSize);e.style.whiteSpace='nowrap';for(let i=0;i<4;i++){r.selectNodeContents(e);s*=w/r.getBoundingClientRect().width;e.style.fontSize=s+'px'}}document.body.dataset.ready=1})</script>`;

export const LAYOUTS = {
  // a tear-off calendar sheet (the 黄历 page in cluster 5): the date is a thing you can hold
  'calendar-page': {
    from: ['home-e8e383f20d3cb9a249d446b614710798.jpg'],
    fits: ['metaphor'],
    needs: ['day', 'month'],
    body: (c, k) => `
      <div class="a" style="left:0;top:0;width:1920px;height:1080px;background:${k.paper}"></div>
      <div class="a" style="left:210px;top:70px;width:720px;height:940px;transform:rotate(-2.5deg);filter:drop-shadow(0 22px 30px rgba(0,0,0,.28))">
        <div class="a" style="left:0;top:0;width:720px;height:940px;background:#F4EFE6;clip-path:polygon(0 0,100% 0,100% 96%,95% 100%,90% 96.5%,85% 100%,80% 96%,75% 100%,70% 96.5%,65% 100%,60% 96%,55% 100%,50% 96.5%,45% 100%,40% 96%,35% 100%,30% 96.5%,25% 100%,20% 96%,15% 100%,10% 96.5%,5% 100%,0 96%)"></div>
        <div class="a" style="left:0;top:0;width:720px;height:74px;background:${k.ink}"></div>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<div class="a" style="left:${78 + i * 112}px;top:24px;width:26px;height:26px;border-radius:50%;background:${k.paper}"></div>`).join('')}
        <div class="a serif" style="left:56px;top:118px;font-size:66px;color:${k.ink}">${esc(c.month)}</div>
        <div class="a mono" style="right:56px;top:136px;font-size:26px;color:${k.ink}">${esc(c.monthEn || '')}</div>
        <div class="a" style="left:56px;top:212px;width:608px;height:4px;background:${k.ink}"></div>
        <div class="a serif" style="left:0;top:250px;width:720px;text-align:center;font-size:500px;color:${k.second};letter-spacing:-.04em">${esc(c.day)}</div>
        <div class="a" style="left:56px;top:760px;width:608px;height:2px;background:${k.ink}"></div>
        <div class="a serif" style="left:56px;top:784px;font-size:58px;color:${k.ink}">${esc(c.weekday)}</div>
        <div class="a mono" style="right:56px;top:800px;font-size:26px;color:${k.ink}">${esc(c.weekdayEn || '')}</div>
      </div>
      ${c.image ? `<div class="a" style="left:1060px;top:560px;width:600px;height:400px;border:4px solid ${k.ink};overflow:hidden"><img src="${c.image}" style="width:100%;height:100%;object-fit:cover"></div>
      <div class="a mono" style="left:1060px;top:974px;font-size:22px;color:${k.ink}">${esc(c.caption || '')}</div>` : ''}
      <div class="a serif" style="left:1050px;top:150px;width:700px;font-size:104px;line-height:1.14;color:${k.ink};text-wrap:balance">${esc(c.sub)}</div>
      ${corners(c.meta, k.ink)}`,
  },
  // a heavy headline band across the top, the subject large below and running off the bottom edge
  // (太陽の塔, WITHOUT CREATIVITY, MIND OVER MATTER)
  'title-band': {
    from: ['board-1cbe495185c0d8eff94264f11de40425.jpg', 'home-388af084c70e32206bebd4f7e3ca6aaf.jpg'],
    fits: ['title'],
    needs: ['title', 'image'],
    body: (c, k) => `
      <div class="a" style="left:0;top:0;width:1920px;height:1080px;background:${k.paper}"></div>
      <div class="a" style="left:72px;top:72px;width:1776px;height:${1080 - 72 + (c.bleed ?? 60)}px;display:flex;flex-direction:column">
        <div class="serif" data-fit="1776" style="font-size:200px;color:${k.ink};letter-spacing:-.01em;line-height:.92;padding-bottom:22px">${esc(c.title)}</div>
        <div style="height:8px;background:${k.ink}"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px;min-height:52px">
          ${c.kicker ? `<span style="padding:8px 18px;background:${k.second};color:${k.paperLight || k.paper};font:600 34px 'PingFang SC'">${esc(c.kicker)}</span>` : '<span></span>'}
          ${c.sub ? `<span style="font:600 34px 'PingFang SC';color:${k.ink}">${esc(c.sub)}</span>` : ''}
        </div>
        <div style="flex:1;min-height:0;margin-top:30px;position:relative"><img src="${c.image}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${c.fitImage || 'cover'};object-position:${c.imagePos || '50% 30%'}"></div>
      </div>
      ${corners([null, null, c.meta?.[2], c.meta?.[3]], c.fitImage === 'contain' ? k.ink : k.paperLight || k.paper)}`,
  },
  // a perforated stamp (TOKYO BLUES 1992 stamp): a side card on the presenter that is an object
  'stamp': {
    from: ['home-2d5537e9029a0a97b640bbe5aee1824b.jpg'],
    fits: ['presenter-tags'],
    needs: ['title', 'image'],
    overlay: true,
    body: (c, k) => {
      const W = 540, H = 720, r = 13;
      const perf = `radial-gradient(circle at ${r}px ${r}px, transparent ${r - 4}px, #000 ${r - 3}px) -${r}px -${r}px / ${r * 2}px ${r * 2}px`;
      return `
      <img class="a" src="${c.plate}" style="left:0;top:0;width:1920px;height:1080px;object-fit:cover">
      <div class="a" style="left:${c.x ?? 92}px;top:150px;width:${W}px;height:${H}px;transform:rotate(-2deg);filter:drop-shadow(0 16px 26px rgba(0,0,0,.45))">
        <div class="a" style="inset:0;background:#F4EFE6;-webkit-mask:${perf};mask:${perf}"></div>
        <div class="a" style="left:34px;top:34px;width:${W - 68}px;height:${H - 68}px;background:#F4EFE6;border:3px solid ${k.ink}"></div>
        <div class="a" style="left:52px;top:52px;width:${W - 104}px;height:420px;background:${c.imageBg || k.accent};overflow:hidden">${c.imageBg ? `<img src="${c.image}" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
        ${c.imageBg ? '' : `<img class="a" src="${c.image}" style="left:62px;top:40px;width:${W - 124}px;height:470px;object-fit:contain">`}
        <div class="a mono" style="left:58px;top:478px;font-size:20px;color:${k.accent}">${esc(c.kicker)}</div>
        <div class="a mono" style="right:58px;top:478px;font-size:20px;color:${k.ink}">${esc(c.number || '')}</div>
        <div class="a serif" data-fit="${W - 112}" style="left:56px;top:514px;font-size:110px;color:${k.ink}">${esc(c.title)}</div>
        <div class="a" style="left:56px;top:640px;width:${W - 112}px;font:600 24px 'PingFang SC';color:${k.ink}">${esc(c.sub)}</div>
      </div>`;
    },
  },
  // a framed card with a numeral plate and a title plate (the tarot cards in clusters 2 and 5)
  'card-plate': {
    from: ['home-4ea65e1e2d5b160d415c7ae68375f540.jpg'],
    fits: ['presenter-tags'],
    needs: ['title', 'image'],
    overlay: true,
    body: (c, k) => `
      <img class="a" src="${c.plate}" style="left:0;top:0;width:1920px;height:1080px;object-fit:cover">
      <div class="a" style="left:${c.x ?? 110}px;top:110px;width:500px;height:820px;background:#F4EFE6;box-shadow:0 18px 40px rgba(0,0,0,.4)">
        <div class="a" style="left:18px;top:18px;width:464px;height:784px;border:4px solid ${k.ink}"></div>
        <div class="a" style="left:28px;top:28px;width:444px;height:764px;border:1.5px solid ${k.ink}"></div>
        <div class="a" style="left:28px;top:28px;width:444px;height:76px;border-bottom:1.5px solid ${k.ink}"></div>
        <div class="a serif" style="left:0;top:44px;width:500px;text-align:center;font-size:40px;color:${k.ink}">— ${esc(c.number)} —</div>
        <div class="a" style="left:44px;top:120px;width:412px;height:520px;background:${c.imageBg || k.accent};overflow:hidden"><img src="${c.image}" style="width:100%;height:100%;object-fit:${c.imageBg ? 'cover' : 'contain'}"></div>
        <div class="a" style="left:28px;top:660px;width:444px;height:132px;border-top:1.5px solid ${k.ink}"></div>
        <div class="a serif" style="left:0;top:680px;width:500px;text-align:center;font-size:84px;color:${k.ink}">${esc(c.title)}</div>
        <div class="a mono" style="left:0;top:770px;width:500px;text-align:center;font-size:18px;color:${k.ink}">${esc(c.kicker)}</div>
      </div>`,
  },
  // two things and what runs between them, an axis of labels underneath, the title across the top with
  // a mark set inside it (MIND [icon] OVER MATTER, ALL IS MIND / THINKING DOING BEING)
  'axis': {
    from: ['board-5b3ad8e66ee7712f2738a42cd76a3739.jpg'],
    fits: ['diagram', 'data'],
    needs: ['title', 'image', 'labels'],
    body: (c, k) => {
      const [a, b] = String(c.title).split('|');
      const L = c.labels || [];
      return `
      <div class="a" style="left:0;top:0;width:1920px;height:1080px;background:${k.paper}"></div>
      <div class="a" style="left:0;top:70px;width:1920px;display:flex;justify-content:center;align-items:center;gap:36px">
        <span class="serif" style="font-size:170px;color:${k.ink}">${esc(a)}</span>
        ${b != null ? `<span style="display:inline-flex;gap:16px;transform:skewX(-20deg)"><i style="width:22px;height:150px;background:${k.second}"></i><i style="width:22px;height:150px;background:${k.second}"></i></span><span class="serif" style="font-size:170px;color:${k.ink}">${esc(b)}</span>` : ''}
      </div>
      ${c.kicker ? `<div class="a mono" style="left:0;top:296px;width:1920px;text-align:center;font-size:26px;color:${k.ink}">${esc(c.kicker)}</div>` : ''}
      <img class="a" src="${c.image}" style="left:120px;top:350px;width:1680px;height:540px;object-fit:contain">
      <div class="a" style="left:120px;top:930px;width:1680px;height:3px;background:${k.ink}"></div>
      ${L.map((t, i) => { const x = (c.labelAt || [0.25, 0.5, 0.75])[i] * 1920; const hot = i === Math.floor(L.length / 2); return `<div class="a" style="left:${x - 1.5}px;top:910px;width:3px;height:42px;background:${hot ? k.second : k.ink}"></div><div class="a mono" style="left:${x - 200}px;top:966px;width:400px;text-align:center;font-size:32px;color:${hot ? k.second : k.ink}">${esc(t)}</div>`; }).join('')}
      ${corners(c.meta, k.ink)}`;
    },
  },
  // the subject huge and cropped by the frame, the headline running down the left edge in a colour block
  // (八丈島, 寺田克也, the cat with the vertical ホメダ)
  'vertical-edge': {
    from: ['home-2ff1c7dbd418608fb123a1eaef52f4c8.jpg', 'home-01ee0c91d4e93c6edcf6dd2320684b31.jpg', 'home-3aaf7ddfe81bae49a22b4b567603b973.jpg'],
    fits: ['metaphor'],
    needs: ['title', 'image'],
    body: (c, k) => `
      <div class="a" style="left:0;top:0;width:1920px;height:1080px;background:${k.paper}"></div>
      <img class="a" src="${c.image}" style="left:${c.imageBox?.[0] ?? 330}px;top:${c.imageBox?.[1] ?? -60}px;width:${c.imageBox?.[2] ?? 1700}px;height:${c.imageBox?.[3] ?? 1200}px;object-fit:cover">
      <div class="a" style="left:0;top:0;width:300px;height:1080px;background:${k.second}"></div>
      <div class="a serif" style="left:66px;top:70px;writing-mode:vertical-rl;font-size:168px;line-height:1;color:${k.paperLight || k.paper}">${esc(c.title)}</div>
      <div class="a mono" style="left:52px;bottom:52px;width:200px;font-size:20px;line-height:1.5;color:${k.paperLight || k.paper}">${esc(c.kicker)}</div>
      ${c.sub ? `<div class="a" style="right:72px;bottom:96px;padding:10px 20px;background:${k.paper};font:600 38px 'PingFang SC';color:${k.ink}">${esc(c.sub)}</div>` : ''}
      ${corners([null, c.meta?.[1], null, c.meta?.[3]], k.ink)}`,
  },
  // a drawn plate that left its own empty area for the title (the plate is asked for it); the type goes
  // into that area, sized to it, in poster type (the Showa posters, PEACE OF MIND, the scissors plate)
  'plate-title': {
    from: ['board-1cbe495185c0d8eff94264f11de40425.jpg', 'home-29d42e10788e75ad24b7b3721c278762.jpg'],
    fits: ['metaphor'],
    needs: ['title', 'plate', 'zone'],
    body: (c, k) => {
      const [x, y, w, h] = c.zone;
      const lines = String(c.title).split('|');
      const font = c.sans ? 'sans' : 'serif';
      return `
      <img class="a" src="${c.plate}" style="left:0;top:0;width:1920px;height:1080px;object-fit:cover">
      <div class="a" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;flex-direction:column;justify-content:${c.valign || 'center'};align-items:${c.align === 'center' ? 'center' : 'flex-start'}">
        ${c.kicker ? `<div class="mono" style="font-size:26px;color:${k.ink};margin-bottom:22px">${esc(c.kicker)}</div>` : ''}
        ${lines.map((l) => `<div class="${font}" data-fit="${w}" style="font-size:200px;line-height:.98;color:${c.titleColor || k.second}">${esc(l)}</div>`).join('')}
        ${c.sub ? `<div style="margin-top:28px;padding:10px 20px;background:${k.ink};color:${k.paper};font:600 40px 'PingFang SC'">${esc(c.sub)}</div>` : ''}
      </div>
      ${(c.labels || []).map((l) => `<div class="a mono" style="left:${l.x - 200}px;top:${l.y}px;width:400px;text-align:center;font-size:30px;color:${l.hot ? k.second : k.ink}">${esc(l.text)}</div>`).join('')}
      ${corners(c.meta, k.ink)}`;
    },
  },
};

export function layoutHtml(id, content, inks, { fontDir }) {
  const L = LAYOUTS[id];
  if (!L) throw new Error(`unknown layout ${id}`);
  const face = `@font-face{font-family:Serif;src:url('${fontDir}SourceHanSerifCN-Heavy.otf')}@font-face{font-family:Sans;src:url('${fontDir}SourceHanSansCN-Heavy.otf')}@font-face{font-family:Pixel;src:url('${fontDir}fusion-pixel.ttf')}`;
  return `<!doctype html><meta charset="utf-8"><style>${face}${H0.houseFonts().ready ? H0.houseFontCss() : ''}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:${inks.paper}}
*{box-sizing:border-box}.a{position:absolute}.serif{font-family:Serif;font-weight:900;line-height:1}.sans{font-family:Sans;font-weight:900;line-height:1;letter-spacing:-.02em}
.mono{font-family:'SF Mono',Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}
img{display:block}i{display:block}
</style><body>${L.body(content, inks)}${FIT}</body>`;
}
