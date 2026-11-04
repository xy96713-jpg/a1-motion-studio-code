#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sceneGraphSourceDependencySha256} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const asset = workspace.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === "ED-01");
assert.ok(asset, "ED-01 fixture required");

const withoutOptionalField = structuredClone(asset.shotDemand);
delete withoutOptionalField.sourceEvidenceSupportMaterialIds;
const withEmptyOptionalField = {...withoutOptionalField, sourceEvidenceSupportMaterialIds: []};
const withRealSupport = {...withoutOptionalField, sourceEvidenceSupportMaterialIds: ["source-documentary-preference-intercept-action"]};
const sceneGraph = asset.revisionHistory?.flatMap((entry) => entry.candidates || [])[0]?.sceneGraph || {};

const baseline = sceneGraphSourceDependencySha256(workspace, withoutOptionalField, sceneGraph);
const empty = sceneGraphSourceDependencySha256(workspace, withEmptyOptionalField, sceneGraph);
const supported = sceneGraphSourceDependencySha256(workspace, withRealSupport, sceneGraph);

assert.equal(empty, baseline, "an empty optional support list must not invalidate unrelated shot candidates");
assert.notEqual(supported, baseline, "real support evidence must participate in the shot dependency hash");

console.log(JSON.stringify({status: "PASS", baseline, empty, supported}, null, 2));
