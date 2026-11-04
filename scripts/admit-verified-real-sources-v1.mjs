import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const admitted = [];
  for (const asset of next.library.assets.filter((item) => item.route === "verified-real-source" && item.review.status !== "approved")) {
    const relative = String(asset.assetUri || "").replace(/^\/+/, "");
    const file = path.resolve(publicRoot, relative);
    if (!relative || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file)) throw new Error(`verified-source-file-missing:${asset.id}`);
    const bytes = fs.readFileSync(file);
    const actualSha256 = sha256(bytes);
    if (!asset.sha256 || actualSha256 !== asset.sha256) throw new Error(`verified-source-hash-mismatch:${asset.id}`);
    if (!asset.provenance?.reviewed || !asset.provenance?.sourceUri || !asset.provenance?.sourceType || /generated/iu.test(asset.provenance.sourceType)) throw new Error(`verified-source-provenance-invalid:${asset.id}`);
    if (file.endsWith(".svg") && !bytes.toString("utf8", 0, Math.min(bytes.length, 1200)).includes("<svg")) throw new Error(`verified-source-svg-invalid:${asset.id}`);
    asset.status = "approved";
    asset.review = {status: "approved", note: "真实来源、使用边界和缓存文件哈希已自动核对；只允许裁切、调色、遮罩与对象绑定包装。", reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
    asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
    admitted.push({assetId: asset.id, sha256: actualSha256, sourceType: asset.provenance.sourceType});
  }
  const event = createProductionEvent({workspace: current, action: "verified-real-sources-auto-admitted", payload: {count: admitted.length, admitted}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  persistProjectState(appRoot, recalculated, {event, files: {"verified-real-source-admission-report.json": {contract: "A1VerifiedRealSourceAdmission/v1", status: "PASS", admitted, generatedAssetsAdmitted: false, checkedAt: event.createdAt}}});
  return {workspace: recalculated, admitted};
});

console.log(JSON.stringify({status: "PASS", admittedCount: updated.admitted.length, requiredSourceMaterialsResolved: updated.workspace.gates.requiredSourceMaterialsResolved, sourceGate: updated.workspace.stages.find((stage) => stage.id === "source-materials")?.gate}, null, 2));
