#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const historyPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/typography-system-history-only-v1.json");
const FONT_ID = "type-pixel-correction";
const FONT_FAMILY = "A1 Fusion Pixel";
const FONT_SHA256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const LEGACY_FONT_IDS = new Set(["type-editorial-heavy", "type-slanted-display", "type-condensed-impact", "type-human-accent"]);
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const typographyAssets = current.library.assets.filter((asset) => asset.route === "project-font" || asset.route === "generated-glyph");
  const existingHistory = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : null;
  const history = {
    ...(existingHistory || {}),
    contract: "A1TypographyHistoryOnly/v1",
    status: "HISTORY_ONLY_COMPATIBILITY",
    current: false,
    supersededAt: now,
    reason: "旧字体角色和生成字形板不再属于当前单字体正式入口；保留用于追溯，不得回流当前构图。",
    libraryAssets: typographyAssets,
  };
  next.library.assets = next.library.assets.map((asset) => {
    const isTypographyAsset = asset.route === "project-font" || asset.route === "generated-glyph";
    if (!isTypographyAsset) return asset;
    const isCurrentFont = asset.id === FONT_ID;
    const nextAsset = {
      ...asset,
      current: isCurrentFont,
      historyOnly: !isCurrentFont,
      requiredForShotComposition: isCurrentFont,
      status: isCurrentFont ? "approved" : "HISTORY_ONLY_COMPATIBILITY",
      currentDirectionApproved: isCurrentFont,
      productionAdmitted: false,
      review: isCurrentFont
        ? asset.review
        : {...asset.review, status: "history-only", note: "已被当前单 Fusion Pixel 字体入口取代；仅保留历史追溯，不得进入当前逐镜构图。", reviewedAt: now, reviewedBy: "system"},
      supersededBy: isCurrentFont ? undefined : {fontId: FONT_ID, fontFamily: FONT_FAMILY, fontFileSha256: FONT_SHA256},
    };
    nextAsset.contentSha256 = editorialAssetContentSha256(nextAsset);
    return nextAsset;
  });
  next.production.typographyAssetsHistoryOnly = {
    contract: "A1TypographyAssetsHistoryPointer/v1",
    status: "HISTORY_ONLY_COMPATIBILITY",
    current: false,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/typography-system-history-only-v1.json",
    sha256: sha256(history),
    legacyFontIds: [...LEGACY_FONT_IDS],
    legacyGeneratedGlyphCount: typographyAssets.filter((asset) => asset.route === "generated-glyph").length,
  };
  if (next.production.typographyImagegenMasterBinding) next.production.typographyImagegenMasterBinding = {...next.production.typographyImagegenMasterBinding, current: false, authorityScope: "HISTORY_ONLY_COMPATIBILITY"};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "current-typography-assets-history-only-migrated",
    targetId: FONT_ID,
    payload: {
      currentFontId: FONT_ID,
      currentFontFamily: FONT_FAMILY,
      historyOnlyFontIds: [...LEGACY_FONT_IDS],
      historyOnlyGeneratedGlyphCount: typographyAssets.filter((asset) => asset.route === "generated-glyph").length,
      currentProjectFontCount: recalculated.library.assets.filter((asset) => asset.route === "project-font" && asset.current !== false).length,
      currentGeneratedGlyphCount: recalculated.library.assets.filter((asset) => asset.route === "generated-glyph" && asset.current !== false).length,
      productionAdmitted: false,
      motionAllowed: false,
    },
    now,
  });
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    files: {"typography-system-history-only-v1.json": history},
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `typography-assets-history-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
  });
  return {persisted, workspaceSha256: recalculated.workspaceSha256, eventId: event.eventId};
});

console.log(JSON.stringify({status: "PASS_CURRENT_TYPOGRAPHY_ASSETS_SINGLE_FONT", ...result}, null, 2));
