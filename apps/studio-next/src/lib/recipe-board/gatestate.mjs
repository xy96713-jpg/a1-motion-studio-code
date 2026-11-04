// The film's three gates, the part every module may read without reaching the line (gates.mjs has the rest: what a
// gate is bound to, the look sheet, the approvals). Pure but for the project file: the web pages import it through
// layers.mjs and chapter.mjs, so it imports nothing beyond store.mjs (the passages page must not compile run.mjs).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadProject, projectPaths } from './store.mjs';

export const SIX = 'six-stage';
// direction first (the user 2026-10-28: 粗稿可以很低精度几何模块 … 确保全篇方向 再一镜镜渲染): the whole film as a greybox
// rough (greybox.mjs), before any hero still or chapter is built; a film whose look was approved before it keeps its gates
export const LEGACY_GATES = ['direction', 'look', 'rough', 'final'];
// the design set (the user 2026-10-28: 按你推荐的都执行好 — 客观 专业 规范 高效): a studio's two client gates. DESIGN: the
// greybox motion rough (the telling, the timing, the seams) with the style frames and the film's board, judged in one
// sitting — the structure is the greybox, so no separate structure gate; FINAL: the polished film before the fine render.
// The technical gate (the final's preflight) is the line's own. New films are made on it (store.mjs gateSet: 'design').
export const GATES = ['design', 'final'];
export const designSet = (p) => p?.process === SIX && p?.gateSet === 'design';
// the greybox changed or sent back since the design was approved on it (greybox.mjs approvedGreybox; read here without it)
function greyboxStaleOf(cfg, id, p) { try { const c = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'tasks', 'greybox.check.json'), 'utf8')); return !(c?.ok && c.answerHash === p.design?.greybox); } catch { return true; } }
export const sixStage = (p) => p?.process === SIX;
// (pure, tested) what the user approved or liked, locked for these beats (project.json userLocked: { B01: "<their words>" }; the
// user 2026-10-28: 之前版本是拓很宽啊 就三个字 — the open the user liked was redone on reviewers' taste): carried in the task of
// every step that draws those beats, so a writer keeps it; null when none of them is locked (a task's input is unchanged)
export const userLockedOf = (p, beats) => { const L = Object.fromEntries(Object.entries(p?.userLocked || {}).filter(([b]) => beats.includes(b))); return Object.keys(L).length ? L : null; };
// the stages that run before the look is approved (run.mjs): stage 1 and the plans the key frames are drawn from
// (the screens, the materials and their fetch too: the hero stills shown at the look are made with what is in hand —
// the user 2026-10-27, materials before design)
export const BEFORE_LOOK = ['plan', 'voice', 'brief', 'storyboard', 'write', 'facts', 'screen', 'materials', 'fetch', 'passages'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
export const pieceKey = (s) => sha(String(s));

// (pure, tested) the gates of a project as they stand: the first one not passed is the one the line waits on
// verdict: the user's verdict on the film's style (styles.json verdict): a rejected style never passes the look
// film: a design-first film's look ({ designFirst, ready: the hero stills passed their blind review, board: its hash now })
export function gatesOf(p, { structure = null, pieces = null, verdict = null, film = null, greybox = undefined, greyboxReviewed = undefined } = {}) {
  if (!sixStage(p)) return { six: false, waiting: null };
  if (designSet(p)) {
    const style = !p.style ? 'the film has no style yet (project.json style)' : verdict?.state === 'rejected' ? `the user rejected the style ${p.style} (${verdict.said})` : p.lettering !== 'eva' ? 'a new film is lettered eva' : null;
    const design = style ? { ok: false, why: style }
      : p.design?.approved ? { ok: true, why: `approved by ${p.design.by} ${p.design.at}`, since: (greybox !== undefined && greybox && p.design.greybox !== greybox) || (film?.board && p.design.board && p.design.board !== film.board) ? 'the greybox or a style frame changed since you approved the design: you see it in the rough at the final' : null }
      : greybox === null ? { ok: false, making: true, why: 'the greybox rough is being made (tasks/greybox.task.json)' }
      : greyboxReviewed === false ? { ok: false, making: true, why: 'the greybox rough is being reviewed blind (tasks/greybox-review.task.json)' }
      : film?.designFirst && !film.ready ? { ok: false, making: true, why: 'the style frames are being made and reviewed blind' }
      : { ok: false, ready: true, why: 'the design waits for you: the greybox rough (out/greybox/greybox.mp4, sheet.png), the style frames and the board (out/look/sheet-hero.jpg, out/film/board.png)' };
    const approvedPieces = p.final?.approved ? p.final.pieces || {} : {}, changed = pieces ? Object.keys(pieces).filter((k) => approvedPieces[k] !== pieces[k]) : [];
    const final = !p.final?.approved ? { ok: false, ready: !!(pieces && Object.keys(pieces).length), pending: pieces ? Object.keys(pieces) : [], why: `the polished film waits for you before the fine render${design.since ? ` (${design.since})` : ''}` }
      : changed.length ? { ok: false, ready: true, pending: changed, why: `changed since you approved the film: ${changed.join(', ')}; they wait for you again (the rest renders)` } : { ok: true, pending: [], why: `approved by ${p.final.by} ${p.final.at}` };
    // (the older gates read off the design: code that asks for the look, the direction or the structure finds them with it)
    return { six: true, set: 'design', design, direction: design, look: design, rough: design, final, waiting: !design.ok ? 'design' : !final.ok ? 'final' : null };
  }
  const direction = !p.direction?.approved && p.look?.approved ? { ok: true, why: 'the look was approved before the direction gate existed' }
    : !p.direction?.approved ? { ok: false, why: greybox ? 'the greybox rough waits for you (out/greybox/sheet.png, greybox.mp4)' : 'the greybox rough is being made (tasks/greybox.task.json)' }
    : greybox !== undefined && greybox && p.direction.hash !== greybox ? { ok: false, stale: true, why: 'the greybox changed since you approved the direction; it waits for you again' }
    : { ok: true, why: `approved by ${p.direction.by} ${p.direction.at}` };
  // (a new film is lettered eva, the six faces by its style; gothic-kaiso stays with the film it was made for: conflict 5)
  const look = !p.style ? { ok: false, why: 'the film has no style yet (project.json style, from routing/styles.json)' }
    : verdict?.state === 'rejected' ? { ok: false, why: `the user rejected the style ${p.style} (${verdict.said}); take an approved one (styles.json verdict)` }
    : p.lettering !== 'eva' ? { ok: false, why: `a new film is lettered eva (project.json lettering: "eva"; "${p.lettering ?? 'none'}" stays with the films made before)` }
    : p.look?.approved && p.look.style === p.style ? { ok: true, why: `approved by ${p.look.by} ${p.look.at}`, since: film?.designFirst && film.board && p.look.board !== film.board ? 'the film\'s design or a hero still changed since you approved the look: you see it in the rough at the final' : null }
    : p.look?.approved ? { ok: false, why: `the style changed (${p.look.style} → ${p.style}) since the look was approved; it waits for you again` }
    : film?.designFirst && !film.ready ? { ok: false, making: true, why: 'the film\'s design and its hero stills are being made and reviewed blind; the look is shown to you once they pass' }
    : { ok: false, why: `the look waits for you (out/look/sheet.jpg${film?.designFirst ? ', the hero stills and the film\'s board out/film/board.png' : ''})` };
  const rough = !p.rough?.approved ? { ok: false, why: 'the structure white model waits for you (out/animatic.mp4)' }
    : structure && p.rough.hash !== structure ? { ok: false, stale: true, why: 'the structure changed since you approved it (a beat, a form, a device or a cut); the white model waits for you again' }
    : { ok: true, why: `approved by ${p.rough.by} ${p.rough.at}` };
  const approvedPieces = p.final?.approved ? p.final.pieces || {} : {};
  const changed = pieces ? Object.keys(pieces).filter((k) => approvedPieces[k] !== pieces[k]) : [];
  const final = !p.final?.approved ? { ok: false, ready: !!(pieces && Object.keys(pieces).length), pending: pieces ? Object.keys(pieces) : [], why: `the polished rough film waits for you before the fine render${look.since ? ` (${look.since})` : ''}` }
    : changed.length ? { ok: false, ready: true, pending: changed, why: `changed since you approved the film: ${changed.join(', ')}; they wait for you again (the rest renders)` }
    : { ok: true, pending: [], why: `approved by ${p.final.by} ${p.final.at}` };
  const waiting = !direction.ok ? 'direction' : !look.ok ? 'look' : !rough.ok ? 'rough' : !final.ok ? 'final' : null;
  return { six: true, direction, look, rough, final, waiting };
}

// (pure, tested) may this piece be rendered fine: on a six-stage film, only as the user approved it
export const finalAllowsOf = (p, piece, hash) => !sixStage(p) || (!!p.final?.approved && p.final.pieces?.[piece] === hash);
export const finalAllows = (cfg, id, piece, hash) => finalAllowsOf(loadProject(cfg, id) || {}, piece, hash);
// the polish loop (blind reviews) runs once the structure is approved: no review is spent on a telling that may change
// (the design and the look are approved once — the user 2026-10-28: 定样子/定设计只批一次，之后改动不重开、不挡章节，集中到成片预览给我看;
// what changes after is shown at the final, the one gate before the fine render)
export const polishOpen = (cfg, id) => { const p = loadProject(cfg, id) || {}; if (designSet(p)) return !!p.design?.approved; return !sixStage(p) || (!!p.look?.approved && p.look.style === p.style && !!p.rough?.approved); };

// (pure helpers + IO) ⑧ 导演分镜/整片设计未钉死就开工的拦截
// greybox-advance: need accepted filmdesign + current storyboard (design-set)
// session-brief / morph: need design gate approved (polishOpen / design.approved)
export function chapterStartPinErrors(p) {
  if (!designSet(p)) return [];
  if (!p?.design?.approved) return ['chapter morph / session-brief blocked: design gate not approved yet (gate --approve design)'];
  return [];
}

export async function greyboxAdvancePinErrors(cfg, id) {
  const p = loadProject(cfg, id) || {};
  if (!designSet(p)) return [];
  const e = [];
  const F = await import('./filmdesign.mjs');
  if (!F.acceptedFilmDesign(cfg, id)) e.push('greybox-advance blocked: filmdesign not accepted yet (tasks/filmdesign.check.json must be ok)');
  try {
    const SB = await import('./storyboard.mjs');
    const st = SB.storyboardState(cfg, id);
    if (st.state === 'blocked') e.push('greybox-advance blocked: storyboard blocked (needs accepted brief for current plan)');
    else if (st.state !== 'current') e.push(`greybox-advance blocked: storyboard is ${st.state} (need current — pin 分镜 before greybox)`);
  } catch (err) {
    e.push(`greybox-advance blocked: storyboard check failed (${String(err.message || err).split('\n')[0]})`);
  }
  return e;
}

export const lookOpen = (cfg, id) => { const p = loadProject(cfg, id) || {}; if (designSet(p)) return !!p.design?.approved; return !sixStage(p) || (!!p.look?.approved && p.look.style === p.style); };
// the hero stills and the chapters wait for the direction (greybox.mjs): nothing is built before the film's layout is settled
export const directionOpen = (cfg, id) => { const p = loadProject(cfg, id) || {}; if (designSet(p)) return true; return !sixStage(p) || !!p.direction?.approved || !!p.look?.approved; };
// the steps a six-stage film does not take where an older film does: its world is picked at the look gate (no concept
// pick), and the stills' critique and the director's rounds are polish, after the structure (gate rough). The banana
// blind test of 2026-10-26 asked the user to pick a world twice and wrote polish tasks before the white model
// a six-stage film's final is made of its chapters and hero stills only (animatic.mjs finalPlan): the card line's motion,
// critique and direct of the same beats were work no frame of it used, and a to-do list that never emptied (Suez: 13 cards
// waiting for an approval no gate gives, critique and direct tasks nobody answered; the user 2026-10-28: 规范 高效的流程)
export const SIX_CARD_STEPS = ['critique', 'direct', 'motion'];
// P0 G3 2026-10-29: six-stage skips concept + critique/direct/motion only — **art still runs** (素材建造 / style-lab plates). Do not treat sixSkips as skipping art.
export const sixSkips = (p, step, polish) => sixStage(p || {}) && (step === 'concept' || SIX_CARD_STEPS.includes(step));   // (polish: kept for the callers; art is NOT in SIX_CARD_STEPS)
