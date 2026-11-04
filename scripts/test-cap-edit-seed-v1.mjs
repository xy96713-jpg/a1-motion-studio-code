import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('./capture-cap-native-writing-workbench-preference-v1.mjs', import.meta.url), 'utf8');
const start = src.indexOf('function taggedContentHtml(');
const end = src.indexOf('\nasync function cleanupTempDocument', start);
assert.ok(start >= 0 && end > start);
const fixture = '<p>当前行业正在快速发展。</p><p>我把 AI 直出的开头放进审稿。</p>';
const sentence = '例如预算很多，可以直接锁定投放。';
for (const targetShotId of ['ED-21', 'ED-22']) {
 const sandbox = {targetShotId, laterRewritePhrase:'后续改写句', interceptPhrase:'拦截句'};
 vm.createContext(sandbox);
 vm.runInContext(src.slice(start,end)+'\nthis.build = taggedContentHtml;',sandbox);
 const html=sandbox.build(fixture);
 const visible=html.match(/<p id="a1-action-original">([^<]*)<\/p>/u)[1];
 assert.equal(visible.split(sentence).length-1,targetShotId==='ED-21'?0:1, `${targetShotId} wrong pre-capture edit count`);
 const after=targetShotId==='ED-21'?visible+sentence:visible;
 assert.equal(after.split(sentence).length-1,1,'exactly one edit sentence after action');
}
console.log('PASS: ED-21 starts clean; ED-22 retains saved-result seed; one final edit sentence');
