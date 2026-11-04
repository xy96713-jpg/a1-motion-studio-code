// Offline checks for the director trigger table (routing/director-triggers.json, A1DirectorTriggers/v1): the "when the
// line says this, give that picture" rules of the storyboard check as data, not hardcoded regexes (user 2026-10-16:
// 把导演语法写进简报和分镜的规则和检查（…触发表…）).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDirectorTriggers, directorTriggerWarnings, triggerCardMatches } from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';

const real = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/director-triggers.json', 'utf8'));
assert.equal(real.contract, 'A1DirectorTriggers/v1');
assert.ok(real.triggers.length >= 8, `the table holds the agreed triggers (${real.triggers.length})`);
assert.equal(new Set(real.triggers.map((t) => t.id)).size, real.triggers.length, 'trigger ids are unique');
for (const t of real.triggers) {
  assert.doesNotThrow(() => new RegExp(t.cue, t.flags || ''), `cue compiles: ${t.id}`);
  assert.ok(typeof t.say === 'string' && t.say.trim(), `say present: ${t.id}`);
  assert.deepEqual(Object.keys(t.needs || {}).filter((k) => !['minScenes', 'cardsAnyOf', 'evidenceKindAnyOf', 'broll'].includes(k)), [], `known needs only: ${t.id}`);
  const unknown = [...t.say.matchAll(/\{[a-z0-9]+\}/gi)].map((m) => m[0]).filter((p) => !['{cue}', '{cue16}', '{broll}'].includes(p));
  assert.deepEqual(unknown, [], `no unknown placeholder: ${t.id}`);
}
assert.deepEqual(Object.keys(real.triggers.reduce((a, t) => ({ ...a, [t.id]: 1 }), {})).sort(),
  ['announce', 'concept', 'emotion', 'list', 'opinion', 'pair', 'quote', 'turn'], 'the eight agreed triggers');

const table = loadDirectorTriggers({ dataDir: 'work/recipe-board-v1' });
assert.equal(table.fallback, undefined, 'the check reads the routing file, not the fallback');
assert.equal(table.triggers.length, real.triggers.length);

const warn = (text, shot = {}, opts = {}) => directorTriggerWarnings(table, { id: 'B01', text }, {
  card: shot.card, scenes: shot.scenes || [], evidence: shot.evidence || [],
}, opts).map((x) => x.warning).join('\n');
const shot = (card, extra = {}) => ({ card, ...extra });

// list / exclusion: needs a montage of cuts, unless the beat is a breathing beat
assert.match(warn('不是便宜，不是耐用', shot('presenter-plain')), /a list \/ exclusion line \("不是便宜，不是…"\); cut each item/);
assert.doesNotMatch(warn('不是便宜，不是耐用', shot('presenter-plain', { scenes: [{ card: 'a' }, { card: 'b' }, { card: 'c' }] })), /a list/);
assert.doesNotMatch(warn('不是便宜，不是耐用', shot('presenter-plain'), { breathing: true }), /a list/);

// turn / question line: the presenter carries it
assert.doesNotMatch(warn('接下来我们看第二条', shot('presenter-tags')), /question \/ turn/);
assert.match(warn('接下来我们看第二条', shot('title-word-broll')), /question \/ turn line \("接下来"\); the presenter carries it/);

// what others say: real headlines or an event evidence picture
assert.doesNotMatch(warn('有报道称它要完', shot('screen-full')), /cites what others say/);
assert.doesNotMatch(warn('外界都这么说', shot('presenter-plain', { evidence: [{ kind: 'event', entity: 'x' }] })), /cites what others say/);
assert.match(warn('外界都这么说', shot('presenter-plain')), /show the headlines/);

// emotion: the film's b-roll, and only its b-roll
assert.doesNotMatch(warn('钱多得没数花', shot('footage-plate')), /emotional/);
const broll = { what: '钱堆', queryEn: 'money pile' };
assert.match(warn('钱多得没数花', shot('footage-plate'), { broll }), /cut to the film's b-roll motif \(brief: 钱堆, evidence queryEn "money pile"\) with footage-plate/);
assert.doesNotMatch(warn('钱多得没数花', shot('footage-plate', { evidence: [{ queryEn: 'Money Pile' }] }), { broll }), /emotional/);
assert.doesNotMatch(warn('钱多得没数花', shot('presenter-plain'), { broll, breathing: true }), /emotional/);

// announcement → chat; pair → two posters; concept → big title; quote → quote card
assert.doesNotMatch(warn('公司宣布停产', shot('chat-thread')), /announcement/);
assert.match(warn('公司宣布停产', shot('presenter-plain')), /chat thread \(chat-thread\)/);
assert.doesNotMatch(warn('两种看法对立', shot('poster-pair')), /two poster cards/);
assert.match(warn('两种看法对立', shot('presenter-plain')), /poster-pair/);
assert.doesNotMatch(warn('所谓创新就是改名', shot('title-hero-over-photo')), /concept \/ reversal/);
assert.match(warn('所谓创新就是改名', shot('presenter-plain')), /big title cut/);
assert.doesNotMatch(warn('他说这不可能', shot('quote-stack')), /show the quote/);
assert.match(warn('他说这不可能', shot('presenter-plain')), /show the quote/);

// the table drives the check: removing or re-cueing an entry changes the warning without touching code
const copy = structuredClone(table);
copy.triggers = copy.triggers.filter((t) => t.id !== 'announce');
assert.doesNotMatch(directorTriggerWarnings(copy, { id: 'B01', text: '公司宣布停产' }, shot('presenter-plain')).map((x) => x.warning).join(), /announcement/);
const recued = structuredClone(table);
recued.triggers.find((t) => t.id === 'announce').cue = '官宣';
assert.doesNotMatch(directorTriggerWarnings(recued, { id: 'B01', text: '公司宣布停产' }, shot('presenter-plain')).map((x) => x.warning).join(), /announcement/);
assert.match(directorTriggerWarnings(recued, { id: 'B01', text: '官网官宣了' }, shot('presenter-plain')).map((x) => x.warning).join(), /announcement/);

// old checkouts without the file still get the same eight triggers from the built-in fallback
const fallback = loadDirectorTriggers({ dataDir: '/nonexistent' });
assert.equal(fallback.fallback, true);
assert.equal(fallback.triggers.length, 8);
assert.match(directorTriggerWarnings(fallback, { id: 'B01', text: '接下来' }, shot('title-word-broll')).map((x) => x.warning).join(), /question \/ turn/);

// category matcher
assert.equal(triggerCardMatches('title', 'title-word-broll'), true);
assert.equal(triggerCardMatches('presenter', 'presenter-tags'), true);
assert.equal(triggerCardMatches('news', 'presenter-plain'), false);
console.log(`director triggers: ${real.triggers.length} table-driven warnings verified; fallback and category matcher verified`);
