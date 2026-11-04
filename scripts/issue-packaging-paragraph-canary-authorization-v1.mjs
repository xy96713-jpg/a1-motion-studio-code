#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryLiveInputs, assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const requestPackPath = path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json");
const requiredEnv = ["A1_USER_AUTHORIZATION_ID", "A1_USER_ISSUED_BY", "A1_USER_AUTHORIZATION_INTENT", "A1_USER_AUTHORIZATION_TEXT", "A1_USER_AUTHORIZED_PLAN_SHA256", "A1_USER_AUTHORIZED_REQUEST_PACK_SHA256"];
for (const key of requiredEnv) if (!process.env[key]?.trim()) throw new Error(`paragraph-canary-authorization-env-required:${key}`);
const safeId = process.env.A1_USER_AUTHORIZATION_ID.replace(/[^a-zA-Z0-9._-]/gu, "-");
if (!safeId) throw new Error("paragraph-canary-authorization-id-invalid");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(requestPackPath, "utf8")));
assertPackagingParagraphCanaryLiveInputs(pack, {projectRoot});
if (process.env.A1_USER_AUTHORIZED_PLAN_SHA256 !== pack.source.canaryPlanSha256 || process.env.A1_USER_AUTHORIZED_REQUEST_PACK_SHA256 !== pack.packSha256) throw new Error("paragraph-canary-authorization-explicit-plan-or-pack-mismatch");
const current = readCurrentProductionAuthorizationBinding(appRoot);
const implementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const authorizationMode = process.env.A1_USER_AUTHORIZATION_MODE || "EXACT_PACK_SHA_COMMAND";
const receipt = createPackagingParagraphCanaryAuthorization({authorizationId: process.env.A1_USER_AUTHORIZATION_ID, authorized: true, issuedBy: process.env.A1_USER_ISSUED_BY, intent: process.env.A1_USER_AUTHORIZATION_INTENT, authorizationMode, userAuthorizationText: process.env.A1_USER_AUTHORIZATION_TEXT, operatorAttestedUserMessage: true, resolvedActionId: pack.dispatchPolicy.authorizationActionId, safeAutostartScopeNarrowedToCurrentPack: authorizationMode === "CURRENT_THREAD_SAFE_AUTOSTART_DIRECTIVE_BOUND_AT_ISSUANCE", workspaceSha256: current.workspaceSha256, workspaceFileSha256: current.workspaceFileSha256, transitionSha256: current.transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, canaryPlanSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, issuedAt: new Date().toISOString()});
const outputRoot = path.join(artifactRoot, "packaging-paragraph-canary-authorizations", pack.packSha256);
const outputPath = path.join(outputRoot, `${safeId}.json`);
if (fs.existsSync(outputPath)) throw new Error("paragraph-canary-authorization-receipt-already-exists");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: receipt.status, authorizationMode: receipt.userAuthorizationEvidence.mode, authorizedScope: receipt.authorizedScope, outputPath, receiptSha256: receipt.receiptSha256, implementationSha256: receipt.implementationSha256, workspaceSha256: receipt.workspaceSha256, transitionSha256: receipt.transitionSha256, imageGenerationPerformed: false, reviewCandidatePublished: false, productionAdmitted: false}, null, 2));
