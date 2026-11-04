// The terminal world (worlds/terminal.json): the whole film inside an early-2000s trading terminal.
// Rebuilt from the approved style frames (style-lab/concepts-v1/terminal-*): a dark desktop, layered OS
// windows with dithered title bars and scroll bars, pixel type with a phosphor glow, amber and violet tags,
// filler windows with text-free panel art (tiles). Every readable word and every window is code; real
// material sits in its own window and keeps its content (graded, never redrawn).
//
// worldFrame({ recipe, shot, parts, resolved, world, focus }) -> { content, css, ownsFocus, noSubtitle } | null
//   layouts: title-hero-over-photo, screen-full, presenter-side-card, mechanism-3d (the four style frames)
//   other cards: 'frame' (the card inside the main window on the desktop), presenter cards: 'overlay'
//   (the presenter stays the real plate, only tags and plates take the terminal look)

const W = 1920, H = 1080;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => `${Math.round(n)}px`;

// deterministic noise so a shot always draws the same desktop (stills stay pixel-identical)
function rng(seed) { let s = 2166136261; for (const c of String(seed)) s = Math.imul(s ^ c.charCodeAt(0), 16777619); return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; }

export function worldCss(t) {
  return `
.subtitle{z-index:60!important}
.tw-desk{position:absolute;inset:0;background:${t.desk};background-image:linear-gradient(rgba(150,210,160,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(150,210,160,.045) 1px,transparent 1px);background-size:24px 24px}
.tw-win{position:absolute;background:#101412;border:2px solid ${t.line};box-shadow:0 0 0 2px #000,7px 8px 0 rgba(0,0,0,.65);overflow:hidden}
.tw-win.dim{opacity:.42}
.tw-bar{position:absolute;left:0;right:0;top:0;height:30px;border-bottom:2px solid ${t.line};background:repeating-conic-gradient(${t.line} 0 25%,#0b0f0c 0 50%) 0 0/4px 4px}
.tw-bar.blue{background:repeating-conic-gradient(${t.bar} 0 25%,#2c3e6e 0 50%) 0 0/4px 4px}
.tw-bar.green{background:repeating-conic-gradient(#8fbf88 0 25%,#253a28 0 50%) 0 0/4px 4px}
.tw-btns{position:absolute;right:6px;top:4px;display:flex;gap:4px}
.tw-btns i{width:20px;height:20px;background:#0b0f0c;border:2px solid ${t.line};display:block}
.tw-btns i:last-child{background:linear-gradient(45deg,transparent 44%,${t.line} 44% 56%,transparent 56%),linear-gradient(-45deg,transparent 44%,${t.line} 44% 56%,transparent 56%),#0b0f0c}
.tw-body{position:absolute;left:0;right:0;top:32px;bottom:0;overflow:hidden}
.tw-win.scroll .tw-body{right:26px}
.tw-scroll{position:absolute;right:0;top:32px;bottom:0;width:26px;border-left:2px solid ${t.line};background:repeating-conic-gradient(#1b241d 0 25%,#0b0f0c 0 50%) 0 0/4px 4px}
.tw-scroll::before,.tw-scroll::after{content:'';position:absolute;left:3px;width:16px;height:16px;border:2px solid ${t.line};background:#0b0f0c}
.tw-scroll::before{top:3px}.tw-scroll::after{bottom:3px}
.tw-scroll b{position:absolute;left:3px;top:34%;width:16px;height:22%;background:${t.line}}
.tw-px{font-family:'A1 Pixel','PingFang SC',monospace;color:${t.ink};-webkit-text-stroke:.03em currentColor;text-shadow:0 0 12px rgba(170,255,170,.35);line-height:1.05;white-space:nowrap;letter-spacing:.02em}
.tw-tag .tw-px{font-family:'A1 Sans Heavy','PingFang SC',sans-serif;-webkit-text-stroke:0;text-shadow:none;letter-spacing:0}
.tw-mono{font-family:'SF Mono',Menlo,monospace;color:${t.ink};letter-spacing:.06em}
.tw-tag{position:absolute;display:flex;align-items:center;padding:0 22px;border:3px solid ${t.amber};color:#f4ead2;background:rgba(240,164,58,.06)}
.tw-tag.violet{border-color:${t.violet};color:#ff86ff;background:rgba(208,76,255,.16);box-shadow:0 0 18px rgba(208,76,255,.25) inset}
.tw-tag.line{border-color:${t.line};color:${t.ink};background:rgba(0,0,0,.5)}
.tw-cursor{display:inline-block;width:.42em;height:.86em;margin-left:.25em;background:${t.violet};vertical-align:-.08em}
.tw-tile{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated}
.tw-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) sepia(.35) hue-rotate(48deg) saturate(.55) contrast(1.25) brightness(1.18)}
.tw-meter{position:absolute;left:14px;right:14px;height:16px;border:2px solid ${t.dim}}
.tw-meter i{position:absolute;left:0;top:0;bottom:0;background:repeating-linear-gradient(90deg,#8fe08a 0 6px,transparent 6px 9px)}
.tw-tick{position:absolute;display:flex;align-items:center;gap:22px;padding:0 18px;white-space:nowrap}
.tw-tick i{display:block;height:20px;background:repeating-linear-gradient(90deg,currentColor 0 5px,transparent 5px 8px)}
.tw-guide{position:absolute;border:1px dashed rgba(185,203,180,.45)}
.tw-cross{position:absolute;width:22px;height:22px;border:1.5px solid rgba(185,203,180,.7)}
.tw-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(transparent 0 2px,rgba(0,0,0,.22) 2px 3px);mix-blend-mode:multiply}
.tw-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
.tw-zoom{position:absolute;inset:0;overflow:hidden}
.tw-zoom img{position:absolute;transform-origin:0 0}
.tw-hl{position:absolute;border:3px solid ${t.amber};background:rgba(240,164,58,.32);mix-blend-mode:multiply}
.tw-hl-o{position:absolute;border:3px solid ${t.amber}}
/* cards framed in a window take the terminal palette: stacked recap cards, cards, chat bubbles, plates */
.stage{--stack-bg:#050806;--stack-line:${t.line};--stack-on:#10291a;--stack-on-ink:${t.ink};--stack-ink:${t.ink};--stack-radius:0;--stack-shadow:6px 7px 0 rgba(0,0,0,.6);--card-bg:#050806;--card-fg:${t.ink}}
.scard2 .lab{font-family:'A1 Sans Heavy','PingFang SC',sans-serif}
.bubble{background:#050806!important;color:${t.ink}!important;border:2px solid ${t.line};border-radius:0!important;box-shadow:6px 7px 0 rgba(0,0,0,.6)!important;font-family:'A1 Sans Heavy','PingFang SC',sans-serif}
.av{border-radius:0!important;background:#0b0f0c!important;border:2px solid ${t.line}!important;color:${t.ink}!important}
.device{background:#050806!important;border:2px solid ${t.line}!important;border-radius:0!important}
/* plates under titles (nameplates, labels): an amber-framed black label instead of torn paper */
.artplate{background:#050806!important;border:3px solid ${t.amber}!important;box-shadow:6px 7px 0 rgba(0,0,0,.6)}
.artplate .t{color:#f4ead2!important}
/* short tags under a stamp title: amber-framed terminal tags; titles drawn on the screen are phosphor */
.btags li{background:#050806!important;color:${t.amber}!important;border:2px solid ${t.amber};box-shadow:5px 6px 0 rgba(0,0,0,.6)!important;transform:none!important;font-family:'A1 Sans Heavy','PingFang SC',sans-serif}
.slot[data-slot="title"] .t{color:${t.ink}!important}
/* a title set over an evidence page gets a dark backing (the page stays readable around it) */
.tw-card .slot[data-slot="title"] .t,.stage .slot[data-slot="title"] .t.ink,.cam-frame .slot[data-slot="title"] .t:not(.chrome-type){background:rgba(5,8,6,.9);padding:.06em .24em;box-shadow:0 0 0 3px rgba(185,203,180,.55);transform:none!important;text-shadow:none!important}
.device{border:none!important;background:transparent!important}
/* presenter cards keep the real plate; their tags become terminal tags */
.ptag2{background:#050806!important;background-image:none!important;border:3px solid ${t.amber};color:#f4ead2!important;font-family:'A1 Sans Heavy','PingFang SC',sans-serif!important;letter-spacing:0!important;-webkit-mask:none!important;mask:none!important;filter:none!important;box-shadow:6px 7px 0 rgba(0,0,0,.6)}
.ptag2-t{text-shadow:0 0 10px rgba(255,200,120,.3)!important}
.ptag2 .hl{color:#ff86ff!important}
.ptag2w .cm{border-color:${t.line}!important}
`;
}

function win({ x, y, w, h, bar = 'dither', scroll = false, dim = false, body = '', z = 1, style = '' }) {
  return `<div class="tw-win${scroll ? ' scroll' : ''}${dim ? ' dim' : ''}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};z-index:${z};${style}">
<div class="tw-bar ${bar}"></div><div class="tw-btns"><i></i><i></i><i></i></div><div class="tw-body">${body}</div>${scroll ? '<div class="tw-scroll"><b></b></div>' : ''}</div>`;
}
const tile = (url) => (url ? `<img class="tw-tile" src="${url}">` : '');
const meters = (r, n = 6) => Array.from({ length: n }, (_, i) => `<div class="tw-meter" style="top:${px(16 + i * 34)}"><i style="width:${Math.round(20 + r() * 75)}%"></i></div>`).join('');
// a strip of blocky marks and arrows: a ticker without any figures in it (no numbers that trace nowhere)
const ticker = (r, color) => `<div class="tw-tick" style="inset:0;color:${color}">${Array.from({ length: 14 }, (_, i) => `${i % 3 === 0 ? `<span class="tw-px" style="font-size:20px;color:${r() > 0.5 ? '#8fe08a' : '#f0a43a'}">${r() > 0.5 ? '▲' : '▼'}</span>` : ''}<i style="width:${Math.round(26 + r() * 50)}px;color:${r() > 0.6 ? '#8fe08a' : '#f0a43a'}"></i>`).join('')}</div>`;

// the desk under every non-presenter frame: grid, and dim windows of meters around the edges
function desk(seed, t) {
  const r = rng(seed);
  const dims = [[-20, -10, 300, 150], [1640, -20, 300, 170], [-30, 930, 330, 170], [1600, 940, 340, 160], [880, -24, 420, 110]]
    .map(([x, y, w, h]) => win({ x, y, w, h, dim: true, body: meters(r, 3) })).join('');
  return `<div class="tw-desk"></div>${dims}`;
}

const fx = `<div class="tw-scan" style="z-index:40"></div><div class="tw-glow" style="z-index:41"></div>`;

// fit a pixel headline to its box (the browser measures; same idea as compose FIT_TEXT)
const zoomScript = `<script>document.fonts.ready.then(()=>setTimeout(()=>{for(const c of document.querySelectorAll('.tw-card')){if(c.querySelector('.mech'))continue;const k=+c.dataset.k;const cb=c.getBoundingClientRect();let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of c.querySelectorAll('.slot')){const n=e.dataset.slot||'';if(/^(background|backdrop|plate|panel)$/.test(n))continue;if(!e.textContent.trim()&&!e.querySelector('img,canvas,video,.mech'))continue;if(e.querySelector('.mech'))continue;const rs=[...e.querySelectorAll('img,video')].map(m=>m.getBoundingClientRect());const tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(tw.nextNode()){if(!tw.currentNode.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(tw.currentNode);rs.push(...rg.getClientRects())}for(const r of rs.filter(r=>r.width>2&&r.height>2)){x0=Math.min(x0,r.left);y0=Math.min(y0,r.top);x1=Math.max(x1,r.right);y1=Math.max(y1,r.bottom)}}if(x1<x0)continue;const W=${W},H=${H};const bx=(x0-cb.left)/k,by=(y0-cb.top)/k,bw=(x1-x0)/k,bh=(y1-y0)/k;const pad=70;const z=Math.min(1.8,(W-2*pad)/bw,(H-2*pad)/bh);if(z<=1.04)continue;const tx=(W-bw*z)/2-bx*z,ty=(H-bh*z)/2-by*z;for(const e of c.children){const n=e.dataset&&e.dataset.slot||'';if(/^(background|backdrop)$/.test(n))continue;e.style.transformOrigin='0 0';e.style.transform='translate('+tx+'px,'+ty+'px) scale('+z+')'}}document.body.dataset.twzoom='1'},60))</script>`;
const fitScript = `<script>document.fonts.ready.then(()=>{for(const e of document.querySelectorAll('[data-twbox]')){const [w,h]=e.dataset.twbox.split(',').map(Number);let s=parseFloat(getComputedStyle(e).fontSize);for(let i=0;i<40&&(e.scrollWidth>w+2||e.scrollHeight>h+2);i++){s*=0.94;e.style.fontSize=s+'px'}}for(const e of document.querySelectorAll('[data-twfit]')){const w=+e.dataset.twfit;let s=parseFloat(getComputedStyle(e).fontSize);for(let i=0;i<4;i++){const r=document.createRange();r.selectNodeContents(e);s*=w/Math.max(1,r.getBoundingClientRect().width);if(e.dataset.twmax)s=Math.min(s,+e.dataset.twmax);e.style.fontSize=s+'px'}if(e.classList.contains('tw-px')||e.closest('.tw-px'))e.style.fontSize=Math.max(12,Math.floor(s/12)*12)+'px'}})</script>`;

function titleOverPhoto({ shot, resolved, world, ctx }) {
  const t = world.tokens, r = rng(shot.shotId), tiles = ctx.tiles;
  const title = shot.slots?.title?.text || ctx.onScreen?.headline || '';
  const sub = shot.slots?.title?.sub || shot.slots?.annotation?.text || ctx.phrase || '';
  const photo = resolved.background?.url;
  return desk(shot.shotId, t)
    + win({ x: 798, y: 106, w: 965, h: 836, scroll: true, z: 2, body: photo ? `<img class="tw-photo" src="${photo}"><div class="tw-scan"></div>` : '' })
    + win({ x: 86, y: 118, w: 821, h: 385, z: 3, body: `
      <div class="tw-px" data-twfit="750" data-twmax="190" style="position:absolute;left:34px;top:30px;font-size:170px">${esc(title)}</div>
      ${sub ? `<div class="tw-tag line" style="left:34px;top:250px;width:750px;height:84px"><span class="tw-px" data-twfit="700" data-twmax="54" style="font-size:52px;color:#e8f4e4">${esc(sub)}</span><span class="tw-cursor" style="font-size:52px"></span></div>` : ''}` })
    + win({ x: 63, y: 473, w: 344, h: 312, z: 2, body: tile(tiles.radar) })
    + win({ x: 434, y: 497, w: 344, h: 268, z: 2, body: tile(tiles.globe) })
    + win({ x: 38, y: 804, w: 471, h: 204, z: 2, body: tile(tiles.map) })
    + win({ x: 513, y: 804, w: 255, h: 204, z: 2, body: tile(tiles.orbit) })
    + `<div class="tw-win" style="left:804px;top:958px;width:1108px;height:63px;z-index:2">${ticker(r)}</div>`
    + win({ x: 1665, y: 12, w: 247, h: 150, z: 1, body: meters(r, 3) })
    + win({ x: 1777, y: 184, w: 138, h: 276, z: 1, dim: true, body: meters(r, 6) })
    + fx;
}

// a headline with a figure in it breaks after the figure ("将近6000" / "亿美金"); otherwise in half
function bigLines(t) {
  const m = String(t).match(/^(.*?\d[\d,.]*)(.+)$/);
  if (m && m[2].length >= 1) return [m[1], m[2]];
  const c = [...String(t)]; const h = Math.ceil(c.length / 2);
  return c.length > 5 ? [c.slice(0, h).join(''), c.slice(h).join('')] : [t];
}

function newsPage({ shot, resolved, world, ctx, focus }) {
  const t = world.tokens, tiles = ctx.tiles;
  const page = resolved.screen?.url;
  const big = shot.slots?.title?.text || ctx.onScreen?.headline || '';
  const tag = (ctx.onScreen?.keywords || []).slice(0, 2).join(' ');
  const boxes = focus?.boxes?.length ? focus.boxes : (shot.cues?.highlight?.boxes || []);
  // the page in its window: the capture fills the window width, scrolled so the highlighted lines sit high
  const PW = 1014, PH = 501;
  const b0 = boxes[0];
  const span = boxes.length ? Math.max(...boxes.map((b) => b[0] + b[2])) - Math.min(...boxes.map((b) => b[0])) : 1;
  const k = Math.min(1.7, Math.max(PW / 1920, (PW * 0.9) / (span * 1920))), imgW = 1920 * k, imgH = 1080 * k;
  const left = b0 ? Math.max(PW - imgW, Math.min(0, PW * 0.05 - Math.min(...boxes.map((b) => b[0])) * imgW)) : 0;
  const top = b0 ? Math.max(Math.min(0, PH - imgH), Math.min(0, PH * 0.3 - b0[1] * imgH)) : 0;
  const hl = boxes.map(([x, y, w, h]) => `<i class="tw-hl" style="left:${px(left + x * imgW)};top:${px(top + y * imgH)};width:${px(w * imgW)};height:${px(h * imgH)}"></i>`).join('');
  // the zoom window: the first highlighted line, magnified
  const ZW = 614, ZH = 290;
  // magnified about twice the page window, centred on the line
  const zk = b0 ? Math.min(k * 2.2, (ZW - 30) / (b0[2] * 1920)) : k;
  const cx = (b0 ? b0[0] + b0[2] / 2 : 0.5) * 1920 * zk, cy = (b0 ? b0[1] + b0[3] / 2 : 0.5) * 1080 * zk;
  const zoom = b0 ? `<div class="tw-zoom"><img src="${page}" style="width:${px(1920 * zk)};left:${px(ZW / 2 - cx)};top:${px(ZH / 2 - cy)}"><i class="tw-hl" style="left:0;right:0;top:${px(ZH / 2 - b0[3] * 1080 * zk / 2)};height:${px(b0[3] * 1080 * zk)}"></i></div>` : '';
  return desk(shot.shotId, t)
    + `<div class="tw-win dim" style="left:30px;top:90px;width:800px;height:230px;z-index:1;border:none;box-shadow:none;background:transparent">${tile(tiles.map)}</div>`
    + win({ x: 850, y: 109, w: 1040, h: 535, bar: 'blue', scroll: true, z: 2, body: page ? `<div style="position:absolute;inset:0;background:${t.paper}"><img src="${page}" style="position:absolute;left:${px(left)};top:${px(top)};width:${px(imgW)}">${hl}</div>` : '' })
    + (b0 ? win({ x: 1159, y: 620, w: 614, h: 322, bar: 'green', z: 3, body: `<div style="position:absolute;inset:0;background:${t.paper}">${zoom}</div>` }) : '')
    + (tag ? `<div class="tw-tag line" style="left:120px;top:250px;height:120px;max-width:700px;z-index:3"><span class="tw-px" data-twfit="700" data-twmax="80" style="font-size:80px;color:#eef4ea">${esc(tag)}</span></div>` : '')
    + (big ? bigLines(big).map((l, i) => `<div class="tw-px" data-twfit="${i ? 520 : 780}" data-twmax="${i ? 150 : 250}" style="position:absolute;left:120px;top:${i ? 700 : 420}px;font-size:200px;color:#f2f6ee;z-index:3">${esc(l).replace(/(\d[\d,.]*)/, `<span style="color:${t.violet}">$1</span>`)}</div>`).join('') + `
      <div style="position:absolute;left:120px;top:900px;width:640px;height:6px;z-index:3;background:repeating-linear-gradient(90deg,${t.violet} 0 8px,transparent 8px 12px)"></div>` : '')
    + fx;
}

function sidePanel({ shot, resolved, world, ctx, full = true }) {
  const t = world.tokens, tiles = ctx.tiles;
  const s = shot.slots || {};
  const title = s.title?.text || '';
  const lines = String(s.kicker?.text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const latin = lines.find((l) => /^[\x20-\x7e]+$/.test(l)) || (s.annotation?.sub && /^[\x20-\x7e]+$/.test(s.annotation.sub) ? s.annotation.sub : '');
  const rest = lines.filter((l) => l !== latin);
  const hot = s.annotation?.text || '';
  const prop = resolved.main?.url;
  return `<img src="${resolved.background?.url || ''}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
    + `<i class="tw-guide" style="left:22px;top:52px;width:740px;height:640px"></i><i class="tw-cross" style="left:10px;top:40px"></i><i class="tw-cross" style="left:750px;top:680px"></i>`
    + win({ x: 40, y: 75, w: 700, h: 597, bar: 'blue', scroll: true, z: 3, body: `
      <div class="tw-px" data-twfit="${prop ? 400 : 620}" data-twmax="180" style="position:absolute;left:30px;top:52px;font-size:170px">${esc(title)}</div>
      ${latin ? `<div class="tw-mono" style="position:absolute;left:34px;top:250px;font-size:44px">${esc(latin)}</div>` : ''}
      ${rest.length ? `<div class="tw-tag" style="left:34px;top:${latin ? 318 : 268}px;height:74px"><span class="tw-px" style="font-size:46px">${esc(rest.join('  '))}</span></div>` : ''}
      ${hot ? `<div class="tw-tag violet" style="left:30px;top:${latin ? 418 : 368}px;height:112px;max-width:620px"><span class="tw-px" style="font-size:64px;color:#ff86ff" data-twfit="560" data-twmax="70">${esc(hot)}</span><span class="tw-cursor" style="font-size:64px"></span></div>` : ''}
      ${prop ? `<img src="${prop}" style="position:absolute;right:8px;top:24px;width:210px;height:220px;object-fit:contain;filter:grayscale(1) contrast(1.6) brightness(1.05) sepia(1) hue-rotate(55deg) saturate(1.8);image-rendering:pixelated;opacity:.92">` : ''}` })
    + (full ? win({ x: 40, y: 700, w: 380, h: 220, z: 2, body: tile(tiles.map) }) + win({ x: 440, y: 735, w: 260, h: 185, z: 2, body: tile(tiles.orbit) }) : '')
    + `<div class="tw-scan" style="z-index:40;opacity:.35"></div>`;
}

function chipsDiagram({ shot, world, ctx }) {
  const t = world.tokens, r = rng(shot.shotId), tiles = ctx.tiles;
  const m = shot.slots?.data?.mechanism || {};
  const cut = (m.steps || []).find((x) => x.do === 'cut');
  const flow = (m.steps || []).find((x) => x.do === 'flow');
  const title = shot.slots?.title?.text || cut?.label || '';
  const label = flow?.label || shot.slots?.title?.text || '';
  return desk(shot.shotId, t)
    + win({ x: 10, y: 10, w: 820, h: 220, dim: true, body: tile(tiles.map) })
    + win({ x: 1220, y: 6, w: 690, h: 300, dim: true, body: tile(tiles.globe) })
    + win({ x: 4, y: 250, w: 220, h: 470, z: 1, body: meters(r, 12) })
    + win({ x: 12, y: 760, w: 260, h: 300, z: 1, body: tile(tiles.radar) })
    + win({ x: 290, y: 860, w: 1600, h: 190, z: 1, body: `<div style="position:absolute;inset:0">${ticker(r)}</div>` })
    + win({ x: 247, y: 166, w: 1504, h: 683, bar: 'blue', scroll: true, z: 3, body: `
      <div class="tw-px" data-twfit="1300" data-twmax="190" style="position:absolute;left:70px;top:30px;font-size:170px;color:${t.violet};text-shadow:0 0 14px rgba(208,76,255,.45)">${esc(title)}</div>
      <img src="${tiles.chips || ''}" style="position:absolute;left:30px;top:250px;width:1420px;height:390px;object-fit:cover;image-rendering:pixelated">
      ${label && label !== title ? `<div class="tw-tag line" style="left:510px;top:236px;height:62px"><span class="tw-px" style="font-size:40px">${esc(label)}</span></div>` : ''}` })
    + fx;
}

// [[word]] marks the keyword (violet), a newline breaks the line
const marked = (t, color) => esc(t).replace(/\[\[(.+?)\]\]/g, `<span style="color:${color}">$1</span>`).replace(/\n/g, '<br>');

// two questions on either side of the presenter: two windows, title, tag, a panel tile
function posterPair({ shot, resolved, world, ctx, full = true }) {
  const t = world.tokens, tiles = ctx.tiles, s = shot.slots || {};
  const side = (x, title, tag, tl, bar) => win({ x, y: 150, w: 520, h: 700, bar, z: 3, body: `
      <div class="tw-px" data-twbox="460,330" style="position:absolute;left:30px;top:40px;width:460px;font-size:120px;line-height:1.1;white-space:normal">${marked(title?.text || '', t.violet)}</div>
      ${full ? `<div style="position:absolute;left:30px;right:30px;top:390px;height:190px;border:2px solid ${t.dim}">${tile(tl)}</div>` : ''}
      ${tag?.text ? `<div class="tw-tag" style="left:30px;top:600px;height:66px"><span class="tw-px" style="font-size:40px">${esc(tag.text)}</span></div>` : ''}` });
  return `<img src="${resolved.background?.url || ''}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
    + side(120, s.leftTitle, s.leftTag, tiles.radar, 'blue') + side(1280, s.rightTitle, s.rightTag, tiles.globe, 'green')
    + `<div class="tw-scan" style="z-index:40;opacity:.35"></div>`;
}

// a product beside the presenter: a window with the model in big pixel type, the real product picture
function productCard({ shot, resolved, world }) {
  const t = world.tokens, s = shot.slots || {};
  const prod = resolved.product?.url;
  return `<img src="${resolved.background?.url || ''}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
    + win({ x: 1150, y: 200, w: 640, h: 660, bar: 'blue', scroll: true, z: 3, body: `
      ${s.cardTop?.text ? `<div class="tw-mono" style="position:absolute;left:30px;top:24px;font-size:30px">${esc(s.cardTop.text)}</div>` : ''}
      <div class="tw-px" data-twfit="540" data-twmax="190" style="position:absolute;left:28px;top:76px;font-size:170px">${esc(s.model?.text || '')}</div>
      ${prod ? `<img src="${prod}" style="position:absolute;left:30px;right:30px;top:280px;width:560px;height:220px;object-fit:contain;filter:grayscale(1) sepia(.4) hue-rotate(50deg) saturate(.7) contrast(1.1)">` : ''}
      ${s.label?.text ? `<div class="tw-tag violet" style="left:28px;top:530px;height:84px"><span class="tw-px" style="font-size:50px;color:#ff86ff">${esc(s.label.text)}</span><span class="tw-cursor" style="font-size:50px"></span></div>` : ''}` })
    + `<div class="tw-scan" style="z-index:40;opacity:.35"></div>`;
}

// any other card: the card itself in the main window (scaled whole), side columns of panel windows,
// a ticker strip under it, small windows at the edges (the density of the style frames)
function framed({ shot, parts, world, ctx }) {
  const t = world.tokens, r = rng(shot.shotId + ':f'), tiles = ctx.tiles || {};
  const k = 0.7, MW = Math.round(W * k), MH = Math.round(H * k);
  const X = 262, Y = 84;
  const pick = (i) => [tiles.radar, tiles.globe, tiles.orbit, tiles.map][(i + Math.floor(r() * 4)) % 4];
  return desk(shot.shotId, t)
    + win({ x: 10, y: 6, w: 640, h: 200, dim: true, body: tile(tiles.map) })
    + win({ x: 1060, y: 4, w: 420, h: 82, dim: true, body: meters(r, 2) })
    + win({ x: 22, y: 232, w: 252, h: 470, z: 2, body: meters(r, 13) })
    + win({ x: 22, y: 728, w: 252, h: 300, z: 2, body: tile(pick(0)) })
    + win({ x: X + MW + 22, y: 40, w: W - (X + MW + 22) - 18, h: 300, z: 2, body: tile(pick(1)) })
    + win({ x: X + MW + 22, y: 364, w: W - (X + MW + 22) - 18, h: 250, z: 2, body: meters(r, 6) })
    + win({ x: X + MW + 22, y: 638, w: W - (X + MW + 22) - 18, h: 270, z: 2, body: tile(pick(2)) })
    + win({ x: X, y: Y + MH + 40, w: MW, h: 58, z: 2, body: `<div style="position:absolute;inset:0">${ticker(r)}</div>` })
    + win({ x: X, y: Y, w: MW, h: MH + 32, bar: 'blue', z: 3, body: `<div class="tw-card" data-k="${k}" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${k});transform-origin:0 0">${parts}</div>` })
    + fx;
}

const LAYOUTS = { 'title-hero-over-photo': titleOverPhoto, 'screen-full': newsPage, 'presenter-side-card': sidePanel, 'poster-pair': posterPair, 'product-side-card': productCard };

const isPresenterCard = (recipe, shot) => /^presenter|^poster-pair|^product-side-card/.test(recipe.layoutId) || /presenter/.test(shot.slots?.background?.asset || '');

// The world's type system (DESIGN-method.md, 排版): two faces (pixel only for show-moment headlines, a heavy
// sans for everything else, mono for small labels), four sizes (168 / 96 / 48 / 28, in frame pixels), text
// edges on a 12-column grid with 96 px margins, headlines on three anchors. Runs in the page after the
// world's own fitting and before the line's FIT_TEXT: every text element is snapped to the largest size
// of the scale that still fits its slot (wrapping allowed), never to an in-between size.
export const TYPE_SCALE = [168, 96, 48, 28];
const typeScript = `<script>document.fonts.ready.then(()=>{const S=${JSON.stringify(TYPE_SCALE)};const M=96,COL=(1920-2*M)/12;
const snapSize=(px)=>{for(const s of S){if(px>=s*0.82)return s}return S[S.length-1]};
const lvl=document.querySelector('[data-twlevel]')?.dataset.twlevel||'medium';
const els=(()=>{const set=new Set();const tw=document.createTreeWalker(document.querySelector('.stage')||document.body,NodeFilter.SHOW_TEXT);while(tw.nextNode()){const n=tw.currentNode;if(!n.textContent.trim())continue;let e=n.parentElement;if(e.closest('.subtitle,.credit,.todo,.tw-tick,.tw-win.dim,script,style'))continue;set.add(e)}return [...set]})();
for(const e of els){if(e.closest('.subtitle,.credit,.todo,.tw-tick'))continue;if(!e.textContent.trim())continue;
 const q=(()=>{const pr=document.createElement('i');pr.style.cssText='position:absolute;width:1000px;height:1px;visibility:hidden';e.parentElement.appendChild(pr);const k=pr.getBoundingClientRect().width/1000||1;pr.remove();return k})();
 const cs=getComputedStyle(e);let px=parseFloat(cs.fontSize)*(+e.style.zoom||1)*q;if(!px)continue;
 const pixel=e.classList.contains('tw-px')&&lvl==='full'&&px>=90;
 let s=snapSize(px);
 e.style.zoom='';
 e.style.fontFamily=pixel?"'A1 Pixel','PingFang SC',monospace":s<=28?"'SF Mono',Menlo,'PingFang SC',monospace":"'A1 Sans Heavy','PingFang SC',sans-serif";
 if(!pixel){e.style.webkitTextStroke='0';e.style.textShadow='none';e.style.letterSpacing=s>=96?'-0.01em':'0'}
 e.style.fontSize=(s/q)+'px';
 const box=(e.closest('.slot')||e.parentElement).getBoundingClientRect();
 for(let i=S.indexOf(s);i<S.length;i++){e.style.fontSize=(S[i]/q)+'px';const r=e.getBoundingClientRect();if(r.right<=box.right+2*q&&r.bottom<=box.bottom+2*q&&e.scrollWidth<=e.clientWidth+2)break;if(i===S.length-1)break;if(S[i+1]>=48&&!pixel)e.style.whiteSpace='normal'}
}
// grid: the frame's text block moves together so its headline sits on an anchor: left edge at 120 (or centred
// when it was centred), top at 150 / 420 / 700 (frame pixels, measured as drawn)
if(lvl!=='full'){const textSlots=[...document.querySelectorAll('.slot[data-slot]')].filter(sl=>!/^(background|backdrop|plate|panel|main|screen|product|leftCard|rightCard|base)$/.test(sl.dataset.slot)&&sl.textContent.trim()&&!sl.closest('.tw-win.dim'));
 let head=null,hh=0;for(const sl of textSlots){const tw=document.createTreeWalker(sl,NodeFilter.SHOW_TEXT);while(tw.nextNode()){if(!tw.currentNode.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(tw.currentNode);const r=rg.getBoundingClientRect();if(r.height>hh){hh=r.height;head={sl,r}}}}
 if(head&&hh>=40){const q=(()=>{const pr=document.createElement('i');pr.style.cssText='position:absolute;width:1000px;height:1px;visibility:hidden';head.sl.parentElement.appendChild(pr);const k=pr.getBoundingClientRect().width/1000||1;pr.remove();return k})();
  const r=head.r;const cx=(r.left+r.right)/2;const centred=Math.abs(cx-960)<120;const dx=centred?960-cx:120-r.left;const ay=[150,420,700].reduce((b,v)=>Math.abs(v-r.top)<Math.abs(b-r.top)?v:b);const dy=Math.abs(ay-r.top)<=200?ay-r.top:0;
  // only move when the whole block stays in frame
  let ok=true;for(const sl of textSlots){const b=sl.getBoundingClientRect();if(b.left+dx<60||b.right+dx>1860||b.top+dy<40||b.bottom+dy>1000){ok=false;break}}
  if(ok)for(const sl of textSlots){sl.style.translate=(dx/q)+'px '+(dy/q)+'px'}}}
document.body.dataset.twtype='1'})</script>`;

// a thin window around a real frame: title bar and border only, the material untouched
const chrome = (t) => `<div style="position:absolute;inset:0;z-index:30;pointer-events:none;border:3px solid ${t.line};box-shadow:inset 0 0 0 2px #000"></div>
<div class="tw-bar" style="z-index:31;height:26px"></div><div class="tw-btns" style="z-index:32;top:3px"><i></i><i></i><i></i></div>`;

// medium: the card in one large window on a quiet desk (no panel columns)
function medium({ shot, parts, world }) {
  const k = 0.9, MW = Math.round(W * k), MH = Math.round(H * k);
  return desk(shot.shotId, world.tokens)
    + win({ x: (W - MW) / 2, y: 40, w: MW, h: MH + 32, bar: 'blue', z: 3, body: `<div class="tw-card" data-k="${k}" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${k});transform-origin:0 0">${parts}</div>` })
    + `<div class="tw-scan" style="z-index:40;opacity:.4"></div>`;
}

export function worldFrame({ recipe, shot, parts, resolved, world, focus }) {
  const ctx = resolved.__world || {};
  const css = worldCss(world.tokens);
  const id = recipe.layoutId;
  const level = ctx.intensity || 'medium';
  const mark = `<i data-twlevel="${level}" style="display:none"></i>`;
  if (level === 'none') return { content: parts, css, ownsFocus: false };
  const T = mark + typeScript;
  if (level === 'light') return { content: parts + chrome(world.tokens) + T, css, ownsFocus: false };
  if (level === 'full') {
    if (LAYOUTS[id] && (!/presenter-side-card|poster-pair|product-side-card/.test(id) || resolved.background?.url)) {
      return { content: LAYOUTS[id]({ shot, resolved, world, ctx, focus, full: true }) + fitScript + T, css, ownsFocus: true, noSubtitle: id === 'title-hero-over-photo' };
    }
    if (id === 'mechanism-3d') {
      const m = shot.slots?.data?.mechanism || {};
      const chips = (m.parts || []).filter((p) => p.kind === 'chip').length === 2 && (m.parts || []).some((p) => p.kind === 'link');
      if (chips && ctx.tiles?.chips) return { content: chipsDiagram({ shot, world, ctx }) + fitScript + T, css, ownsFocus: true };
    }
  }
  // medium: presenter cards keep the real plate with the world's card on it (no panel windows)
  if (/presenter-side-card|poster-pair|product-side-card/.test(id) && resolved.background?.url && LAYOUTS[id]) {
    return { content: LAYOUTS[id]({ shot, resolved, world, ctx, focus, full: false }) + fitScript + T, css, ownsFocus: true };
  }
  if (isPresenterCard(recipe, shot)) return { content: parts + '<div class="tw-scan" style="z-index:40;opacity:.3"></div>' + T, css, ownsFocus: false };
  return { content: medium({ shot, parts, world }) + fitScript + T, css, ownsFocus: false };
}
