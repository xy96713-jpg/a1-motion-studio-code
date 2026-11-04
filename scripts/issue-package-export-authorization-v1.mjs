#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createAuthorizationReceipt,readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {buildPackageExportImplementationBinding} from "../apps/studio-next/src/lib/a1-package-export-implementation-binding-v1.mjs";

const authorizationId=process.env.A1_USER_AUTHORIZATION_ID;
const issuedBy=process.env.A1_USER_ISSUED_BY;
const intent=process.env.A1_USER_AUTHORIZATION_INTENT;
if(!authorizationId||!issuedBy||!intent) throw new Error("explicit-user-package-export-authorization-fields-required");
const root=path.resolve(import.meta.dirname,".."); const appRoot=path.join(root,"apps/studio-next");
const binding=readCurrentProductionAuthorizationBinding(appRoot); const implementation=buildPackageExportImplementationBinding(root);
const receipt=createAuthorizationReceipt({stage:"PACKAGE_EXPORT",authorizationId,authorized:true,issuedBy,intent,entrypointId:"system-line-canonical-package-export-v1",targetId:"CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT",outputRoute:"ROUTE_DECISION_REQUIRED",workspaceSha256:binding.workspaceSha256,workspaceFileSha256:binding.workspaceFileSha256,transitionSha256:binding.transitionSha256,implementationSha256:implementation.implementationSha256,issuedAt:new Date().toISOString()});
const receiptPath=path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/packaging-authorization-v5/package-export-receipt.json");
fs.mkdirSync(path.dirname(receiptPath),{recursive:true}); fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:"AUTHORIZED_PACKAGE_EXPORT_ONLY",receiptPath,receiptSha256:receipt.receiptSha256,implementationSha256:implementation.implementationSha256,workspaceSha256:receipt.workspaceSha256,workspaceFileSha256:receipt.workspaceFileSha256,transitionSha256:receipt.transitionSha256,mediaGenerationPerformed:false,resolveInsertAuthorized:false},null,2));
