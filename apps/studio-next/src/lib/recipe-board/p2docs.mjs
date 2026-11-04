// P2 hard-input doc wiring 2026-10-29 (a1-motion-4). Measurable file/export checks — no soft aesthetic gates.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** HOUSE mature bars that MATURITY.md must name with their check functions (P2 C4). */
export const MATURITY_FN_LINKS = Object.freeze([
  { bar: 'title-press', fn: 'matureTitlePressErrors', file: 'mature.mjs' },
  { bar: 'evidence-card', fn: 'matureEvidenceCardErrors', file: 'mature.mjs' },
  { bar: 'placeholder', fn: 'maturePlaceholderErrors', file: 'mature.mjs' },
  { bar: 'palette-spine', fn: 'matureSpineErrors', file: 'mature.mjs' },
  { bar: 'mature-hard', fn: 'matureHardErrors', file: 'mature.mjs' },
  { bar: 'mature-first-draft', fn: 'matureFirstDraftErrors', file: 'mature.mjs' },
  { bar: 'read-time', fn: 'readTimeErrors', file: 'typebible.mjs' },
]);

/** D4 absorption rows that TYPE.md must declare (P2 D4). */
export const TYPE_ABSORB_MARKERS = Object.freeze([
  { id: 'read-speed', must: /读速|readTimeErrors/, absorb: /已吸收|进检查/ },
  { id: 'time-is-hierarchy', must: /时间就是层级/, absorb: /已吸收|人读|不可机读|明确不做/ },
  { id: 'tracking-tighten', must: /大字收紧|字距/, absorb: /明确不做|已吸收|不可机读/ },
  { id: 'dark-ground-light-type', must: /深底|浅字/, absorb: /已吸收|部分|明确不做|不可机读/ },
  { id: 'tabular-nums', must: /等宽|counter/, absorb: /已吸收|零件/ },
]);

/** Expired work/* dirs that must carry a README with 过期 (P2 historical HANDOFF). */
export const EXPIRED_HANDOFF_DIRS = Object.freeze([
  'work/screen-production-integration-v1',
  'work/person-packaging-reuse-acceptance-v1',
  'work/reference-study-BV11Ren6REA4',
  'work/system-current-visual-delta-review-v1',
  'work/workflow-alignment-20261009-v1',
  'work/director-agent-integration-20261009-v1',
]);

function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch { return null; }
}

/** C4 — MATURITY.md must mention each HOUSE mature check function by name. */
export function maturityFunctionLinkErrors(maturityMd = '', { libDir = null } = {}) {
  const e = [];
  const md = String(maturityMd || '');
  if (!/P2 C4|HOUSE 成熟硬合同|函数索引/.test(md)) {
    e.push('maturity: missing P2 C4 function-index section header');
  }
  for (const row of MATURITY_FN_LINKS) {
    if (!md.includes(row.fn)) e.push(`maturity: missing function link \`${row.fn}\` for ${row.bar}`);
  }
  if (libDir) {
    for (const row of MATURITY_FN_LINKS) {
      const src = read(path.join(libDir, row.file));
      if (!src) { e.push(`maturity: lib missing ${row.file}`); continue; }
      if (!new RegExp(`export function ${row.fn}\\b`).test(src)) {
        e.push(`maturity: ${row.file} does not export function ${row.fn}`);
      }
    }
  }
  return e;
}

/** D4 — TYPE.md must carry explicit absorb/不做 table for hyperframes borrowings. */
export function typeAbsorbDeclareErrors(typeMd = '') {
  const e = [];
  const md = String(typeMd || '');
  if (!/P2 D4/.test(md)) e.push('type: missing P2 D4 absorb section marker');
  for (const row of TYPE_ABSORB_MARKERS) {
    if (!row.must.test(md)) e.push(`type: P2 D4 missing topic ${row.id}`);
    // topic present but no decision word nearby — soft: whole-doc absorb pattern
    if (row.must.test(md) && !row.absorb.test(md)) e.push(`type: P2 D4 ${row.id} lacks absorb/不做/不可机读 decision`);
  }
  if (!/readTimeErrors/.test(md)) e.push('type: P2 D4 must name readTimeErrors for 读速');
  return e;
}

/** E4 — director README must say 只读 / recipe-board. */
export function directorReadmeErrors(readme = '') {
  const e = [];
  const t = String(readme || '');
  if (!t.trim()) return ['director-readme: missing'];
  if (!/只读|read-only|READ-ONLY/i.test(t)) e.push('director-readme: must say 只读/read-only');
  if (!/recipe-board/.test(t)) e.push('director-readme: must name recipe-board');
  if (!/make\.mjs|出片入口|制片入口/.test(t)) e.push('director-readme: must warn against make.mjs / 制片入口');
  return e;
}

/** I3 — launch.json paths relative OR documented in LAUNCH.md. */
export function launchPathErrors(launchJsonText = '', launchMd = '') {
  const e = [];
  let j;
  try { j = JSON.parse(launchJsonText); } catch {
    return ['launch: launch.json not valid JSON'];
  }
  const args = (j.configurations || []).flatMap((c) => c.runtimeArgs || []);
  const absHome = args.filter((a) => typeof a === 'string' && /^\/Users\//.test(a));
  if (absHome.length) {
    if (!/P2 I3|absolute|本机|retarget|相对/.test(String(launchMd || ''))) {
      e.push(`launch: ${absHome.length} absolute /Users paths but LAUNCH.md missing P2 I3 retarget note`);
    }
  }
  // Prefer relative: at least one config should not hardcode /Users
  const style = (j.configurations || []).find((c) => c.name === 'style-lab-static');
  if (style) {
    const bad = (style.runtimeArgs || []).some((a) => typeof a === 'string' && /^\/Users\//.test(a));
    if (bad) e.push('launch: style-lab-static still uses absolute /Users paths — use repo-relative');
  }
  return e;
}

/** I5 — RESEARCH-agent-motion must be archived/过期 bannered. */
export function researchArchiveErrors(agentMotionMd = '') {
  const e = [];
  const t = String(agentMotionMd || '');
  if (!t.trim()) return ['research-agent-motion: file missing'];
  if (!/P2 I5|过期|归档|ARCHIVE|研究非硬输入/.test(t)) {
    e.push('research-agent-motion: missing P2 I5 archive/过期 banner');
  }
  return e;
}

/** I6 — no live markdown links to missing RESEARCH-any-subject files under recipe-board / style-lab. */
export function researchDeadLinkErrors(repoRoot, {
  scanRoots = ['work/recipe-board-v1'],
} = {}) {
  const e = [];
  const re = /RESEARCH-any-subject[^\s)\]]*/g;
  for (const root of scanRoots) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        if (name === 'node_modules' || name === 'art-cache' || name === '.git') continue;
        const p = path.join(d, name);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p);
        else if (/\.(md|json|mjs|js)$/.test(name)) {
          const text = read(p) || '';
          const hits = text.match(re) || [];
          for (const hit of hits) {
            // allow explicit "缺失/never committed/P2 I6" mentions without pretending the file exists
            const ctx = text.slice(Math.max(0, text.indexOf(hit) - 80), text.indexOf(hit) + hit.length + 80);
            if (/缺失|never|未入库|P2 I6|dead|死链|无此文件/.test(ctx)) continue;
            // if it looks like a path/link, require file exists
            if (/\.md/.test(hit) || /\]\(/.test(ctx) || /见\s*`/.test(ctx) || /见\s+`?RESEARCH/.test(ctx)) {
              const candidate = path.join(path.dirname(p), hit.replace(/[`'"]/g, ''));
              const underRb = path.join(repoRoot, 'work/recipe-board-v1', hit.replace(/[`'"]/g, ''));
              const underSl = path.join(repoRoot, 'work/recipe-board-v1/style-lab', hit.replace(/[`'"]/g, ''));
              if (![candidate, underRb, underSl].some((f) => fs.existsSync(f))) {
                e.push(`dead-link: ${path.relative(repoRoot, p)} → ${hit} (P2 I6)`);
              }
            }
          }
        }
      }
    };
    walk(abs);
  }
  return e;
}

/** Historical HANDOFF dirs need README with 过期. */
export function expiredHandoffReadmeErrors(repoRoot) {
  const e = [];
  for (const rel of EXPIRED_HANDOFF_DIRS) {
    const readme = path.join(repoRoot, rel, 'README.md');
    const t = read(readme);
    if (!t) { e.push(`expired-handoff: ${rel}/README.md missing`); continue; }
    if (!/过期|EXPIRED|SUPERSEDED|非片线权威/.test(t)) {
      e.push(`expired-handoff: ${rel}/README.md must say 过期/EXPIRED`);
    }
    if (!/recipe-board|HOUSE/.test(t)) {
      e.push(`expired-handoff: ${rel}/README.md must point readers to recipe-board/HOUSE`);
    }
  }
  return e;
}

/** AUDIT-skills must have a 勾选 status table covering known P0/P1 debts. */
export function auditSkillsCheckboxErrors(auditMd = '') {
  const e = [];
  const t = String(auditMd || '');
  if (!/P2.*勾选|勾选表|P2 AUDIT-skills/.test(t)) e.push('audit-skills: missing P2 checkbox section');
  const need = [
    [/字组|typeBlock/, /DONE|已修|✓|\[x\]/i],
    [/三关|两关|design.*final/, /DONE|已修|✓|\[x\]/i],
    [/motion-director|SUPERSEDED/, /DONE|已修|✓|\[x\]/i],
    [/标签.*距离|labelDistance/, /DONE|已修|✓|\[x\]/i],
    [/复盘|retro/, /DONE|已修|✓|\[x\]/i],
  ];
  for (const [topic, done] of need) {
    if (!topic.test(t)) e.push(`audit-skills: checkbox topic missing (${topic})`);
    else if (!done.test(t)) e.push(`audit-skills: topic ${topic} not marked DONE`);
  }
  return e;
}

/** motion-director skill must stay SUPERSEDED. */
export function motionDirectorSupersededErrors(skillMd = '') {
  const e = [];
  const t = String(skillMd || '');
  if (!t.trim()) return ['motion-director: SKILL.md missing'];
  if (!/SUPERSEDED/.test(t)) e.push('motion-director: must keep SUPERSEDED');
  if (!/recipe-board-director|recipe-board\.mjs/.test(t)) {
    e.push('motion-director: must point to recipe-board-director / recipe-board.mjs');
  }
  return e;
}

/** PRODUCT.md / DESIGN.md need 非硬门 header. */
export function productDesignHeaderErrors(productMd = '', designMd = '') {
  const e = [];
  for (const [name, t] of [['PRODUCT', productMd], ['DESIGN', designMd]]) {
    const head = String(t || '').slice(0, 800);
    if (!/非硬门|P2/.test(head)) e.push(`${name}: missing 非硬门 / P2 header note in first ~800 chars`);
    if (!/HOUSE/.test(head)) e.push(`${name}: header must name HOUSE as hard-contract authority`);
  }
  return e;
}

/** Bundle all P2 doc checks against a repo root (for the suite). */
export function p2DocErrors(repoRoot, { libDir = null } = {}) {
  const data = path.join(repoRoot, 'work/recipe-board-v1');
  const lib = libDir || path.join(repoRoot, 'apps/studio-next/src/lib/recipe-board');
  return [
    ...maturityFunctionLinkErrors(read(path.join(data, 'MATURITY.md')) || '', { libDir: lib }),
    ...typeAbsorbDeclareErrors(read(path.join(data, 'TYPE.md')) || ''),
    ...directorReadmeErrors(read(path.join(data, 'style-lab/engine/director/README.md')) || ''),
    ...launchPathErrors(
      read(path.join(repoRoot, '.claude/launch.json')) || '',
      read(path.join(repoRoot, '.claude/LAUNCH.md')) || '',
    ),
    ...researchArchiveErrors(read(path.join(data, 'RESEARCH-agent-motion-2026.md')) || ''),
    ...researchDeadLinkErrors(repoRoot),
    ...expiredHandoffReadmeErrors(repoRoot),
    ...auditSkillsCheckboxErrors(read(path.join(data, 'AUDIT-skills-sop-20261028.md')) || ''),
    ...motionDirectorSupersededErrors(read(path.join(repoRoot, '.claude/skills/motion-director/SKILL.md')) || ''),
    ...productDesignHeaderErrors(read(path.join(repoRoot, 'PRODUCT.md')) || '', read(path.join(repoRoot, 'DESIGN.md')) || ''),
  ];
}
