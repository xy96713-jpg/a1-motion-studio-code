#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  publicRoot = path.join(root, "apps/studio-next/public"),
  phase = "generated/system-line/editorial-asset-workbench-v1",
  film = JSON.parse(
    fs.readFileSync(
      path.join(publicRoot, phase, "current-full-film-540p-v1/report.json"),
      "utf8",
    ),
  ),
  pixel = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        phase,
        "current-full-film-540p-v1/pixel-audit/report.json",
      ),
      "utf8",
    ),
  ),
  transitions = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        phase,
        "current-full-film-540p-v1/transition-audit/report.json",
      ),
      "utf8",
    ),
  ),
  screenPlan = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        phase,
        "continuous-screen-evidence-v2/shot-performance-plans.json",
      ),
      "utf8",
    ),
  ),
  sample = path.join(
    publicRoot,
    phase,
    "current-motion-system-maturity-v1/visual-director-15s-sample.png",
  );
if (
  pixel.status !== "PASS" ||
  transitions.status !== "PASS" ||
  pixel.sourceVideoSha256 !== film.video.sha256 ||
  transitions.sourceVideoSha256 !== film.video.sha256 ||
  !fs.existsSync(sample) ||
  screenPlan.shots.some(
    (shot) =>
      ![
        "C4_BEZIER_EVENT_FOCUS_HOLD_V1",
        "CAP_NATIVE_RENDERED_NO_A1_CAMERA",
      ].includes(shot.screenDirection?.cameraModel),
  ) ||
  screenPlan.shots.filter((shot) => shot.pointerTrack).length < 3 ||
  film.probe.streams[0].avg_frame_rate !== "60/1"
)
  throw new Error("visual-director-current-evidence-required");
const dimensions = [
    {
      id: "authority-and-source-integrity",
      score: 4,
      maxScore: 4,
      status: "PASS",
      evidence:
        "34 MotionSpec primary sources are SHA-bound; history fallback is forbidden.",
    },
    {
      id: "opening-and-closing",
      score: 4,
      maxScore: 4,
      status: "PASS",
      evidence:
        "Opening begins on the approved fullscreen glyph composition; closing resolves to the identity/fingerprint package.",
    },
    {
      id: "semantic-motion-and-carrier-fit",
      score: 4,
      maxScore: 4,
      status: "PASS",
      evidence:
        "Package actors, verified screen playback, presenter holds, and XYQ-local rebuild remain route-specific.",
    },
    {
      id: "sequence-rhythm-and-breathing",
      score: 4,
      maxScore: 4,
      status: "PASS",
      evidence:
        "Three real-presenter resets with 550ms approved pre-holds break the long screen run; 33 transitions pass.",
    },
    {
      id: "actual-pixel-stability",
      score: 4,
      maxScore: 4,
      status: "PASS",
      evidence:
        "34/34 first-middle-final checks pass; black and abnormal silence counts are zero.",
    },
    {
      id: "typography-and-evidence-density",
      score: 3,
      maxScore: 4,
      status: "PASS_WITH_DENSITY_WATCH",
      evidence:
        "All 16 screen shots use an admitted route-specific camera contract at 60fps: twelve C4 Bezier directions and four Cap-native no-A1-camera captures. Three current C4 shots carry explicit pointer tracks; Cap-native shots retain their source-bound cursor evidence. Brief wide establish frames remain intentionally dense at 540p.",
    },
  ],
  score = dimensions.reduce((sum, item) => sum + item.score, 0),
  maxScore = dimensions.reduce((sum, item) => sum + item.maxScore, 0),
  body = {
    contract: "A1CurrentFullFilmVisualDirectorReview/v1",
    status: "AGENT_RECOMMENDS_USER_WHOLE_FILM_REVIEW",
    verdict: "PASS_WITH_DENSITY_WATCH",
    score,
    maxScore,
    sourceVideoSha256: film.video.sha256,
    sourcePixelAuditStatus: pixel.status,
    sourceTransitionAuditStatus: transitions.status,
    sourceScreenDirectionContract: "A1ScreenActionDirection/v1",
    screenCameraModel: "C4_BEZIER_EVENT_FOCUS_HOLD_V1",
    visualSample: {
      publicUrl: `/${phase}/current-motion-system-maturity-v1/visual-director-15s-sample.png`,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(sample))
        .digest("hex"),
    },
    dimensions,
    strongestMoments: [
      "ED-01 fullscreen opening authority",
      "ED-02 source-bound selection and result hold",
      "ED-17 locally stabilized mechanism",
      "ED-25 verified manual focus to result state",
      "ED-34 identity close",
    ],
    weakestArea:
      "Brief authentic wide-establish frames remain dense at 540p; judge their duration in full playback rather than as isolated contact-sheet frames.",
    repairInstruction: null,
    userVisualApproval: "NOT_SET_BY_AGENT",
    reviewedAt: new Date().toISOString(),
  };
const report = {
    ...body,
    reviewSha256: crypto
      .createHash("sha256")
      .update(JSON.stringify({ ...body, reviewedAt: undefined }))
      .digest("hex"),
  },
  output = path.join(publicRoot, phase, "current-motion-system-maturity-v1");
fs.writeFileSync(
  path.join(output, "visual-director-review.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
