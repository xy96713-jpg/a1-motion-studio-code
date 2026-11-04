#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const sourceUrl = "https://www.bilibili.com/list/253553776?bvid=BV1ns4y1T7Bb&oid=954093469";

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const profile = current.production.visualDirector?.referenceProfile;
  if (!profile) throw new Error("visual-director-reference-profile-missing");
  const source = profile.requestedSources?.find((item) => item.id === "magnates-media");
  if (!source) throw new Error("requested-magnates-reference-missing");
  source.sourceUrl = sourceUrl;
  source.sourcePageVerifiedAt = now;
  profile.note = "饭统戴老板精确 B 站来源已登记；当前生成仍使用本地 MagnatesMedia 序列作代理，未冒充精确画面。";
  const event = createProductionEvent({workspace: current, action: "reference-source-correction-annotated", payload: {sourceId: "magnates-media", sourceUrl, localProxy: true}, now});
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(current, now), {event});
  console.log(JSON.stringify({status: "REFERENCE_SOURCE_CORRECTION_ANNOTATED", sourceId: "magnates-media", sourceUrl}, null, 2));
});
