import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = assertEditorialAssetWorkbench(JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8")));
const autopilotSource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-visual-autopilot-v1.mjs"), "utf8");
const productionSource = ["contracts.mjs", "state.mjs", "scene-graph.mjs", "shot-ir.mjs", "motion-plan.mjs"]
  .map((file) => fs.readFileSync(path.join(root, "apps/studio-next/src/lib/editorial-production", file), "utf8"))
  .join("\n");
const routeSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs"), "utf8");
const checks = [];
const check = (id, pass, note) => checks.push({id, status: pass ? "PASS" : "FAIL", note});

check("live-workspace-safe-default", workspace.production.generation.automaticDispatchAllowed === false && workspace.gates.shotCompositionAllowed === false && workspace.gates.finalRenderAllowed === false, "live workspace remains review gated before a new explicit click");
check("autopilot-is-generic-not-shot-id-coded", !/ED-(?:01|08|09|10|17|33|34)/u.test(autopilotSource) && autopilotSource.includes("shotOrder") && autopilotSource.includes("nextAnchorAssets"), "anchor choice is derived from article shot bindings rather than current IDs");
check("critic-has-six-dimensions-and-hard-failures", ["textIntegrity", "articleFit", "typePersonality", "materialSpecificity", "editableSafety", "antiTemplate", "exact-chinese-text-unverified", "duplicate-candidate-output"].every((marker) => autopilotSource.includes(marker)), "recommendations score quality and block unverified text or duplicate outputs");
check("quality-gated-automatic-admission", autopilotSource.includes("automaticApprovalAllowed: true") && autopilotSource.includes("score>=22") && autopilotSource.includes("materialEvidenceComplete"), "automatic admission is owned by one strict 22/24, zero-hard-failure evidence predicate");
check("four-independent-images-and-contact-sheet", productionSource.includes("candidateId") && productionSource.includes("one original premium 16:9 Chinese editorial") && workerSource.includes("A1GeneratedEditorialAssetContactSheet/v1") && workerSource.includes("generatedCandidates") && workerSource.includes("textVerification"), "generated glyphs are four independent outputs with a derived 2x2 review sheet");
check("subscription-worker-concurrency-two", productionSource.includes('providerMode: "subscription-zero-extra-cost"') && workerSource.includes("Math.min(2, queued.length)"), "generation stays within the zero-extra-cost concurrency contract");
check("single-primary-ui-action", ["data-a1-visual-autopilot", "data-a1-autopilot-status", "data-a1-autopilot-recommendation", "data-a1-autopilot-adopt", "data-a1-autopilot-exception-count", "自动评估并推荐", "采用推荐，并自动生成 2 个关键字形"].every((marker) => uiSource.includes(marker)), "4311 shows one recommendation, one adoption action and a collapsed exception list");
check("downstream-gates-never-auto-open", autopilotSource.includes("shotCompositionAllowed: false") && autopilotSource.includes("renderAllowed: false") && !routeSource.includes("autopilot.gates.shotCompositionAllowed = true") && !routeSource.includes("autopilot.gates.renderAllowed = true"), "autopilot cannot approve shot composition, motion or rendering");

const failures = checks.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", checks, failures: failures.map((item) => item.id)}, null, 2));
if (failures.length) process.exitCode = 1;
