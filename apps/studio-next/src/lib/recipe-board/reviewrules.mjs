// What the user has already decided, said once for every reviewer (CONVERGE-20261026 conflicts 4, 8). The three blind
// reviews (a chapter's beats: prompts/morph-review.md; a passage's stills: prompts/stillcheck.md; the whole film:
// prompts/film-review.md) each carried their own copy of the user's calibrations (no red plates, no dress on type, no
// torn paper, the faces are not the review's, 3D smear is motion …), and they drifted apart. Now the lessons that bear
// on a review carry it (routing/lessons.json `review`: what the reviewer holds or never asks for), and one section is
// generated from them into the three prompts between markers (syncReviewPrompts; a test fails when they drift).
// A fix that asks for what the user forbade, or fails what the user allowed, is void by itself (voidFix): it never
// reaches the director (the card line spent three rounds on open S19 for a fix the user's rule had capped).
import fs from 'node:fs';
import path from 'node:path';

// (the taste reviews too: the arbiter's first rule settled a quarrel between a chapter's review and its taste review, and
// the taste reviewers did not read it, 2026-10-28)
export const REVIEW_PROMPTS = ['prompts/morph-review.md', 'prompts/stillcheck.md', 'prompts/film-review.md', 'prompts/taste.md', 'prompts/film-taste.md'];
export const BEGIN = '<!-- user-decided: generated from routing/lessons.json review (node scripts/recipe-board.mjs lessons --sync); edit the lessons, not this -->';
export const END = '<!-- /user-decided -->';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// (pure, tested) a prompt as it was before its section: what its rules hash is taken over (chapter.mjs reviewRulesHash,
// layers.mjs REVIEW_RULES). The user's decisions mostly say what not to fail, and a fix against them is void by itself:
// restating them must not send every passed beat and shot to a reviewer again
export const withoutSection = (text) => withoutProcedure(text).replace(new RegExp(`\\n${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`), '');
// (pure, tested) a prompt without its procedure (how a review is answered: the road to 4's fields, reviewlist.mjs): a
// change to how reviews are answered is not a change to what they score, and sends no passed beat back (2026-10-28: the
// lists' paragraph sent all eleven passed Suez beats back as if hard conditions had been added)
export const withoutProcedure = (text) => String(text).replace(/\n*<!-- procedure:[^>]*-->[\s\S]*?<!-- \/procedure -->/g, '');
export const readLessons = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'lessons.json'), { lessons: [] }).lessons;
// (pure) the lessons in force: one a later decision replaced (supersededBy) is history, never handed out
export const inForce = (lessons) => lessons.filter((l) => !l.supersededBy);
export const reviewLessons = (lessons) => inForce(lessons).filter((l) => l.review?.say);

// (pure, tested) the section every review prompt carries
export function userDecidedSection(lessons) {
  const rows = reviewLessons(lessons), user = rows.filter((l) => l.from !== 'arbiter'), arb = rows.filter((l) => l.from === 'arbiter');
  // the arbiter's rules (arbiter.mjs) under their own heading: rulings between two reviews, the user may overturn them
  return [BEGIN, '', '## 用户已经定的（三份审片规则共用）', '',
    '下面每条都是用户亲口定的，比对标、比你的审美判断都优先。照着判；不要提和它相反的改法（提了也会被系统按这一条作废，白白浪费一轮）。', '',
    ...user.map((l) => `- ${l.review.say}（${l.id}；${String(l.said).split(' ')[0]}）`), '',
    ...(arb.length ? ['### 仲裁定的（两份评审要求相反时裁的，用户授权，可推翻）', '', ...arb.map((l) => `- ${l.review.say}（${l.id}；${String(l.said).split(' ')[0]}）`), ''] : []), END].join('\n');
}
// (pure, tested) a prompt with its section put in place of the old one (or appended once)
export function withSection(text, section) {
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if (a >= 0 && b > a) return text.slice(0, a) + section + text.slice(b + END.length);
  return text.replace(/\s*$/, '\n\n') + section + '\n';
}
export function syncReviewPrompts(cfg, { write = true } = {}) {
  const section = userDecidedSection(readLessons(cfg)), out = [];
  for (const rel of REVIEW_PROMPTS) {
    const f = path.join(cfg.dataDir, rel), was = fs.readFileSync(f, 'utf8'), now = withSection(was, section);
    if (now !== was) { out.push(rel); if (write) fs.writeFileSync(f, now); }
  }
  return out;
}

// ---------------------------------------------------------------- void fixes

// a suggestion that is negated ("不要用撕纸", "别加描边") is in line with the rule, not against it
// (before the match, or inside it: 「加重主次（不用纸条」, 「不用红色或粉红底」)
const NEG = /(不|别|勿|无需|去掉|去除|拿掉|收掉|删掉)[^；;。，,]{0,6}$/, NEG_IN = /不|别|勿|无需/;
const hits = (re, text) => { if (!re) return false; const g = new RegExp(re, 'g'); let m; while ((m = g.exec(text))) { if (!NEG.test(text.slice(Math.max(0, m.index - 10), m.index)) && !NEG_IN.test(m[0])) return true; if (!m[0].length) g.lastIndex++; } return false; };
// (pure, tested) one problem of a fix against the user's rules: void when it complains of what the user allowed or chose
// (review.complains), or when what it asks for is what the user forbade (review.suggests) and it asks for nothing else
// the user's rules leave open; else its forbidden part is struck from the fix and the rest stands
// (keepIf: a problem of the kind the rule leaves to the reviewer — a word the face does not read — is never void by it;
// only the forbidden way of fixing it is struck)
export function voidFix({ say = '', fix = '' }, lessons) {
  const rows = reviewLessons(lessons), kept_ = (l) => l.review.keepIf && new RegExp(l.review.keepIf).test(say);
  const complains = rows.find((l) => !kept_(l) && hits(l.review.complains, say));
  if (complains) return { void: complains.id, why: complains.review.say };
  const parts = String(fix || '').split(/[；;。，,]/).map((x) => x.trim()).filter(Boolean);
  const bad = parts.map((p) => rows.find((l) => hits(l.review.suggests, p)) || null);
  if (!bad.some(Boolean)) return { void: null, fix };
  const kept = parts.filter((_, i) => !bad[i]), ids = [...new Set(bad.filter(Boolean).map((l) => l.id))];
  if (!kept.length && !bad.some((l) => l && kept_(l))) return { void: ids[0], why: rows.find((l) => l.id === ids[0]).review.say };
  return { void: null, struck: ids, fix: `${kept.join('，') || '照问题本身改'}（另提的改法按用户规则 ${ids.join('、')} 不做）` };
}
// (pure, tested) a stillcheck verdict with its void problems taken out: a fix left with none is a pass, noted
export function voidVerdict(v, lessons) {
  if (v?.verdict !== 'fix') return v;
  const notes = [], problems = [];
  let fix = v.fix;
  for (const p of v.problems || []) {
    const r = voidFix({ say: p.say, fix }, lessons);
    if (r.void) { notes.push(`${p.say}（按用户规则 ${r.void} 作废）`); continue; }
    problems.push(p); if (r.struck) fix = r.fix;
  }
  if (!notes.length && fix === v.fix) return v;
  const voided = notes.map((n) => n);
  if (!problems.length) return { ...v, verdict: 'pass', owner: null, problems: [], fix: null, notes: [v.notes, ...voided].filter(Boolean).join('；'), voided };
  return { ...v, problems, fix, voided };
}
