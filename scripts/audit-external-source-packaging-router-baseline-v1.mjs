#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routeFile = path.join(root, "apps/studio-next/src/lib/a1-source-presentation-routing-v1.mjs");
const providerFile = path.join(root, "lib/visual-sourcing/web-image-provider-chain.mjs");
const serverFile = path.join(root, "server.js");
const hotPhaseFile = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputDir = path.join(root, "work/external-source-packaging-router-v1");
const outputFile = path.join(outputDir, "baseline.json");
const routeSource = fs.readFileSync(routeFile, "utf8");
const providerSource = fs.readFileSync(providerFile, "utf8");
const serverSource = fs.readFileSync(serverFile, "utf8");
const hotPhase = JSON.parse(fs.readFileSync(hotPhaseFile, "utf8"));
const specializedRoutes = ["EVIDENCE_HIGHLIGHT", "SUBJECT_ISOLATION", "ARCHIVE_COLLAGE", "DISTRESSED_PRINT", "PROP_PERSPECTIVE"];
const failures = [];

if (!specializedRoutes.every((route) => routeSource.includes(route))) failures.push("TYPE_AWARE_PACKAGING_ROUTES_MISSING");
if (/providerPriority/u.test(providerSource) && /flatMap/u.test(providerSource)) failures.push("PROVIDER_FIRST_TRUNCATION_RISK");
if (/searchProvider === "openverse"[\s\S]{0,160}ACTION_CARRIER_UNPROVEN/u.test(serverSource)) failures.push("OPENVERSE_ACTION_CARRIER_BYPASS");

const report = {
  contract: "A1ExternalSourcePackagingBaseline/v1",
  status: failures.length ? "EXPECTED_FAIL" : "UNEXPECTED_PASS",
  failures,
  evidence: {
    currentRoutes: ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"],
    requiredRoutes: specializedRoutes,
  },
  authoritySnapshot: {
    workspaceIdentitySha256: hotPhase.authority?.workspaceSha256 || null,
    workspaceFileSha256: (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex"),
    systemLinePhaseFileSha256: (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(hotPhaseFile)).digest("hex"),
    phaseStatus: hotPhase.status || null,
  },
};
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!failures.length) process.exitCode = 1;
