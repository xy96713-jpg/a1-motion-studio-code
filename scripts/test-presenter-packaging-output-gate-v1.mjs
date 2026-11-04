#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertPresenterPackagingOutputMetadata, presenterPackagingOutputContract, presenterPackagingPromptGuard} from "../apps/studio-next/src/lib/a1-presenter-packaging-output-gate-v1.mjs";

const plan = {baseVisualCarrier: "PRESENTER_BASE", presenterPackagingMode: "PRESENTER_CUTOUT_COMPOSITE"};
const contract = presenterPackagingOutputContract(plan);
assert.equal(contract.route, "PRESENTER_OVERLAY_ONLY");
assert.equal(contract.presenterPixelsAllowed, false);
assert.equal(contract.typographyAllowed, true);
const safePrompt = "true transparent PNG overlay; the hold frame is an ImageGen reference only and must not be baked into the output; presenter pixels remain reference-only; no full-frame opaque plate; readable typography and up to two auxiliary elements are allowed";
assert.equal(presenterPackagingPromptGuard(plan, safePrompt).status, "PASS");
assert.throws(() => presenterPackagingPromptGuard(plan, "Create a complete 16:9 takeover and stylize the presenter"), /presenter-packaging-prompt-gate-failed/);
assert.equal(assertPresenterPackagingOutputMetadata(plan, {transparentLayer: true, alphaVerified: true, fullFrame: false, containsPresenter: false, containsBackground: false, auxiliaryElementCount: 2}).status, "PASS");
assert.throws(() => assertPresenterPackagingOutputMetadata(plan, {transparentLayer: false, alphaVerified: false, fullFrame: true, containsPresenter: true, containsBackground: true}), /presenter-packaging-output-gate-failed/);
assert.equal(presenterPackagingPromptGuard({baseVisualCarrier: "NONE_OR_TAKEOVER", presenterPackagingMode: "SHORT_FULLSCREEN_TAKEOVER"}, "Create a complete 16:9 takeover").status, "PASS");
console.log(JSON.stringify({status: "PASS", presenterPreserved: true, typographyAllowed: true, auxiliaryElementsAllowed: true, fullFramePresenterRewriteRejected: true}, null, 2));

