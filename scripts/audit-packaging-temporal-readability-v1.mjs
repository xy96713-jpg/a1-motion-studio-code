#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditPackagingTemporalReadability} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const outputPath = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-temporal-readability-audit.json");
const workspace = readProjectWorkspace(appRoot);
const audit = auditPackagingTemporalReadability(workspace);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: audit.status, contract: audit.contract, outputPath, auditSha256: audit.auditSha256, summary: audit.summary, repairRequiredShotIds: audit.repairRequiredShotIds, blockedSourceWindowShotIds: audit.blockedSourceWindowShotIds, motionAdmissionAllowed: false}, null, 2));
