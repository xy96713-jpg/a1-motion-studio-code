import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickDirectorDefaults, directorIntentErrors } from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
import { beatForShortlist, filmDesignErrors, filmShortlistErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { briefText } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
const table = JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/director-routes.json', import.meta.url)));
const devices = JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/devices.json', import.meta.url)));
const intent = route => ({ route, question: '观众要理解什么关系', change: '让关系在画面中发生变化', reason: '这个处理更清楚地说明本句关系', layers: { evidence: '真实资料作事实依据', art: '无字空间和光线作为包装', type: '本地排版结论与来源' } });
const examples = [
  ['两个疗法分别有效 20% 和 60%，哪一个更有效', 'compare'],
  ['没有报道证实这条跨洲传播路线', 'custom'],
  ['同一条装配线的零件依次连接成机器', 'custom'],
];
for (const [text, route] of examples) {
  const shaped = beatForShortlist({ beat: 'B02', text }, { act: 'build', medium: 'diagram', directorIntent: intent(route) });
  const chosen = pickDirectorDefaults(shaped, { table, devices });
  assert.equal(chosen.kind, route === 'custom' ? null : route, `${text}: director decision controls the route`);
  assert.deepEqual(directorIntentErrors(shaped), []);
}
assert.ok(directorIntentErrors({ directorIntent: { route: 'compare' } }).length, 'a bare override cannot pass as a reasoned decision');
assert.deepEqual(directorIntentErrors({ directorIntent: { ...intent('custom'), layers: { evidence: '无', art: '无', type: '无' } } }), [], 'an explicitly unused layer is valid');
const open = pickDirectorDefaults({ act: 'open', directorIntent: intent('custom') }, { table, devices });
assert.equal(open.kind, 'opening', 'opening safety remains authoritative');
const row = { beat: 'B02', act: 'build', scale: 'object', value: 'mid', medium: 'diagram', red: 0, hero: false, palette: 'noir', screen: 'clean', why: '展示过程里不同部分的连接关系', device: 'array-build', directorIntent: intent('custom') };
assert.ok(filmDesignErrors({ arc: '一段足够长的描述来解释整个影片的起伏和结尾如何收束', beats: [row] }, ['B02'], null, null, devices).some(x => /requires a ready device/.test(x)), 'custom cannot admit an unwired device');
const shortlist = { devices: ['ready-device'], byBeat: { B02: { devices: ['other-device'] } } };
assert.deepEqual(filmShortlistErrors([{ ...row, device: 'ready-device' }], shortlist), [], 'custom route can select a catalog device beyond heuristic shortlist');
const brief = briefText({ id: 'blind', chapter: 'B02', beats: [{ beat: 'B02', at: 0, dur: 5, text: '过程' }], film: { B02: row }, files: {} });
assert.ok(brief.includes(row.directorIntent.layers.art), 'the chapter brief carries the art instruction');
assert.ok(brief.includes(row.directorIntent.layers.evidence), 'the chapter brief carries the evidence instruction');
console.log('semantic contract: director choice, source/art separation and opening safety');
