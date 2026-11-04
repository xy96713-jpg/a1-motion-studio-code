#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const handoff = workspace.production?.resolveLayoutHandoffs?.["ED-01"];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\/+/, ""));
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});
const artifact = (value) => Boolean(value?.publicUrl && fs.existsSync(publicFile(value.publicUrl)) && shaFile(publicFile(value.publicUrl)) === value.sha256);

check("resolve-layout-handoff-contract", handoff?.contract === "A1ResolveLayoutHandoff/v1" && handoff.status === "layout-ready-mask-pending" && handoff.reviewOnly === true, handoff || null);
check("front-and-behind-alpha-passes-hash-bound", artifact(handoff?.behindTypography) && artifact(handoff?.frontTypography) && handoff?.behindTypography?.codec === "prores-4444" && handoff?.frontTypography?.codec === "prores-4444", {behind: handoff?.behindTypography || null, front: handoff?.frontTypography || null});
check("mask-guide-and-manifest-hash-bound", artifact(handoff?.maskGuide) && artifact(handoff?.manifest), {maskGuide: handoff?.maskGuide || null, manifest: handoff?.manifest || null});
const manifest = handoff?.manifest?.publicUrl && fs.existsSync(publicFile(handoff.manifest.publicUrl)) ? JSON.parse(fs.readFileSync(publicFile(handoff.manifest.publicUrl), "utf8")) : null;
check("manual-mask-owned-by-resolve", manifest?.finishingPolicy?.executionAuthority === "davinci-resolve" && manifest.finishingPolicy.simulatedOcclusionAllowedForDelivery === false && manifest.resolveProjectMutationPerformed === false, manifest?.finishingPolicy || null);
check("alpha-streams-verified", [manifest?.typographyPasses?.behindForeground, manifest?.typographyPasses?.frontOverlay].every((item) => item?.verifiedStream?.codec_name === "prores" && String(item.verifiedStream.pix_fmt || "").startsWith("yuva444p") && item.verifiedStream.width === 1920 && item.verifiedStream.height === 1080 && item.verifiedStream.r_frame_rate === "30/1"), {behind: manifest?.typographyPasses?.behindForeground?.verifiedStream || null, front: manifest?.typographyPasses?.frontOverlay?.verifiedStream || null});
check("alpha-content-has-transparent-and-visible-pixels", [manifest?.typographyPasses?.behindForeground, manifest?.typographyPasses?.frontOverlay].every((item) => item?.verifiedAlpha?.transparentAndVisiblePixelsPresent === true && item.verifiedAlpha.min === 0 && item.verifiedAlpha.max > 0 && item.verifiedAlpha.mean > 0), {behind: manifest?.typographyPasses?.behindForeground?.verifiedAlpha || null, front: manifest?.typographyPasses?.frontOverlay?.verifiedAlpha || null});
check("review-only-cannot-open-production", handoff?.candidateAdoptionAllowed === false && handoff?.finalRenderAllowed === false && workspace.gates.acceptedShotIrAllowed === false && workspace.gates.motionPrototypeAllowed === false && workspace.gates.finalRenderAllowed === false, workspace.gates);
check("workspace-next-action-is-layout-review", workspace.production?.maturityLoop?.currentStage === "ed01-resolve-layout-handoff" && workspace.production?.maturityLoop?.nextAction === "review-ed01-resolve-layout-handoff", {currentStage: workspace.production?.maturityLoop?.currentStage, nextAction: workspace.production?.maturityLoop?.nextAction});

const failures = checks.filter((item) => item.status === "FAIL");
const report = {contract: "A1ResolveLayoutHandoffAudit/v1", status: failures.length ? "FAIL" : "PASS", generatedAt: new Date().toISOString(), checks, failures: failures.map((item) => item.id), nextAction: failures.length ? "repair-ed01-resolve-layout-handoff" : "review-ed01-resolve-layout-handoff"};
const reportPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/resolve-layout-handoffs/ED-01/v1/audit-report.json");
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, failures: report.failures, reportPath: path.relative(root, reportPath), nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
