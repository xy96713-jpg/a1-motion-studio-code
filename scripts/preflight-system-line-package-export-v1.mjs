#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {assertMediaEntrypointAuthorizationAudit, auditMediaEntrypointAuthorization} from "../apps/studio-next/src/lib/a1-media-entrypoint-authorization-v1.mjs";
import {preflightCanonicalPackageWriter} from "../apps/studio-next/src/lib/a1-canonical-package-writer-preflight-v1.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const binding = readCurrentProductionAuthorizationBinding(appRoot);
const registry = assertMediaEntrypointAuthorizationAudit(auditMediaEntrypointAuthorization({projectRoot}));
const writerPreflight = preflightCanonicalPackageWriter({workspace:binding.workspace,stage:"PACKAGE_EXPORT",registry});
const readyWhenAuthorized = writerPreflight.status === "READY_WHEN_PACKAGE_EXPORT_AUTHORIZED";
const result = {
  contract:"A1SystemLinePackageExportPreflight/v1",
  status:readyWhenAuthorized ? "READY_WHEN_PACKAGE_EXPORT_AUTHORIZED" : "BLOCKED_EXTERNAL_PACKAGE_EXPORT_GATES",
  blocker:writerPreflight.blockers,
  writerPreflight,
  workspaceSha256:binding.workspaceSha256,
  workspaceFileSha256:binding.workspaceFileSha256,
  transitionSha256:binding.transitionSha256,
  mediaGenerationPerformed:false,
  resolveProjectMutationPerformed:false,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = readyWhenAuthorized ? 0 : 2;
