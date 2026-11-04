#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const FONT_ID = "type-pixel-correction";
const FONT_FAMILY = "A1 Fusion Pixel";
const legacyFontIds = new Set(["type-editorial-heavy", "type-slanted-display", "type-condensed-impact", "type-human-accent"]);
const now = new Date().toISOString();

const canonicalAssignment = (assignment) => {
  if (!assignment || typeof assignment !== "object") return assignment;
  const hasFormalText = Boolean(assignment.pixelFontAssetId) || (assignment.primaryFontAssetIds || []).length > 0;
  const primaryFontAssetIds = hasFormalText ? [FONT_ID] : [];
  return {
    ...assignment,
    pixelFontAssetId: hasFormalText ? FONT_ID : null,
    supportFontAssetId: null,
    primaryFontAssetIds,
    maxFontRoles: primaryFontAssetIds.length,
    maximumFontRoles: primaryFontAssetIds.length,
    longEvidenceCopyUsesReadableSupportFont: false,
  };
};

const canonicalSceneGraph = (sceneGraph) => {
  if (!sceneGraph || typeof sceneGraph !== "object") return sceneGraph;
  const next = structuredClone(sceneGraph);
  if (next.typography?.assignment) next.typography.assignment = canonicalAssignment(next.typography.assignment);
  if (Array.isArray(next.nodes)) next.nodes = next.nodes.map((node) => legacyFontIds.has(node.fontAssetId) ? {...node, fontAssetId: FONT_ID} : node);
  return next;
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  if (next.visualBible?.typographyReferenceProfile) {
    next.visualBible.typographyReferenceProfile = {
      ...next.visualBible.typographyReferenceProfile,
      signatureFontAssetId: FONT_ID,
      supportFontAssetIds: [],
      maximumFontRolesPerShot: 1,
    };
  }
  if (next.visualBible?.visualGenerationPolicy?.typography) {
    next.visualBible.visualGenerationPolicy = {
      ...next.visualBible.visualGenerationPolicy,
      typography: {
        ...next.visualBible.visualGenerationPolicy.typography,
        signatureFontAssetId: FONT_ID,
        supportFontAssetIds: [],
        singleFontAssetId: FONT_ID,
        singleFontFamily: FONT_FAMILY,
        maximumFontRolesPerShot: 1,
      },
    };
  }
  next.assetRequirementGraph = {
    ...next.assetRequirementGraph,
    shotDemands: (next.assetRequirementGraph.shotDemands || []).map((shot) => ({...shot, typographyAssignment: canonicalAssignment(shot.typographyAssignment)})),
  };
  let currentShotBindingCount = 0;
  next.library.assets = next.library.assets.map((asset) => {
    if (asset.route !== "shot-composition") return asset;
    const nextAsset = {...asset};
    if (nextAsset.shotDemand?.typographyAssignment) {
      nextAsset.shotDemand = {...nextAsset.shotDemand, typographyAssignment: canonicalAssignment(nextAsset.shotDemand.typographyAssignment)};
      currentShotBindingCount += 1;
    }
    if (Array.isArray(nextAsset.candidates)) nextAsset.candidates = nextAsset.candidates.map((candidate) => ({...candidate, sceneGraph: canonicalSceneGraph(candidate.sceneGraph)}));
    return nextAsset;
  });
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "current-single-font-bindings-repaired",
    targetId: FONT_ID,
    payload: {fontId: FONT_ID, fontFamily: FONT_FAMILY, currentShotBindingCount, legacyFontIds: [...legacyFontIds], productionAdmitted: false, motionAllowed: false},
    now,
  });
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `single-font-bindings-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {persisted, workspaceSha256: recalculated.workspaceSha256, eventId: event.eventId, currentShotBindingCount};
});

console.log(JSON.stringify({status: "PASS_CURRENT_SINGLE_FONT_BINDINGS", ...result}, null, 2));
