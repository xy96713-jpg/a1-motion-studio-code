import assert from 'node:assert/strict';
import { auditPlan } from './packaging-audit.mjs';
const good = { contract: 'A1DirectorPlan/v1', beats: [
 { id: 'B01', intent: 'title', text: 'x', duration: 5, route: { primaryModule: 'official-media', chain: [{ use: 'bg' }] }, design: { camera: { move: 'locked' }, in: 'cut', out: 'match', hero: { action: 'type-on' } } },
 { id: 'B02', intent: 'setup', text: 'y', duration: 5, route: { primaryModule: 'three', chain: [{ use: '3d' }] }, design: { camera: { move: 'pan' }, in: 'match', out: 'cut', evidence: ['source'] } },
]};
assert.deepEqual(auditPlan(good), []);
const noLanding = JSON.parse(JSON.stringify(good)); delete noLanding.beats[0].design.hero;
assert.ok(auditPlan(noLanding).some((e) => e.includes('no visual landing')));
const noCamera = JSON.parse(JSON.stringify(good)); delete noCamera.beats[1].design.camera;
assert.ok(auditPlan(noCamera).some((e) => e.includes('design.camera')));
const noChain = JSON.parse(JSON.stringify(good)); delete noChain.beats[0].route.chain;
assert.ok(auditPlan(noChain).some((e) => e.includes('route.chain')));
console.log('packaging audit tests pass');
