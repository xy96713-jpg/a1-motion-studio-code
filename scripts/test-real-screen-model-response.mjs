import assert from 'node:assert/strict';import {assertRealScreenModelResponse} from '../apps/studio-next/src/lib/a1-screen-source-integration-v1.mjs';
assert.doesNotThrow(()=>assertRealScreenModelResponse({engine:'deepseek',variants:[{text:'candidate'}]},true));
for(const engine of [undefined,'','local','local-fallback','heuristic','mock','deepseek-fallback'])assert.throws(()=>assertRealScreenModelResponse({engine,variants:[{}]},true));
assert.throws(()=>assertRealScreenModelResponse({engine:'deepseek',variants:[]},true));
assert.throws(()=>assertRealScreenModelResponse({engine:'deepseek',variants:[{}]},false));
console.log('PASS: real provider response required; local fallback, missing engine, empty results and HTTP failure rejected');
