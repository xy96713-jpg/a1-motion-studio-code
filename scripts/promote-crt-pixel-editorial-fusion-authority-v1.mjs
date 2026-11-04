#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildFusionGenerationPreflight, compileFusionAuthority} from "../apps/studio-next/src/lib/a1-crt-pixel-editorial-fusion-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const expectedIndex = process.argv.indexOf("--expected-workspace-sha");
const expectedWorkspaceSha256 = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
if (apply && !/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("fusion-authority-promotion-expected-workspace-sha-required");

const appRoot = path.resolve("apps/studio-next");
const overridesPath = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const sourceOverrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
const now = new Date().toISOString();

const buildNext = (current) => {
  if (current?.contract !== "A1EditorialAssetWorkbench/v2" || !/^[a-f0-9]{64}$/u.test(String(current.workspaceSha256 || ""))) throw new Error("fusion-authority-promotion-current-workspace-invalid");
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = structuredClone(sourceOverrides);
  next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority = compileFusionAuthority(sourceOverrides.wholeFilmCompositionDirective.fusionAuthority);
  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  next.production.fusionGenerationPreflight = buildFusionGenerationPreflight(next);
  delete next.production.packagingTemporalReadabilityAuthority;
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  return assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now, {scope: "packaging-hot-path"}));
};

const summarize = (current, next) => ({
  status: dryRun ? "DRY_RUN_PASS" : "PASS",
  previousWorkspaceSha256: current.workspaceSha256,
  workspaceSha256: next.workspaceSha256,
  fusionAuthority: {
    contract: next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority.contract,
    authoritySha256: next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority.authoritySha256,
    current: next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority.current,
  },
  preflight: next.production.fusionGenerationPreflight,
  currentStage: next.production.authority.currentStage,
  nextAction: next.production.authority.nextAction,
  generation: next.production.generation.summary,
  generationDispatchAllowed: next.production.generation.automaticDispatchAllowed,
  assemblyCreated: false,
  imageGenerationPerformed: false,
});

if (dryRun) {
  const current = readProjectWorkspace(appRoot);
  console.log(JSON.stringify(summarize(current, buildNext(current)), null, 2));
} else {
  const result = withProjectLock(appRoot, () => {
    const current = readProjectWorkspace(appRoot);
    if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`fusion-authority-promotion-workspace-sha-precondition-failed:${current.workspaceSha256}`);
    const next = buildNext(current);
    const event = createProductionEvent({
      workspace: current,
      action: "promote-crt-pixel-editorial-fusion-authority-v1",
      targetId: "WHOLE_FILM_PACKAGING",
      payload: {
        fusionAuthoritySha256: next.production.fusionGenerationPreflight.authoritySha256,
        fusionPreflightSha256: next.production.fusionGenerationPreflight.preflightSha256,
        packageShotCount: next.production.fusionGenerationPreflight.packageShotCount,
        imageGenerationPerformed: false,
        assemblyCreated: false,
      },
      now,
    });
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const committed = persistProjectState(appRoot, next, {
      event,
      expectedWorkspaceSha256: current.workspaceSha256,
      commitId: `promote-crt-pixel-editorial-fusion-authority-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    });
    return {...summarize(current, next), transitionSha256: committed.transitionSha256};
  });
  console.log(JSON.stringify(result, null, 2));
}
