#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const workspace = readProjectWorkspace(appRoot);
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const report = JSON.parse(fs.readFileSync(path.join(publicDir, "whole-film-static-board-v1/report.json"), "utf8"));

assert.equal(board.status, "PENDING_USER_APPROVAL");
assert.equal(report.current, true);
assert.equal(report.authorityScope, "CURRENT");
assert.equal(report.board.sha256, board.sha256);
assert.equal(report.items.length, board.itemCount);
assert.equal(report.packageCount, 13);
assert.equal(report.noPackageCount, 21);
assert.equal(report.timelineBoard.sha256, board.timelineBoard.sha256);
assert.equal(report.timelineBoard.itemCount, 34);
assert.equal(report.formalAssemblyCount, 0);
assert.equal(report.assemblyCreationAllowed, false);
assert.equal(report.layerReconstructionAllowed, false);
assert.equal(report.criticAllowed, false);
assert.equal(report.motionAllowed, false);
assert.equal(report.queue.queued, 0);
assert.equal(report.queue.running, 0);
assert.equal(report.workerStatus, "frozen");

console.log(JSON.stringify({status: "PASS", boardSha256: board.sha256, packageCount: report.packageCount, noPackageCount: report.noPackageCount, timelineCount: report.timelineBoard.itemCount}, null, 2));
