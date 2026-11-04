#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createAuthorizationReceipt,readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {buildStaticReviewImplementationBinding} from "../apps/studio-next/src/lib/a1-static-review-implementation-binding-v2.mjs";

// This issuer has no default authority. The caller must carry the user's explicit
// authorization identifier and is limited to the current hash-bound static-review target.
const authorizationId=process.env.A1_USER_AUTHORIZATION_ID;
const issuedBy=process.env.A1_USER_ISSUED_BY;
const intent=process.env.A1_USER_AUTHORIZATION_INTENT;
if (!authorizationId || !issuedBy || !intent) throw new Error("explicit-user-static-review-authorization-fields-required");
const root=path.resolve(import.meta.dirname,".."); const appRoot=path.join(root,"apps/studio-next");
const binding=readCurrentProductionAuthorizationBinding(appRoot);
const implementation=buildStaticReviewImplementationBinding(root);const receipt=createAuthorizationReceipt({stage:"STATIC_REVIEW",authorizationId,authorized:true,issuedBy,intent,entrypointId:"system-line-package-static-review-v1",targetId:"CURRENT_SYSTEM_LINE_STATIC_PACKAGE_REVIEW",outputRoute:"ROUTE_DECISION_REQUIRED",workspaceSha256:binding.workspaceSha256,workspaceFileSha256:binding.workspaceFileSha256,transitionSha256:binding.transitionSha256,implementationSha256:implementation.implementationSha256,issuedAt:new Date().toISOString()});
const receiptPath=path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/packaging-authorization-v4/static-review-receipt.json");
fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:"AUTHORIZED_STATIC_REVIEW_ONLY",receiptPath,receiptSha256:receipt.receiptSha256,implementationSha256:implementation.implementationSha256,workspaceSha256:receipt.workspaceSha256,workspaceFileSha256:receipt.workspaceFileSha256,transitionSha256:receipt.transitionSha256,mediaGenerationPerformed:false,packageExportAuthorized:false,resolveInsertAuthorized:false},null,2));
