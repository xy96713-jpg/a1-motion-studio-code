#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const FONT_ID = "type-pixel-correction";
const FONT_FAMILY = "A1 Fusion Pixel";
const FONT_SHA256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentTypography = structuredClone(current.typographySystem);
  const currentFoundry = structuredClone(current.production.typographyFoundry || null);
  const history = {
    contract: "A1TypographyHistoryOnly/v1",
    status: "HISTORY_ONLY_COMPATIBILITY",
    current: false,
    supersededAt: now,
    reason: "用户明确要求一个默认字体；字体差异不再承担当前镜头层级，统一由 Fusion Pixel + 构图 + 尺寸 + 材质 + 绑定关系承担。",
    sourceWorkspaceSha256: current.workspaceSha256,
    typographySystem: currentTypography,
    typographyFoundry: currentFoundry,
  };
  const next = structuredClone(current);
  const previousAssignments = Array.isArray(currentTypography.shotAssignments) ? currentTypography.shotAssignments : [];
  const currentAssignments = previousAssignments.map((assignment) => {
    const hasFormalText = Boolean(assignment.pixelFontAssetId) || (assignment.primaryFontAssetIds || []).length > 0;
    const primaryFontAssetIds = hasFormalText ? [FONT_ID] : [];
    return {
      ...assignment,
      pixelFontAssetId: hasFormalText ? FONT_ID : null,
      supportFontAssetId: null,
      primaryFontAssetIds,
      maxFontRoles: primaryFontAssetIds.length,
      maximumFontRoles: primaryFontAssetIds.length,
      longEvidenceCopyUsesReadableSupportFont: false,
    };
  });
  next.typographySystem = {
    ...currentTypography,
    status: "DEFAULT_SINGLE_FONT_READY_FOR_USER_REVIEW",
    authorityScope: "CURRENT_SINGLE_FONT",
    current: true,
    thesis: "Fusion Pixel 是全文唯一当前可编辑正式字体；构图、字号、留白、材质和绑定关系负责变化，不再用换字体制造层级。",
    referenceProfile: {
      ...(currentTypography.referenceProfile || {}),
      signatureFontAssetId: FONT_ID,
      supportFontAssetIds: [],
      maximumFontRolesPerShot: 1,
    },
    policy: {
      ...(currentTypography.policy || {}),
      minimumApprovedEditableFontRoles: 1,
      requiredGeneratedGlyphBoardIds: [],
      singleFontAssetId: FONT_ID,
      singleFontFamily: FONT_FAMILY,
      minimumDirectionsPerDisplayTitle: 0,
      maximumFontRolesPerShot: 1,
      generatedGlyphsRequireEditableTextShadow: false,
      generatedGlyphsRequireExactCharacterReview: false,
    },
    editableFontRoles: [{id: FONT_ID, family: FONT_FAMILY, role: "全文唯一当前正式字体；通过构图、尺寸、留白、材质与绑定变化", sample: "改一句\n留下重点"}],
    displayTreatments: [],
    shotAssignments: currentAssignments,
    hardFailures: ["default-system-font-fallback", "multiple-current-fonts", "subtitle-stack-as-title", "unverified-ai-lettering", "generated-evidence-text", "generic-title-card"],
    visualGenerationPolicy: {
      ...(currentTypography.visualGenerationPolicy || {}),
      typography: {
        ...(currentTypography.visualGenerationPolicy?.typography || {}),
        signatureFontAssetId: FONT_ID,
        supportFontAssetIds: [],
        singleFontAssetId: FONT_ID,
        singleFontFamily: FONT_FAMILY,
      },
    },
  };
  if (next.visualBible) {
    next.visualBible = {
      ...next.visualBible,
      typographyRoles: [{id: FONT_ID, family: FONT_FAMILY, role: "全文唯一当前正式字体"}],
      visualGenerationPolicy: next.visualBible.visualGenerationPolicy
        ? {
            ...next.visualBible.visualGenerationPolicy,
            typography: {
              ...(next.visualBible.visualGenerationPolicy.typography || {}),
              signatureFontAssetId: FONT_ID,
              supportFontAssetIds: [],
              singleFontAssetId: FONT_ID,
              singleFontFamily: FONT_FAMILY,
            },
          }
        : next.visualBible.visualGenerationPolicy,
    };
  }
  if (next.production.typographyFoundry) {
    next.production.typographyFoundry = {
      ...next.production.typographyFoundry,
      current: false,
      authorityScope: "HISTORY_ONLY_COMPATIBILITY",
      supersededBy: {fontId: FONT_ID, fontFamily: FONT_FAMILY, fontFileSha256: FONT_SHA256},
    };
  }
  const dispositions = structuredClone(next.production.articleAssetLegacyDisposition || {
    contract: "A1ArticleAssetAuthoritySupersessionManifest/v1",
    status: "PASS",
    dispositions: [],
  });
  const disposition = {
    id: "legacy-multi-font-typography-system",
    status: "SUPERSEDED_HISTORY_ONLY",
    current: false,
    evidence: {path: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/typography-system-history-only-v1.json", sha256: sha256(history)},
    reason: "用户明确不采用多字体当前方向；Source Han、Smiley Sans、Serif Impact、Ma Shan Zheng 与生成字形板只保留兼容历史，不得回流当前正式字体入口。",
    supersededBy: {fontId: FONT_ID, fontFamily: FONT_FAMILY, fontFileSha256: FONT_SHA256},
  };
  dispositions.dispositions = [...(dispositions.dispositions || []).filter((item) => item.id !== disposition.id), disposition];
  const dispositionBody = structuredClone(dispositions);
  delete dispositionBody.supersessionManifestSha256;
  dispositions.supersessionManifestSha256 = sha256(dispositionBody);
  next.production.articleAssetLegacyDisposition = dispositions;
  next.production.typographySystemHistoryOnly = {
    contract: "A1TypographyHistoryPointer/v1",
    status: "HISTORY_ONLY_COMPATIBILITY",
    current: false,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/typography-system-history-only-v1.json",
    sha256: sha256(history),
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "current-typography-single-font-migrated",
    targetId: FONT_ID,
    payload: {
      fontId: FONT_ID,
      fontFamily: FONT_FAMILY,
      fontFileSha256: FONT_SHA256,
      previousEditableFontRoleCount: currentTypography.editableFontRoles?.length || 0,
      currentEditableFontRoleCount: recalculated.typographySystem.editableFontRoles?.length || 0,
      currentGeneratedGlyphBoardCount: recalculated.typographySystem.policy.requiredGeneratedGlyphBoardIds.length,
      foundryCurrent: recalculated.production.typographyFoundry?.current ?? null,
      productionAdmitted: false,
      motionAllowed: false,
    },
    now,
  });
  const {publicDir, artifactDir} = projectDirs(appRoot);
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    files: {"typography-system-history-only-v1.json": history},
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `single-font-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
  });
  return {persisted, workspaceSha256: recalculated.workspaceSha256, publicDir, artifactDir, eventId: event.eventId};
});

console.log(JSON.stringify({status: "PASS_CURRENT_SINGLE_FONT_AUTHORITY", ...result}, null, 2));
