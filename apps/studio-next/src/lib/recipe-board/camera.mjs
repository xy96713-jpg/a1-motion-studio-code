// The camera layer (style-lab/reference-hupo/AESTHETICS.md, 第五节): what makes the reference film look
// shot rather than pasted, as one layer every style and world shares. Measured on the reference's 139
// cuts: packaging frames darken 15–25 L* toward the corners, carry film grain, and flat material (pages,
// paper, tables) is set at an angle with the focus on the line that matters and the rest falling off;
// frames alternate between a dark base (titles, diagrams, people: L* 20–30) and a light base (pages, data,
// chat: L* 60–75). Plain presenter frames are left alone (the reference does not touch them).
//
// cameraFrame(content, { base, plane, focus, vignette, grain }) -> html
//   base: 'dark' | 'light' | null (keep the content's own background)
//   plane: true -> the content is flat material: tilted in perspective, depth of field around `focus`
//   focus: [x, y] in 0–1 of the frame (where the eye should land)
//   vignette: corner darkening strength 0–1 (default 0.7 dark, 0.45 light); grain: 0–1 (default 0.32)
// A dark base is not black: the reference's dark frames sit at L* 30–50 with a lit centre falling off.

export const BASES = { dark: '#1b1d1c', light: '#d8d7d1' };

// which base a shot gets by its role (DIRECTOR-GRAMMAR labels / our cards)
const LIGHT_CARDS = new Set(['screen-full', 'article-highlight-light', 'stamp-over-evidence', 'paper-collage-figures', 'stat-sheet', 'chat-thread', 'data-table-grid', 'market-table', 'data-bar-chart', 'concept-flow', 'concept-trials']);
const NONE_CARDS = new Set(['presenter-plain']);
export function baseFor(recipe) {
  if (NONE_CARDS.has(recipe)) return null;
  return LIGHT_CARDS.has(recipe) ? 'light' : 'dark';
}
export const isPlane = (recipe) => LIGHT_CARDS.has(recipe);

// used inside a stylesheet: plain double quotes (an HTML entity is not decoded there)
const grainSvg = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1'/></filter><rect width='320' height='320' filter='url(%23n)'/></svg>")`;

export function cameraCss() {
  return `
.cam-frame{position:absolute;inset:0;overflow:hidden}
.cam-plane{position:absolute;inset:0;transform-origin:50% 45%}
.cam-dof{position:absolute;inset:0;pointer-events:none;z-index:50}
.cam-vig{position:absolute;inset:0;pointer-events:none;z-index:52}
.cam-light{position:absolute;inset:0;pointer-events:none;z-index:51}
.cam-grain{position:absolute;inset:-20px;pointer-events:none;z-index:53;mix-blend-mode:normal;background-image:${grainSvg};background-size:320px 320px}
`;
}

export function cameraFrame(content, { base = null, plane = false, focus = [0.5, 0.42], vignette = null, grain = 0.32, tilt = null } = {}) {
  const [fx, fy] = focus;
  const v = vignette ?? (base === 'light' ? 0.45 : 0.7);
  // a flat plane leans back and turns a little, like paper on a desk filmed from slightly above-left
  const t = tilt || { x: 9, y: -7, z: 0.6, scale: 1.12 };
  const inner = plane
    ? `<div class="cam-plane" style="transform-origin:${fx * 100}% ${fy * 100}%;transform:perspective(1700px) rotateX(${t.x}deg) rotateY(${t.y}deg) rotateZ(${t.z}deg) scale(${t.scale})">${content}</div>`
    : content;
  // depth of field: sharp around the focus, blurred toward the edges (planes strongly, others softly)
  const blur = plane ? 2.2 : 1.4;
  const dof = `<div class="cam-dof" style="backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);-webkit-mask-image:radial-gradient(ellipse ${plane ? '60% 42%' : '65% 55%'} at ${fx * 100}% ${fy * 100}%,transparent 55%,#000 100%);mask-image:radial-gradient(ellipse ${plane ? '60% 42%' : '65% 55%'} at ${fx * 100}% ${fy * 100}%,transparent 55%,#000 100%)"></div>`;
  // one soft key light on the focus, corners falling off
  // a key light on the focus: soft-light lifts a light page, screen lifts a dark frame (soft-light does nothing on black)
  const light = `<div class="cam-light" style="mix-blend-mode:${base === 'light' ? 'soft-light' : 'screen'};background:radial-gradient(ellipse 50% 45% at ${fx * 100}% ${fy * 100}%,rgba(${base === 'light' ? '255,255,255,.35' : '150,165,155,.22'}),transparent 72%)"></div>`;
  const vig = `<div class="cam-vig" style="background:radial-gradient(ellipse 75% 70% at ${fx * 100}% ${fy * 100}%,transparent 35%,rgba(0,0,0,${v}) 100%)"></div>`;
  const bg = base ? `<div style="position:absolute;inset:0;background:${BASES[base]}"></div>` : '';
  return `<div class="cam-frame">${bg}${inner}${dof}${light}${vig}<div class="cam-grain" style="opacity:${grain * 0.7}"></div></div>`;
}
