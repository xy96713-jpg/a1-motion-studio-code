// The plan's first draft, written from the card (user, 2026-10-22: 导演的数字应该由系统直接算，不靠我手调). The card
// measures the reference sub-shot by sub-shot (camera, look, the pace of its packaging); the director copied those
// numbers into each spec by hand (a push of 1.09, a reveal over 2.7 s), shot after shot, and forgot some. Here every
// measured number becomes its parameter: the cut, the module the reader's device calls for, the camera move (zoom,
// travel, ease, from rest when unasked), the texture, the reveal; every item of the card is answered "match". What
// needs judgement is left blank and named (TODO: which material, which words, which phrase, what a painted ground
// shows): the plan check refuses the plan while one is left (draftErrors).
export const TODO = 'TODO';
const MODULE_OF = { presenter: 'sidecard', 'side-card': 'sidecard', pagecurl: 'sidecard', article: 'article', chat: 'chat', table: 'table', compare3d: 'compare', brand: 'brand', broll: 'insert', diagram: 'steps', title: 'title', quote: 'quote', person: 'person', chart: 'chart', screen: 'screen', market: 'market' };
const r3 = (v) => +v.toFixed(3);

// the measured camera of a sub-shot as a spec.camera move (pure, tested): zoom over the sub-shot, travel in frame widths
// (x > 0 the camera goes right), ease from the share done in the first half; a still camera asks for none
export function cameraOf(c, at, end) {
  if (!c) return [];
  const z = c.zoom || 1, [px, py] = c.pan || [0, 0], still = Math.abs(z - 1) < .03 && Math.abs(px) < .02 && Math.abs(py) < .02;
  if (still) return [];
  // the frame keeps covered: a look aside needs a zoom of 1 + 2|x| (and 1 + 2|y| 16/9 up and down)
  const need = 1 + Math.max(Math.abs(px), Math.abs(py) * 16 / 9) + .02;
  const zFrom = z >= 1 ? need : need / z, zTo = z >= 1 ? need * z : need;
  const ease = c.ease == null ? 'inout' : c.ease > .6 ? 'out' : c.ease < .4 ? 'in' : 'linear';
  return [{ at: r3(at), end: r3(end), from: { zoom: r3(zFrom), x: r3(-px / 2), y: r3(-py / 2) }, to: { zoom: r3(zTo), x: r3(px / 2), y: r3(py / 2) }, ease }];
}
// the look as the shared texture (pure): grain from the measured noise, vignette from the corners' darkening
export function textureOf(l) {
  if (!l) return { grain: .5, vignette: .45 };
  return { grain: r3(Math.min(1, Math.max(.2, (l.grain || 0) / 5))), vignette: r3(Math.min(.8, Math.max(.2, (l.vignette || 0) / 30))), ...(l.base === 'dark' ? { contrast: .3 } : {}) };
}
// one shot a sub-shot (pure, tested)
export function draftShot(r, i) {
  const dev = r.read?.device || 'presenter', module = MODULE_OF[dev] || 'title', at = r.at, end = r.end, a = r.camera?.anim;
  const spec = { camera: cameraOf(r.camera, at, end), texture: textureOf(r.look) };
  if (module === 'sidecard') Object.assign(spec, { presenter: TODO, cards: dev === 'side-card' ? [{ at: r3(at + .2), side: 'right', title: TODO, img: TODO }] : [], tags: [], facts: [] }, dev === 'pagecurl' ? { curl: { at: r3(at + .3), src: TODO } } : {});
  if (module === 'title') Object.assign(spec, { text: TODO, bg: TODO, textAt: r3(at + Math.max(.05, a?.onset ?? .1)), ...(a?.build >= 1 ? { reveal: r3(Math.min(end - at - .2, a.build)) } : {}) });
  if (module === 'person') Object.assign(spec, { photo: TODO, name: TODO, layout: 'full', torn: true, nameAt: r3(at + .15), ...(a?.build >= 1 ? { reveal: r3(Math.min(end - at - .4, a.build)) } : {}) });
  if (module === 'article') Object.assign(spec, { src: TODO, hide: [TODO], beats: [{ at: r3(at + .1), do: 'highlight', phrase: TODO, style: 'yellow' }] });
  if (module === 'insert' || module === 'brand') Object.assign(spec, { src: TODO }, module === 'brand' ? { name: TODO } : {});
  if (module === 'quote') Object.assign(spec, { photo: TODO, lines: [{ at: r3(at + .2), text: TODO }] });
  if (module === 'chat') Object.assign(spec, { title: TODO, messages: [{ at: r3(at + .5), avatar: TODO, text: TODO }] });
  if (module === 'market') Object.assign(spec, { mode: /K线|K 线|蜡烛/.test(r.read?.shows || '') ? 'candles' : 'board', day: TODO, from: TODO });
  if (['table', 'compare', 'chart', 'steps', 'screen'].includes(module)) spec.todo = `${module}: fill its content (prompts/shotplan.md)`;
  return { id: `S${i + 1}`, module, at: r3(at), end: r3(end), why: `${r.id}：${r.read?.shows || ''}（草稿：拆解卡实测的运镜、质感、节奏已填）`, spec: JSON.stringify(spec) };
}
const HOW = { cut: '镜头边界落在这个切点', camera: '拆解卡实测的推拉、平移、缓动已写进 spec.camera', look: '拆解卡实测的颗粒、暗角已写进 texture', type: '大字照拆解卡的位置和大小', events: '元素按拆解卡实测的节奏出现', layers: '按拆解卡分层' };
// the whole draft (pure, tested): a shot a sub-shot on the card's cuts, every item answered, the style the reference's
// seed: the design seed (scriptcard.mjs): each shot of a module takes one of its variants, never the same twice running;
// a film made from its script alone also draws its style among those that fit its subject (styles, topic)
export async function draftFromCard(card, { seed = card.seed ?? null, styles = null, topic = '' } = {}) {
  const shots = card.subs.map(draftShot);
  if (seed != null) { const { chooseVariants } = await import('./scriptcard.mjs'), vs = chooseVariants(shots.map((s) => s.module), seed);
    shots.forEach((s, i) => { const v = vs[i]; if (!v) return; const sp = JSON.parse(s.spec);
      if (s.module === 'article') (sp.beats || []).forEach((b) => { if (b.do === 'highlight') b.style = v.style; }); else Object.assign(sp, v);
      s.spec = JSON.stringify(sp); s.why += `（设计种子 ${seed}：${JSON.stringify(v)}）`; }); }
  let style = { id: 'editorial-grey', why: `${TODO}：按这部片的主题选风格（原片自己的样子是 editorial-grey）` };
  if (card.source === 'norms' && styles) { const { rng } = await import('./scriptcard.mjs'), r = rng((seed ?? 1) ^ 0x2f6b), ids = Object.keys(styles), fit = ids.filter((k) => (styles[k].fits || []).some((w) => String(topic).includes(w)));
    const pool = fit.length ? fit : ids, id = pool[Math.floor(r() * pool.length) % pool.length]; style = { id, why: `${fit.length ? `主题里有 ${styles[id].fits.filter((w) => String(topic).includes(w)).join('、')}` : '主题没有对上的风格'}，设计种子 ${seed} 从${fit.length ? '合适的' : '全部'}风格里选了${styles[id].title}` }; }
  return { style, reference: [], shots, requests: [], follows: card.items.map((it) => ({ item: it.item, does: 'match', how: HOW[it.item.split('.')[1]] || '照拆解卡做' })) };
}
// (pure, tested) the draft's blanks for material filled from the film's library (entitylib.mjs filmLibrary): the entity a
// sub-shot's reading names gives a person card its photograph and name, a mark its logo, a side card its product
// (user, 2026-10-22: 系统要很聪明的知道怎么高效率执行: the director filled these by hand, shot after shot); what the reading
// does not name stays TODO
export function fillFromLibrary(draft, card, library = []) {
  const byRole = (e, ...roles) => roles.map((r) => (e.pictures || []).find((p) => p.role === r)).find(Boolean)?.path || null;
  const latin = (e) => e.names.find((n) => /^[\x20-\x7e]+$/.test(n) && /[A-Za-z]/.test(n)) || null;
  const zh = (e) => e.names.find((n) => /[\u4e00-\u9fff]/.test(n)) || e.names[0];
  for (const [i, sh] of draft.shots.entries()) {
    const r = card.subs[i], said = [r?.read?.shows, r?.read?.layers, r?.text?.map?.((t) => t.text).join(' ')].filter(Boolean).join(' ');
    const e = library.find((x) => x.names.some((n) => [...n].length >= 2 && said.includes(n))); if (!e) continue;
    const sp = JSON.parse(sh.spec), set = (k, v) => { if (sp[k] === TODO && v) sp[k] = v; };
    if (sh.module === 'person') { set('photo', byRole(e, 'portrait', 'still')); set('name', zh(e)); if (latin(e) && !sp.en) sp.en = latin(e); }
    if (sh.module === 'brand') { set('src', byRole(e, 'logo', 'place')); set('name', latin(e) || zh(e)); }
    if (sh.module === 'insert' && /总部|大楼|门口|招牌|headquarters/i.test(said)) set('src', byRole(e, 'place'));
    if (sh.module === 'quote') set('photo', byRole(e, 'portrait', 'still'));
    if (sh.module === 'sidecard') for (const c of sp.cards || []) { if (c.img === TODO) c.img = byRole(e, 'product') || TODO; }
    const filled = JSON.stringify(sp); if (filled !== sh.spec) { sh.spec = filled; sh.why += `（资料库：${zh(e)}）`; }
  }
  return draft;
}
// what the director still has to decide (pure, tested): every TODO left in the plan
export function draftErrors(answer) {
  const out = [];
  if (String(answer?.style?.why || '').includes(TODO)) out.push('style: choose the film\'s style for its subject (the draft left it)');
  for (const s of answer?.shots || []) { const n = (String(s.spec).match(/TODO/g) || []).length; if (n) out.push(`${s.id}: ${n} thing(s) the draft left to decide (TODO in its spec: material, words, phrases, the painted ground)`); }
  return out;
}
