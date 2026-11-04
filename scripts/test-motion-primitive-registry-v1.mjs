#!/usr/bin/env node

import assert from "node:assert/strict";
import {auditMotionPrimitiveQuality, selectMotionPrimitiveBundle} from "../apps/studio-next/src/lib/a1-motion-primitive-registry-v1.mjs";

const entity = selectMotionPrimitiveBundle({route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL", exactIdentityBinding: true, formalCopyRequired: true});
const evidence = selectMotionPrimitiveBundle({route: "PACKAGE_LOOK_MASTER", source: "REAL_SOURCE"});
const generative = selectMotionPrimitiveBundle({route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL", independentGenerativeActor: true});
const screen = selectMotionPrimitiveBundle({route: "SCREEN_EVIDENCE", source: "REAL_SOURCE"});
assert.deepEqual(entity.primitiveIds, ["SHARED_TEST_APERTURE", "PRESS_RELEASE_SETTLE", "DEPTH_ASSEMBLE", "FINAL_STATIC_PARITY"]);
assert.equal(entity.runtimeCapabilities.remotionCurrentBaseline, "4.0.520");
assert.equal(entity.runtimeCapabilities.remotionEffectsRenderBackend, "angle");
assert.equal(entity.runtimeCapabilities.remotionUpgradeCandidate, null);
assert.equal(entity.runtimeCapabilities.hyperframesRequired, "0.8.24");
assert.equal(entity.runtimeCapabilities.videoShotcraft.catalogContract, "A1VideoShotcraftCatalog/v1");
assert.equal(entity.runtimeCapabilities.videoShotcraft.selectionMode, "EXISTING_RECIPE_FIRST");
assert.equal(entity.runtimeCapabilities.videoShotcraft.exactCardAndDemoReadRequired, true);
assert.equal(entity.runtimeCapabilities.videoShotcraft.customMotionRequiresExplicitGapJustification, true);
assert.equal(entity.runtimeCapabilities.videoShotcraft.directExternalRender, false);
assert.equal(evidence.profile, "REAL_EVIDENCE");
assert.equal(generative.profile, "GENERATIVE_INDEPENDENT_ACTOR");
assert.equal(screen.profile, "SCREEN_OPERATION");
const passEvidence = {connectorOnly: false, decorativeOnly: false, decorativeBackgroundLightScan: false, opaqueLogoPlate: false, formalTypographyRequired: true, editableTypographyLayers: true, primaryActorAreaRatio: 0.24, semanticStateChangeCount: 5, materialResponseCount: 5, finalStaticParity: true, usedPrimitiveIds: entity.primitiveIds, hyperframesPreviewUsed: true, animationMapPassed: true};
assert.equal(auditMotionPrimitiveQuality(entity, passEvidence).status, "PASS");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, connectorOnly: true}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, primaryActorAreaRatio: 0.01}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, materialResponseCount: 0}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, finalStaticParity: false}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, hyperframesPreviewUsed: true, animationMapPassed: false}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, unmotivatedFrameCount: 1}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, floatingCardCount: 3}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, repeatedBorderChromeCount: 2}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, decorativeBackgroundLightScan: true}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, opaqueLogoPlate: true}).status, "BLOCKED");
assert.equal(auditMotionPrimitiveQuality(entity, {...passEvidence, editableTypographyLayers: false}).status, "BLOCKED");
console.log(JSON.stringify({status: "PASS", contract: "A1MotionPrimitiveRegistryTest/v1", profiles: [entity.profile, evidence.profile, generative.profile, screen.profile], videoShotcraftExistingRecipeFirst: true, connectorOnlyRejected: true, cheapFrameRejected: true, floatingCardConstellationRejected: true, repeatedBorderChromeRejected: true, decorativeBackgroundLightScanRejected: true, opaqueLogoPlateRejected: true, editableTypographyLayersRequired: true, visualMassGate: true, materialResponseGate: true, finalParityGate: true, hyperframesAnimationMapGate: true}, null, 2));
