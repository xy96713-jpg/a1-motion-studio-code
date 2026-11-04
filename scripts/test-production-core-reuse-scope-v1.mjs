import assert from 'node:assert/strict';
import {sameScopePackagingCoreReuseV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
const plan={activeWorkScope:{referencePackagingOnly:true,shotIds:['overlay']}},unit={shotId:'overlay',state:'HANDOFF',transparentBackground:true},candidate={sequenceIds:['overlay'],coreVisualPASS:true,wholeAnchorPASS:false,visualApproval:false,productionAdmission:false};
assert.equal(sameScopePackagingCoreReuseV1({plan,unit,candidate}),true,'a qualified core can be an input to a new independent core review');
for(const badUnit of [{...unit,transparentBackground:false},{...unit,transparentBackground:undefined},{...unit,shotId:'other'}])assert.equal(sameScopePackagingCoreReuseV1({plan,unit:badUnit,candidate}),false);
for(const change of [{coreVisualPASS:false},{wholeAnchorPASS:true},{visualApproval:true},{productionAdmission:true},{sequenceIds:['overlay','other']}])assert.equal(sameScopePackagingCoreReuseV1({plan,unit,candidate:{...candidate,...change}}),false);
assert.equal(sameScopePackagingCoreReuseV1({plan:{activeWorkScope:{referencePackagingOnly:false,shotIds:['overlay']}},unit,candidate}),false);
assert.equal(sameScopePackagingCoreReuseV1({plan:{},unit,candidate}),false);
console.log('PASS qualified same-shot packaging-core reuse only in explicit reference-packaging scope; full-frame, foreign-shot, missing transparency, unpassed or approved/production inputs remain refused. Fresh pixel review is still required.');
