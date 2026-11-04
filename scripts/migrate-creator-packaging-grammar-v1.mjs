#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {ensureVisualGenerationDirector} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const raw = readProjectWorkspace(appRoot);
  const before = raw.production?.visualDirector?.creatorPackaging?.contract || null;
  let current;
  let fullyValidated = true;
  try {
    current = assertEditorialAssetWorkbench(raw);
  } catch (error) {
    if (!String(error?.message || error).includes("article-packaging-kit-typography-gate-missing")) throw error;
    fullyValidated = false;
    current = raw;
  }
  const next = fullyValidated ? ensureProductionState(current, now) : ensureVisualGenerationDirector(current, now);
  const director = next.production.visualDirector;
  if (director.creatorPackaging?.contract !== "A1CreatorPackagingGrammar/v1") throw new Error("creator-packaging-grammar-migration-incomplete");
  const alreadyCurrent = before === "A1CreatorPackagingGrammar/v1"
    && raw.production.visualDirector?.creatorPackaging?.requestedProfileIds?.join(",") === "gawx-art,xiaolin-says,hupo,dai-lao-ban"
    && raw.production.visualDirector?.creatorPackaging?.inspirationProfileIds?.join(",") === "mina-le,dan-mace-cartel,ignacio-osorio-odd,yere-studio"
    && raw.production.visualDirector?.referenceStudy?.contract === "A1CreatorReferenceStudy/v1"
    && raw.production.visualDirector?.shotBriefs?.every((brief) => brief.creatorPackagingProfileIds?.length === 4 && brief.creatorInspirationProfileIds?.length === 4 && brief.creatorPackagingGrammar?.visualDirection?.register && brief.creatorReferenceStudyContract === "A1CreatorReferenceStudy/v1");
  if (alreadyCurrent) {
    console.log(JSON.stringify({status: "NOOP_ALREADY_CURRENT", before, requestedProfileIds: director.creatorPackaging.requestedProfileIds}, null, 2));
    return;
  }
  const event = createProductionEvent({workspace: next, action: "creator-packaging-grammar-migrated", payload: {before, after: director.creatorPackaging.contract, requestedProfileIds: director.creatorPackaging.requestedProfileIds, rankedProfileIds: director.creatorPackaging.rankedProfiles.map((profile) => profile.id)}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, fullyValidated ? recalculateEditorialAssetWorkbench(next, now) : next, {event});
  console.log(JSON.stringify({status: "CREATOR_PACKAGING_GRAMMAR_MIGRATED", before, after: director.creatorPackaging.contract, requestedProfileIds: director.creatorPackaging.requestedProfileIds, rankedProfileIds: director.creatorPackaging.rankedProfiles.map((profile) => profile.id)}, null, 2));
});
