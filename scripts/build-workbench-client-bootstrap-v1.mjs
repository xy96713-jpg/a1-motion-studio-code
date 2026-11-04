#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {prepareWorkbenchPackagingClientSnapshot} from "../apps/studio-next/src/lib/a1-workbench-client-snapshot-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicTransition = read(path.join(publicDir, "transition-receipt.json"));
const artifactTransition = read(path.join(artifactDir, "transition-receipt.json"));
if (publicTransition.contract !== "A1ProductionTransitionReceipt/v1" || artifactTransition.contract !== publicTransition.contract) throw new Error("bootstrap-transition-contract-invalid");
for (const key of ["workspaceSha256", "workspaceFileSha256", "transitionSha256"]) if (publicTransition[key] !== artifactTransition[key]) throw new Error(`bootstrap-transition-parity-invalid:${key}`);

const workspace = readProjectWorkspace(appRoot);
if (workspace.workspaceSha256 !== publicTransition.workspaceSha256) throw new Error("bootstrap-workspace-sha-invalid");
if (workspace.production?.packagingBoundary?.contract !== "A1EditorialPackagingBoundary/v1") throw new Error("bootstrap-packaging-boundary-required");
const bootstrap = {
  contract: "A1EditorialWorkbenchClientBootstrap/v1",
  snapshotKind: "PACKAGING_ONLY",
  workspaceSha256: publicTransition.workspaceSha256,
  workspaceFileSha256: publicTransition.workspaceFileSha256,
  transitionSha256: publicTransition.transitionSha256,
  generatedAt: new Date().toISOString(),
  workspace: prepareWorkbenchPackagingClientSnapshot(workspace),
};
const bytes = Buffer.from(`${JSON.stringify(bootstrap)}\n`, "utf8");
const writeAtomic = (dir) => {
  const target = path.join(dir, "client-bootstrap.json");
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, target);
};
writeAtomic(publicDir);
writeAtomic(artifactDir);
console.log(JSON.stringify({status: "PASS", contract: bootstrap.contract, snapshotKind: bootstrap.snapshotKind, workspaceSha256: bootstrap.workspaceSha256, bytes: bytes.byteLength, publicPath: path.join(publicDir, "client-bootstrap.json"), artifactPath: path.join(artifactDir, "client-bootstrap.json")}, null, 2));
