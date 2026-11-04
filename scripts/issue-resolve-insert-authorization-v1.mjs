#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createAuthorizationReceipt, readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {buildResolveInsertImplementationBinding} from "../apps/studio-next/src/lib/a1-resolve-insert-implementation-binding-v1.mjs";

const authorizationId = process.env.A1_USER_AUTHORIZATION_ID;
const issuedBy = process.env.A1_USER_ISSUED_BY;
const intent = process.env.A1_USER_AUTHORIZATION_INTENT;
const projectId = process.env.A1_RESOLVE_PROJECT_ID;
const timelineId = process.env.A1_RESOLVE_TIMELINE_ID;
const timelineSha256 = process.env.A1_RESOLVE_TIMELINE_SHA256;
if (!authorizationId || !issuedBy || !intent || !projectId || !timelineId || !/^[a-f0-9]{64}$/u.test(String(timelineSha256 || ""))) throw new Error("explicit-user-resolve-insert-authorization-and-live-target-required");
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const binding = readCurrentProductionAuthorizationBinding(appRoot);
const implementation = buildResolveInsertImplementationBinding(root);
const receipt = createAuthorizationReceipt({stage: "RESOLVE_INSERT", authorizationId, authorized: true, issuedBy, intent, entrypointId: "system-line-resolve-insert-v1", targetId: `${projectId}:${timelineId}`, outputRoute: "A1_RESOLVE_PACKAGING_INSERT_PLAN_V1", workspaceSha256: binding.workspaceSha256, workspaceFileSha256: binding.workspaceFileSha256, transitionSha256: binding.transitionSha256, implementationSha256: implementation.implementationSha256, targetBinding: {projectId, timelineId, timelineSha256}, issuedAt: new Date().toISOString()});
const receiptPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/packaging-authorization-v6/resolve-insert-receipt.json");
fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({status: "AUTHORIZED_RESOLVE_INSERT_ONLY", receiptPath, receiptSha256: receipt.receiptSha256, implementationSha256: implementation.implementationSha256, workspaceSha256: receipt.workspaceSha256, workspaceFileSha256: receipt.workspaceFileSha256, transitionSha256: receipt.transitionSha256, resolveInsertAuthorized: true, mediaRender: false}, null, 2));
