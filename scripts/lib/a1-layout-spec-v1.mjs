// A1 layout spec v1 — geometric typography contract for 1920x1080 presenter shots.
// Method adopted from published layout methodology (12-col grid, spacing tokens,
// type scale, presenter-side placement, 9-point mechanical validation).
// Numbers are standard design practice (not copyrightable); no third-party code copied.
// Mechanical checks only — this NEVER grants aesthetic approval.

export const A1_LAYOUT_SPEC_V1 = "A1LayoutSpec/v1";

export const SPEC = {
  width: 1920,
  height: 1080,
  safeArea: 96,          // action-safe, all four edges
  titleMargin: 160,      // tighter bound for title blocks
  subtitleBandTop: 900,  // y >= 900 is subtitle-only; subject bottom <= 860
  subjectBottomMax: 860,
  columns: 12,
  gutter: 32,
  contentWidth: 1728,    // 1920 - 2*96
  spacingTokens: [8, 16, 24, 32, 48, 64, 96, 160],
  typeScale: {
    hero: [96, 120],
    headline2line: [72, 84],
    title: [64, 72],
    subtitle: [44, 44],
    body: [40, 44],
    caption: [28, 32],
    micro: [22, 24],
  },
  minReadable: 28,
  minListItem: 40,
  edgeFailBelow: 64,     // closer than this to a frame edge = P1 贴边
  snapTolerance: 4,      // column-line snap tolerance
  centerTolerance: 48,   // off-center tolerance for a centering layout
  contactTolerance: 8,   // annotation must enclose target within this
};

// one-line CJK headline -> font size tier (from published 字数→字号档 mapping)
export function headlineSizeFor(charsPerLine, lineCount = 1) {
  if (lineCount >= 3) return 64;
  if (lineCount === 2) return charsPerLine >= 9 ? 72 : 84;
  return charsPerLine <= 6 ? 120 : 96;
}
// tier name matching a headline size, so the tier check never fights the size table
export function headlineTierFor(charsPerLine, lineCount = 1) {
  return lineCount >= 2 ? "headline2line" : "hero";
}

export {gridLine as colLine};
// explicit column geometry (avoids accumulated rounding)
export function gridLine(i) {
  const colW = (SPEC.contentWidth - (SPEC.columns - 1) * SPEC.gutter) / SPEC.columns;
  return SPEC.safeArea + i * (colW + SPEC.gutter);
}
export function gridColumnWidth() {
  return (SPEC.contentWidth - (SPEC.columns - 1) * SPEC.gutter) / SPEC.columns;
}
// right edge of a span starting at column 0 == the right safe edge
export const gridRightEdge = () => gridLine(SPEC.columns - 1) + gridColumnWidth();
export const gridSpanWidth = (span) => span * gridColumnWidth() + (span - 1) * SPEC.gutter;

// ---- element model -------------------------------------------------------
// element: { id, kind:"type"|"block"|"annotation", text?, box:{x,y,w,h},
//            fontSize?, tier?, minGapAfter?, role?, targetBox? }

export function validateLayout({ elements = [], presenter = null, centering = null, debug = {} }) {
  const W = SPEC.width, H = SPEC.height;
  const fail = (code, severity, detail) => ({ code, severity, detail });
  const out = [];

  // 1. edge proximity (< 64 from any frame edge) — a deliberate full-bleed
  //    element declares bleed:true and is exempt (bleed is a real design move).
  for (const el of elements) {
    if (el.bleed) continue;
    const d = Math.min(el.box.x, el.box.y, W - (el.box.x + el.box.w), H - (el.box.y + el.box.h));
    if (d < SPEC.edgeFailBelow) out.push(fail("EDGE_PROXIMITY", "P1", `${el.id} is ${Math.round(d)}px from a frame edge`));
  }

  // 2. spacing inversion: inner gap > outer gap for a declared group
  for (const el of elements) {
    if (el.groupGap == null || el.outerGap == null) continue;
    if (el.groupGap > el.outerGap) out.push(fail("SPACING_INVERTED", "P1", `${el.id} groupGap ${el.groupGap} > outerGap ${el.outerGap}`));
  }

  // 3. left edges snapped to a column line, or glyph-aligned to a sibling
  for (const el of elements) {
    if (el.bleed || el.alignBasis === "glyph" || el.alignBasis === "center") continue;
    const near = [...Array(SPEC.columns).keys()]
      .map(gridLine).some((x) => Math.abs(x - el.box.x) <= SPEC.snapTolerance);
    if (!near) out.push(fail("NOT_ON_GRID", "P1", `${el.id} left ${Math.round(el.box.x)} not within ${SPEC.snapTolerance}px of a column line`));
  }

  // 4. centering: group bbox center must be near the intended center
  if (centering) {
    const dev = Math.abs(centering.actualCenterX - centering.targetCenterX);
    if (dev > SPEC.centerTolerance) out.push(fail("OFF_CENTER", "P1", `group center off by ${Math.round(dev)}px (tol ${SPEC.centerTolerance})`));
  }

  // 5. annotation boxes must enclose their target
  for (const el of elements) {
    if (el.kind !== "annotation" || !el.targetBox) continue;
    const t = el.targetBox, b = el.box;
    const pad = [b.x - t.x, b.y - t.y, (t.x + t.w) - (b.x + b.w), (t.y + t.h) - (b.y + b.h)];
    if (pad.some((p) => p < 0) || pad.some((p) => p > 24)) {
      out.push(fail("ANNOTATION_MISMATCH", "P1", `${el.id} does not enclose target with 0-24px breathing room`));
    }
  }

  // 6. type size below its tier floor
  for (const el of elements) {
    if (el.kind !== "type" || !el.tier) continue;
    const range = SPEC.typeScale[el.tier];
    if (!range) continue;
    if (el.fontSize < range[0] - 0.5) out.push(fail("TYPE_SIZE_BELOW_TIER", "P1", `${el.id} ${el.fontSize}px below ${el.tier} floor ${range[0]}`));
    if (el.fontSize < SPEC.minReadable) out.push(fail("BELOW_MIN_READABLE", "P1", `${el.id} ${el.fontSize}px < ${SPEC.minReadable}`));
  }
  for (const el of elements) {
    if (el.kind === "type" && el.role === "list-item" && el.fontSize < SPEC.minListItem) {
      out.push(fail("LIST_ITEM_TOO_SMALL", "P1", `${el.id} list item ${el.fontSize}px < ${SPEC.minListItem}`));
    }
  }
  // advisory (P2): type above the explainer tier ceiling. A deliberate identity
  // card may exceed it, so this never blocks the layout — it just records that
  // the element is outside the restrained tier table.
  for (const el of elements) {
    if (el.kind !== "type" || !el.tier || el.allowAboveTier) continue;
    const range = SPEC.typeScale[el.tier];
    if (!range) continue;
    if (el.fontSize > range[1] + 0.5) {
      out.push(fail("TYPE_ABOVE_EXPLAINER_TIER", "P2", `${el.id} ${el.fontSize}px exceeds ${el.tier} ceiling ${range[1]}`));
    }
  }

  // 7. bounding boxes must not intersect (except declared deliberate overlaps)
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const a = elements[i], b = elements[j];
      if (a.mayOverlap || b.mayOverlap) continue;
      const ix = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const iy = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      if (ix > 0 && iy > 0) out.push(fail("BOX_COLLISION", "P1", `${a.id} intersects ${b.id} (${Math.round(ix)}x${Math.round(iy)}px)`));
    }
  }

  // 8. same-group blocks must not share an identical backing colour
  const byGroup = {};
  for (const el of elements) {
    if (el.backingColor && el.group) (byGroup[el.group] ||= []).push(el);
  }
  for (const [g, list] of Object.entries(byGroup)) {
    const colors = list.map((e) => e.backingColor);
    if (new Set(colors).size < colors.length) out.push(fail("DUPLICATE_BACKING", "P1", `group ${g} repeats backing colour`));
  }

  // 9. hero uniqueness — only one element may carry the hero tier in one frame
  const heroes = elements.filter((e) => e.tier === "hero");
  if (heroes.length > 1) out.push(fail("MULTIPLE_HERO", "P1", `${heroes.length} hero-tier elements in one frame: ${heroes.map((h) => h.id).join(", ")}`));

  // bonus mechanical guards specific to presenter shots
  if (presenter) {
    for (const el of elements) {
      if (el.mayOverlap) continue;
      if (el.box.y + el.box.h > SPEC.subjectBottomMax && el.kind !== "type") {
        out.push(fail("INTO_SUBTITLE_BAND", "P1", `${el.id} bottom ${Math.round(el.box.y + el.box.h)} crosses ${SPEC.subjectBottomMax}`));
      }
      const fx = Math.min(el.box.x + el.box.w, presenter.face.x + presenter.face.w) - Math.max(el.box.x, presenter.face.x);
      const fy = Math.min(el.box.y + el.box.h, presenter.face.y + presenter.face.h) - Math.max(el.box.y, presenter.face.y);
      if (fx > 0 && fy > 0) out.push(fail("FACE_SAFETY_VIOLATION", "P1", `${el.id} enters face-safe box`));
    }
    // presenter-side placement: a non-overlapping group must sit on the free
    // side of the subject, not straddle it. This replaces the centering rule
    // for shots where the presenter is not perfectly centred.
    if (presenter.side) {
      const subjectCentre = presenter.subject.x + presenter.subject.w / 2;
      for (const el of elements) {
        if (el.bleed || el.mayOverlap || el.kind === "type" && el.bleed) continue;
        const groupCentre = el.box.x + el.box.w / 2;
        const wantsLeft = presenter.side === "left";
        if (wantsLeft && groupCentre >= subjectCentre) {
          out.push(fail("WRONG_PRESENTER_SIDE", "P1", `${el.id} centre ${Math.round(groupCentre)} is not left of subject centre ${Math.round(subjectCentre)}`));
        }
        if (!wantsLeft && groupCentre <= subjectCentre) {
          out.push(fail("WRONG_PRESENTER_SIDE", "P1", `${el.id} centre ${Math.round(groupCentre)} is not right of subject centre ${Math.round(subjectCentre)}`));
        }
      }
    }
  }

  const p1 = out.filter((f) => f.severity === "P1").length;
  return {
    contract: A1_LAYOUT_SPEC_V1,
    spec: SPEC,
    status: p1 === 0 ? "SPEC_PASS" : "SPEC_FAIL",
    p1Failures: p1,
    failures: out,
    aestheticApproval: "NONE_MECHANICAL_ONLY",
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    ...debug,
  };
}

// presenter-side placement helper: put a group on the side opposite the subject
export function presenterSideCenter(presenter, groupWidth) {
  const subjectCenter = presenter.subject.x + presenter.subject.w / 2;
  const onLeft = subjectCenter > SPEC.width / 2;
  const sideCenter = onLeft ? SPEC.width / 4 : (SPEC.width * 3) / 4; // 480 or 1440
  const x = Math.max(SPEC.safeArea, Math.min(SPEC.width - SPEC.safeArea - groupWidth, sideCenter - groupWidth / 2));
  return {x, sideCenterX: sideCenter, onLeft};
}
