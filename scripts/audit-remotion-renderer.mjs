import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { toStoryboardRenderProps } from "../lib/storyboard-render-props.js";
import { LAYOUT_PRIMITIVE_CONTRACT, LAYOUT_PRIMITIVES } from "../lib/storyboard-layout-primitives.js";

const root = process.cwd();
const rendererDir = path.join(root, "remotion-renderer");
const artifactDir = path.join(root, ".codex-artifacts", "remotion-renderer");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd: options.cwd || root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeout || 180000,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`,
    };
  }
}

async function read(file) {
  return fs.readFile(path.join(rendererDir, file), "utf8");
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const reportPath = path.join(artifactDir, "audit-report.json");
  for (const file of ["package.json", "remotion.config.ts", "src/schema.ts", "src/A1Video.tsx", "src/Root.tsx", "src/index.ts"]) {
    assert(fsSync.existsSync(path.join(rendererDir, file)), `renderer missing ${file}`);
  }

  const schema = await read("src/schema.ts");
  const video = await read("src/A1Video.tsx");
  const vectorStart = video.indexOf("function VectorExplainerScene");
  const vectorEnd = video.indexOf("function QuoteScene", vectorStart);
  const vectorSource = vectorStart >= 0 && vectorEnd > vectorStart ? video.slice(vectorStart, vectorEnd) : "";
  const quoteStart = video.indexOf("function QuoteScene");
  const quoteEnd = video.indexOf("function ClosingScene", quoteStart);
  const quoteSource = quoteStart >= 0 && quoteEnd > quoteStart ? video.slice(quoteStart, quoteEnd) : "";
  const dataMapStart = video.indexOf("function DataMapScene");
  const dataMapEnd = video.indexOf("function SceneRenderer", dataMapStart);
  const dataMapSource = dataMapStart >= 0 && dataMapEnd > dataMapStart ? video.slice(dataMapStart, dataMapEnd) : "";
  const rootFile = await read("src/Root.tsx");
  const remotionConfig = await read("remotion.config.ts");
  const rendererPackage = JSON.parse(await read("package.json"));
  assert(/z\.object/u.test(schema) && /A1VideoSchema/u.test(schema), "renderer must define Zod A1VideoSchema");
  assert(rendererPackage.dependencies?.["@remotion/three"] === "4.0.396", "renderer must install @remotion/three pinned to the Remotion version");
  assert(/setChromiumOpenGlRenderer\(["']swangle["']\)/u.test(remotionConfig), "renderer must configure Chromium OpenGL for ThreeCanvas export");
  assert(/RenderStackPlanSchema/u.test(schema) && /A1RenderStackPlan\/v1/u.test(schema), "renderer schema must accept A1RenderStackPlan/v1");
  assert(/VisualAssetStrategySchema/u.test(schema) && /visualAssetStrategy:\s*VisualAssetStrategySchema\.optional\(\)\.nullable\(\)/u.test(schema), "renderer scene schema must preserve visualAssetStrategy render stack");
  assert(/webAssetBrief:\s*z\.object/u.test(schema), "renderer scene schema must preserve webAssetBrief render stack fallback");
  assert(/SkillRouteSchema/u.test(schema) && /A1StoryboardSceneSkillRoute\/v1/u.test(schema), "renderer schema must accept A1 storyboard skill routes");
  assert(/skillRoute:\s*SkillRouteSchema\.optional\(\)/u.test(schema), "renderer SceneSchema and IR frame schema must carry skillRoute");
  assert(/ShotSkillPackPlanSchema/u.test(schema) && /A1ShotSkillPackPlan\/v1/u.test(schema), "renderer schema must accept A1ShotSkillPackPlan/v1");
  assert(/skillPackPlan:\s*ShotSkillPackPlanSchema\.optional\(\)\.nullable\(\)/u.test(schema), "renderer scene and runtime shots must carry skillPackPlan");
  assert(/HtmlVideoIrSchema/u.test(schema) && /A1HtmlVideoIR\/v1/u.test(schema), "renderer schema must accept A1HtmlVideoIR/v1");
  assert(/ArticleFilmTimelineRuntimeSchema/u.test(schema) && /A1ArticleFilmTimelineRuntime\/v1/u.test(schema), "renderer schema must accept A1ArticleFilmTimelineRuntime/v1");
  assert(/A1TransitionBrief\/v1/u.test(schema) && /transitionBriefs:\s*z\.array/u.test(schema) && /transitionBrief:/u.test(schema), "renderer schema must accept A1TransitionBrief/v1 on runtime and shots");
  assert(/TransitionActorAnchorSchema/u.test(schema) && /A1TransitionActorAnchor\/v1/u.test(schema), "renderer schema must accept transition actor anchors");
  assert(/ActorHandoffTransitionSchema/u.test(schema) && /A1ActorHandoffTransition\/v1/u.test(schema) && /actorHandoff:\s*ActorHandoffTransitionSchema\.optional\(\)/u.test(schema), "renderer schema must accept A1ActorHandoffTransition/v1 on transition briefs");
  assert(/ShotActorAnchorMapSchema/u.test(schema) && /A1ShotActorAnchorMap\/v1/u.test(schema) && /actorAnchorMap:\s*ShotActorAnchorMapSchema/u.test(schema), "renderer schema must accept per-shot actor anchor maps");
  assert(/FilmShotDisplayTextSchema/u.test(schema) && /A1FilmShotDisplayText\/v1/u.test(schema), "renderer schema must accept A1FilmShotDisplayText/v1");
  assert(/KineticTextEmphasisPlanSchema/u.test(schema) && /A1KineticTextEmphasisPlan\/v1/u.test(schema), "renderer schema must accept A1KineticTextEmphasisPlan/v1");
  assert(/ShotPhraseActorMapSchema/u.test(schema) && /A1ShotPhraseActorMap\/v1/u.test(schema) && /A1PhraseActorTimingWindow\/v1/u.test(schema), "renderer schema must accept A1ShotPhraseActorMap/v1 with phrase timing windows");
  assert(/shotPhraseActorMap:\s*ShotPhraseActorMapSchema\.optional\(\)\.nullable\(\)/u.test(schema) && /phraseActorMap:\s*ShotPhraseActorMapSchema\.optional\(\)\.nullable\(\)/u.test(schema), "renderer scene/runtime schemas must carry shot phrase actor maps");
  assert(/emphasisPlan:\s*KineticTextEmphasisPlanSchema\.optional\(\)\.nullable\(\)/u.test(schema), "film display text must carry kinetic emphasis plan");
  assert(/filmDisplayText:\s*FilmShotDisplayTextSchema\.optional\(\)\.nullable\(\)/u.test(schema) && /displayText:\s*FilmShotDisplayTextSchema\.optional\(\)/u.test(schema), "renderer schema must carry film display text on scenes and runtime shots");
  assert(/gsapContract:\s*z\.literal\(["']paused-gsap-timeline-registerable["']\)/u.test(schema), "renderer schema must preserve paused GSAP timeline contract");
  assert(/remotionContract:\s*z\.literal\(["']frame-progress-interpreter["']\)/u.test(schema), "renderer schema must preserve Remotion frame interpreter contract");
  assert(/motionCueCount:\s*z\.number\(\)\.optional\(\)/u.test(schema), "renderer schema must preserve article-film motion cue count");
  assert(/motionCues:\s*z\.array\(z\.object/u.test(schema) && /technique:\s*z\.string\(\)\.optional\(\)/u.test(schema), "renderer schema must accept per-shot motion cues");
  assert(/motionBridgeIn:\s*z\.string\(\)\.optional\(\)/u.test(schema), "renderer schema must accept IR motionBridgeIn");
  assert(/motionBridgeOut:\s*z\.string\(\)\.optional\(\)/u.test(schema), "renderer schema must accept IR motionBridgeOut");
  assert(/transitionEffectIn:\s*z\.string\(\)\.optional\(\)/u.test(schema), "renderer schema must accept IR transitionEffectIn");
  assert(/transitionEffectOut:\s*z\.string\(\)\.optional\(\)/u.test(schema), "renderer schema must accept IR transitionEffectOut");
  assert(/contentGraph:\s*z\.object/u.test(schema) && /htmlVideoIr:\s*HtmlVideoIrSchema/u.test(schema), "renderer schema must carry contentGraph.htmlVideoIr");
  assert(/htmlVideoIr:\s*HtmlVideoIrSchema/u.test(schema), "renderer schema must carry top-level htmlVideoIr");
  assert(/schema=\{A1VideoSchema\}/u.test(rootFile), "Composition must use schema prop");
  assert(/globalMotionMotif:\s*z\.object/u.test(schema), "renderer schema must carry globalMotionMotif");
  assert(/defaultProps=\{defaultProps\}/u.test(rootFile), "Composition must use defaultProps");
  assert(/calculateMetadata/u.test(rootFile), "Composition must use calculateMetadata");
  assert(/durationFromIr/u.test(rootFile) && /frameNodes\.reduce/u.test(rootFile), "calculateMetadata must derive duration from html-video IR frameNodes when present");
  assert(/articleFilmTimelineRuntime/u.test(rootFile) && /totalFrames/u.test(rootFile), "calculateMetadata must prefer ArticleFilmTimelineRuntime totalFrames when present");
  assert(/Series\.Sequence/u.test(video), "renderer must use Series.Sequence");
  assert(/sceneRecordsFromIr/u.test(video) && /ir\.frameNodes/u.test(video), "renderer must build Remotion sequence records from A1HtmlVideoIR frameNodes");
  assert(/data-html-video-ir-contract/u.test(video) && /data-ir-frame-index/u.test(video), "renderer must expose html-video IR markers in still DOM");
  assert(/data-skill-route-contract/u.test(video) && /data-skill-id/u.test(video), "renderer must expose scene skill route markers in still DOM");
  assert(/data-skill-source-project/u.test(video) && /data-skill-template-candidates/u.test(video), "renderer must expose skill source and template candidates in still DOM");
  assert(/function visualTreatmentDataset\(scene: A1Scene\)/u.test(video) && /data-primary-visual-form/u.test(video) && /data-renderer-route/u.test(video), "renderer must expose A1ShotVisualTreatment/v1 markers");
  assert(/data-visual-world/u.test(video) && /data-material-strategy/u.test(video) && /data-material-main-surface/u.test(video), "renderer must expose material-first visual world and main-surface strategy");
  assert(/data-static-frame-quality-contract/u.test(video) && /frameQualityPlan/u.test(video), "renderer must expose still-frame-first quality plan markers");
  assert(/data-visual-routing-decision/u.test(video) && /data-template-after-medium/u.test(video) && /data-spatial-3d-allowed/u.test(video), "renderer must expose medium-before-template and explicit-spatial routing decisions");
  assert(/data-asset-preferred-surface/u.test(video), "renderer must expose preferred asset/material surface from the visual director");
  assert(/data-global-motion-motif-contract/u.test(video) && /data-global-motion-motif-id/u.test(video), "renderer must expose global motion motif markers");
  assert(/data-global-motion-rhythm/u.test(video) && /data-global-motion-accent-strategy/u.test(video), "renderer must expose global rhythm and accent strategy markers");
  assert(/useCurrentFrame/u.test(video) && /interpolate/u.test(video), "renderer must use deterministic Remotion frame animation");
  assert(/function runtimeForProps/u.test(video) && /function articleFilmRuntimePosition/u.test(video), "renderer must interpret ArticleFilmTimelineRuntime from frame state");
  assert(/function displayTextFor\(scene:\s*A1Scene,\s*runtimeShot\?:\s*ArticleFilmRuntimeShot/u.test(video) && /runtimeShot\?\.displayText\?\.contract === ["']A1FilmShotDisplayText\/v1["']/u.test(video), "renderer must read film display text from runtime shots");
  assert(/function displayTextDataset/u.test(video) && /data-film-display-contract/u.test(video) && /data-film-display-title-repeats-opener/u.test(video), "renderer must expose film display text DOM markers");
  assert(/data-kinetic-emphasis-plan-contract/u.test(video) && /data-kinetic-emphasis-primary-tokens/u.test(video), "renderer must expose kinetic emphasis plan markers");
  assert(/function kineticEmphasisForToken/u.test(video) && /data-kinetic-token-weight/u.test(video) && /data-kinetic-token-emphasis/u.test(video), "kinetic renderer must map display emphasis plan to word actors");
  assert(/function kineticPhraseTokens/u.test(video) && /data-kinetic-phrase-chunking/u.test(video) && /data-kinetic-lane-count/u.test(video), "kinetic renderer must consume phrase-level emphasis plans instead of raw character splitting");
  assert(/A1KineticPhraseLaneLayout\/v1/u.test(video) && /data-kinetic-phrase-lane/u.test(video) && /data-kinetic-token-lane/u.test(video), "kinetic renderer must expose phrase lane layout markers");
  assert(/function shotSkillPackPlan\(scene:\s*A1Scene,\s*runtimeShot\?:\s*ArticleFilmRuntimeShot/u.test(video) && /runtimeShot\?\.skillPackPlan\?\.contract === ["']A1ShotSkillPackPlan\/v1["']/u.test(video), "renderer must read skill-pack plans from runtime shots");
  assert(/function skillPackDataset/u.test(video) && /data-skill-pack-plan-contract/u.test(video) && /data-skill-pack-techniques/u.test(video), "renderer must expose skill-pack plan DOM markers");
  assert(/function skillPackHasTechnique/u.test(video) && /motionTechniques/u.test(video), "renderer must route visible layers from skill-pack motion techniques");
  assert(/function shotPhraseActorMap\(scene:\s*A1Scene,\s*runtimeShot\?:\s*ArticleFilmRuntimeShot/u.test(video) && /runtimeShot\?\.phraseActorMap\?\.contract === ["']A1ShotPhraseActorMap\/v1["']/u.test(video), "renderer must read phrase actor maps from runtime shots");
  assert(/function phraseActorState/u.test(video) && /data-phrase-actor-map-contract/u.test(video) && /data-phrase-active-actor/u.test(video), "renderer must compute and expose phrase actor timing state");
  assert(/phraseState\.actorProgress/u.test(video) && /function phraseWindowProgress/u.test(video) && /timingWindows/u.test(video), "renderer must drive module variables from phrase actor timing windows");
  assert(/data-article-film-runtime-contract/u.test(video) && /data-article-film-runtime-current-phase/u.test(video), "renderer must expose article film runtime DOM markers");
  assert(/function articleFilmMotionCueProgress/u.test(video) && /function articleFilmCueProgressMap/u.test(video), "renderer must compute motion cue progress from Remotion frame state");
  assert(/A1RemotionMotionCueInterpreter\/v1/u.test(video) && /data-article-film-runtime-active-motion-cues/u.test(video), "renderer must expose Remotion motion cue interpreter markers");
  assert(/data-remotion-cue-layer=["']scan-sweep["']/u.test(video) && /strokeDashoffset=\{620 \* \(1 - annotation\)\}/u.test(video), "renderer must draw cue-driven scan/annotation overlay layers");
  assert(/function articleFilmPhaseProgress\(shot:\s*ArticleFilmRuntimeShot/u.test(video) && /item\.id === phaseId/u.test(video), "renderer must compute named runtime phase progress for transition overlays");
  assert(/function RemotionShotTransitionOverlay/u.test(video) && /data-shot-transition-contract=["']A1ShotTransitionOverlay\/v1["']/u.test(video), "renderer must implement a shot-to-shot transition overlay layer");
  assert(/data-shot-transition-effect=\{effect\}/u.test(video) && /data-shot-transition-bridge=\{bridge\}/u.test(video) && /data-shot-transition-progress=\{eased\.toFixed\(4\)\}/u.test(video), "transition overlay must expose effect, bridge, and frame progress markers");
  assert(/nextRuntimeShot/u.test(video) && /nextRecord/u.test(video) && /articleFilmShotForRecord\(runtime,\s*records\[index \+ 1\]\)/u.test(video), "SceneRenderer must receive next-shot context for continuity handoff");
  assert(/articleFilmPhaseProgress\(runtimeShot,\s*["']transition["']/u.test(video) && /data-shot-transition-layer=["']bridge-path["']/u.test(video), "transition overlay must be driven by the runtime transition phase and draw a bridge path");
  assert(/function transitionChoreographyForModules/u.test(video) && /vector-to-evidence-mask/u.test(video) && /evidence-scan-to-data-path/u.test(video) && /claim-highlight-to-resolve-thread/u.test(video), "renderer must classify module-aware transition choreography");
  assert(/data-shot-transition-choreography=\{choreography\}/u.test(video) && /data-shot-transition-layer=["']module-choreography["']/u.test(video), "transition overlay must expose and draw module-aware choreography layers");
  assert(/data-shot-transition-layer=["']module-mask-band["']/u.test(video) && /data-shot-transition-layer=["']module-scan-grid["']/u.test(video) && /data-shot-transition-layer=["']module-continuity-path["']/u.test(video), "transition choreography must include mask, scan grid, and continuity path layers");
  assert(/runtimeShot\?\.transitionBrief\?\.contract === ["']A1TransitionBrief\/v1["']/u.test(video), "renderer must prefer runtime transition briefs over local transition guesses");
  assert(/data-transition-brief-source-actor=\{sourceActor\}/u.test(video) && /data-transition-brief-target-actor=\{targetActor\}/u.test(video), "transition overlay must expose actor handoff from transition brief");
  assert(/data-transition-handoff-contract=\{actorHandoff\?\.contract \|\| ["']["']\}/u.test(video) && /data-transition-handoff-valid=\{handoffValid \? ["']true["'] : ["']false["']\}/u.test(video), "transition overlay must expose A1ActorHandoffTransition/v1 markers");
  assert(/data-shot-transition-layer=["']actor-handoff["']/u.test(video) && /data-shot-transition-layer=["']actor-handoff-path["']/u.test(video) && /data-shot-transition-layer=["']actor-handoff-source["']/u.test(video) && /data-shot-transition-layer=["']actor-handoff-target["']/u.test(video), "transition overlay must draw actor-handoff path and source/target markers");
  assert(/data-transition-brief-mask-strategy=\{maskStrategy\}/u.test(video) && /data-transition-brief-path-strategy=\{pathStrategy\}/u.test(video) && /data-transition-brief-camera-strategy=\{cameraStrategy\}/u.test(video), "transition overlay must expose mask/path/camera strategies from transition brief");
  assert(/function transitionGeometryProfile/u.test(video) && /baseline-to-diagram-geometry/u.test(video) && /evidence-to-data-geometry/u.test(video), "renderer must convert transition brief strategies into geometry profiles");
  assert(/function transitionAnchorToViewBox/u.test(video) && /sourceAnchorValue/u.test(video) && /targetAnchorValue/u.test(video), "renderer must convert transition actor anchors into viewBox geometry");
  assert(/sourceAnchorMapContract/u.test(video) && /data-transition-source-anchor-map-contract/u.test(video) && /data-article-film-runtime-shot-anchor-map-contract/u.test(video), "renderer must expose shot actor anchor map contracts in transition and runtime DOM");
  assert(/data-transition-geometry-profile=\{geometry\.profile\}/u.test(video) && /const cameraTransform =/u.test(video), "transition overlay must expose geometry profile and apply camera transform from the brief");
  assert(/data-transition-source-anchor=\{sourceAnchorValue\}/u.test(video) && /data-transition-target-anchor=\{targetAnchorValue\}/u.test(video), "transition overlay must expose source and target anchor values");
  assert(/d=\{geometry\.path\}/u.test(video) && /d=\{geometry\.altPath\}/u.test(video) && /x=\{\/text-mask\|evidence-scan\/u\.test\(choreography\) \? geometry\.mask\.x/u.test(video), "transition overlay must draw profile-driven path and mask geometry");
  assert(/geometry\.scan\.x/u.test(video) && /geometry\.scan\.height/u.test(video), "transition overlay must draw profile-driven scan grid geometry");
  assert(/function RemotionShotHandoffMotif/u.test(video) && /data-handoff-motif-contract=["']A1ShotHandoffMotif\/v1["']/u.test(video), "renderer must export the visible A1ShotHandoffMotif/v1 layer");
  assert(/data-remotion-handoff-motif=["']frame-driven-svg["']/u.test(video) && /data-handoff-from-module=\{fromModule\}/u.test(video) && /data-handoff-to-module=\{toModule\}/u.test(video), "handoff motif must expose frame-driven module bridge markers");
  assert(/data-handoff-source-actor=\{sourceActor\}/u.test(video) && /data-handoff-target-actor=\{targetActor\}/u.test(video) && /data-handoff-source-anchor=\{sourceAnchorValue\}/u.test(video) && /data-handoff-target-anchor=\{targetAnchorValue\}/u.test(video), "handoff motif must expose source/target actor anchors");
  assert(/data-handoff-source-anchor-map-contract=\{transitionBrief\.sourceAnchor\?\.anchorMapContract/u.test(video) && /data-handoff-target-anchor-map-contract=\{transitionBrief\.targetAnchor\?\.anchorMapContract/u.test(video), "handoff motif must bind to source and target actor anchor maps");
  assert(/data-handoff-shared-path=\{geometry\.profile\}/u.test(video) && /data-handoff-mask-strategy=\{transitionBrief\.maskStrategy/u.test(video) && /data-handoff-path-strategy=\{transitionBrief\.pathStrategy/u.test(video) && /data-handoff-camera-strategy=\{transitionBrief\.cameraStrategy/u.test(video), "handoff motif must preserve transition brief geometry strategies");
  assert(/data-handoff-motif-layer=["']shared-path["']/u.test(video) && /data-handoff-motif-layer=["']shadow-path["']/u.test(video) && /data-handoff-motif-layer=["']scan-grid["']/u.test(video) && /data-handoff-motif-layer=["']mask-window["']/u.test(video) && /data-handoff-motif-layer=["']source-node["']/u.test(video) && /data-handoff-motif-layer=["']target-node["']/u.test(video), "handoff motif must materialize SVG path, mask, scan, source, and target layers in Remotion export");
  assert(/data-handoff-narrative-layer=["']metric-to-claim["']/u.test(video) && /data-handoff-narrative-layer=["']metric-compression["']/u.test(video) && /data-handoff-motif-layer=["']claim-band["']/u.test(video) && /data-handoff-motif-layer=["']claim-rule["']/u.test(video), "Remotion handoff motif must transform data metrics into a claim band");
  assert(/data-handoff-narrative-layer=["']claim-to-resolve["']/u.test(video) && /data-handoff-motif-layer=["']resolve-convergence["']/u.test(video) && /data-handoff-motif-layer=["']final-anchor-line["']/u.test(video), "Remotion handoff motif must transform claim highlight into a resolve anchor line");
  assert(/claimTransformOpacity = choreography === ["']measurement-to-claim-lock["']/u.test(video) && /resolveTransformOpacity = \/claim-highlight-to-resolve-thread\|quiet-resolve-thread\/u\.test\(choreography\)/u.test(video), "Remotion handoff narrative layers must be bridge-specific, not generic decoration");
  assert(/<RemotionShotHandoffMotif scene=\{scene\} runtimeShot=\{runtimeShot\} nextRuntimeShot=\{nextRuntimeShot\}/u.test(video), "SceneRenderer must mount the handoff motif with next-shot runtime context");
  assert(/function KineticTextScene/u.test(video) && /data-kinetic-text-contract=["']A1KineticTextShot\/v1["']/u.test(video), "renderer must implement A1KineticTextShot/v1");
  assert(/function sceneHasKineticText/u.test(video) && /split-lines\|word-stagger\|subtitle-carry/u.test(video), "kinetic text scenes must route from opening typography cues");
  assert(/data-kinetic-text-layer=["']line-mask["']/u.test(video) && /data-kinetic-text-layer=["']word-stagger["']/u.test(video) && /data-kinetic-text-layer=["']subtitle-carry["']/u.test(video) && /data-kinetic-text-layer=["']reference-thread["']/u.test(video), "kinetic text renderer must expose line mask, word stagger, subtitle, and vector thread layers");
  assert(/data-skill-pack-consumer=["']A1ShotSkillPackPlan\/v1["']/u.test(video) && /data-remotion-skill-technique-layer=["']baseline-thread["']/u.test(video) && /data-remotion-skill-technique-layer=["']split-text-mask["']/u.test(video) && /data-remotion-skill-technique-layer=["']hold-frame-caption["']/u.test(video), "kinetic renderer must visibly consume skill-pack technique layers");
  assert(/data-remotion-skill-technique-layer=\{isPrimary \? ["']keyword-punch["']/u.test(video) && /data-kinetic-token-highlight=["']true["']/u.test(video), "kinetic renderer must render weighted keyword-punch highlight layers");
  assert(/data-kinetic-token=["']true["']/u.test(video) && /function splitKineticText/u.test(video), "kinetic text renderer must split visible sentence text into deterministic text actors");
  assert(/function VectorExplainerScene/u.test(video) && /data-vector-explainer-contract=["']A1VectorExplainerShot\/v1["']/u.test(video), "renderer must implement A1VectorExplainerShot/v1");
  assert(/from ["']@remotion\/three["']/u.test(video) && /ThreeCanvas/u.test(video), "renderer must import and use @remotion/three ThreeCanvas");
  assert(/function SpatialExplainerScene/u.test(video) && /data-spatial-explainer-contract=["']A1SpatialExplainerShot\/v1["']/u.test(video), "renderer must implement A1SpatialExplainerShot/v1");
  assert(/function SpatialThreeLayer/u.test(video) && /data-spatial-three-canvas=["']A1SpatialExplainerShot\/v1["']/u.test(video), "spatial renderer must use a real ThreeCanvas layer");
  assert(/ambientLight/u.test(video) && /directionalLight/u.test(video) && /sphereGeometry/u.test(video) && /torusGeometry/u.test(video), "spatial renderer must include lighting, globe geometry, and orbit geometry");
  assert(/data-spatial-three-actor=["']atmosphere-shell["']/u.test(video) && /data-spatial-three-actor=["']cloud-band["']/u.test(video) && /data-spatial-three-actor=["']volumetric-scan-plane["']/u.test(video), "spatial renderer must add atmosphere, cloud, and volumetric scan material layers");
  assert(/data-spatial-three-actor=["']heat-column["']/u.test(video) && /cylinderGeometry/u.test(video) && /data-spatial-three-actor=["']satellite-panels["']/u.test(video), "spatial renderer must use heat columns and structured satellite panels, not just dots and lines");
  assert(/data-spatial-renderer=["']@remotion\/three["']/u.test(video) && /data-spatial-renderer-mode=["']real-three-canvas["']/u.test(video), "spatial renderer must expose real Three render markers");
  assert(/data-spatial-visual-quality=["']material-depth-system["']/u.test(video), "spatial renderer must expose material-depth-system quality marker");
  assert(/data-spatial-motion-driver=["']useCurrentFrame["']/u.test(video) && !/useFrame\(/u.test(video), "spatial renderer animation must be frame-driven by Remotion, not useFrame");
  assert(!/WEBGL THREE LAYER|camera depth \/ orbit path \/ heat field/u.test(video), "spatial renderer must not show technical renderer labels as visible copy");
  assert(/function sceneRenderStackPlan/u.test(video) && /function sceneHasSpatialRenderer/u.test(video) && /legacy-spatial-topic-inferred-for-remotion-three-routing/u.test(video), "renderer must route formal and legacy spatial scenes into Three");
  assert(/data-vector-layer=["']reference-path["']/u.test(video) && /data-vector-actor=["']earth["']/u.test(video) && /data-vector-actor=["']moon["']/u.test(video) && /data-vector-actor=["']landsat["']/u.test(video), "vector explainer must include Earth/Moon/Landsat actors and reference path");
  assert(/data-nasa-path-morph-contract=["']A1NasaPathMorph\/v1["']/u.test(video) && /data-nasa-path-morph-source=["']veltman\/flubber \+ thednp\/kute\.js \+ greensock\/gsap["']/u.test(video) && /data-nasa-path-morph-technique=["']svg-path-state-morph["']/u.test(video), "renderer must expose source-clean NASA path morph contracts");
  assert(/data-nasa-path-morph-layer=["']source-reference-path["']/u.test(video) && /data-nasa-path-morph-layer=["']target-scan-strip["']/u.test(video) && /data-nasa-path-morph-layer=["']resolve-anchor["']/u.test(video), "renderer must draw source, target, and resolve path morph layers");
  assert(/data-vector-layer=["']semantic-mask-window["']/u.test(video) && /data-vector-layer=["']semantic-scan-band["']/u.test(video) && /data-vector-layer=["']semantic-focus-ruler["']/u.test(video) && /data-vector-layer=["']path-glow["']/u.test(video), "generic vector explainer must include AE-like semantic mask, scan, focus ruler, and path glow layers");
  assert(/data-remotion-skill-technique-layer=["']relationship-map["']/u.test(video) && /data-remotion-skill-technique-layer=["']label-lock["']/u.test(video), "vector renderer must visibly consume relationship-map and label-lock skill techniques");
  assert(/vector-semantic-mask/u.test(video) && /vector-path-glow/u.test(video) && /genericLabelPosition/u.test(video), "generic vector explainer must use SVG clip masks, glow filters, and variant-specific label positioning");
  assert(/data-remotion-paths-contract=\{remotionPathsGeometryContract\}/u.test(vectorSource) && /data-remotion-paths-source=["']@remotion\/paths["']/u.test(vectorSource), "vector explainer must expose Remotion paths geometry markers");
  assert(/data-remotion-paths-layer=["']interpolatePath:vector-reference-to-scan["']/u.test(vectorSource) && /data-nasa-path-morph-layer=["']interpolated-reference-to-scan["']/u.test(vectorSource), "vector explainer must use interpolatePath for NASA vector morphs");
  assert(/data-remotion-paths-layer=["']evolvePath:monthly-turn-path["']/u.test(vectorSource) && /data-remotion-paths-layer=["']evolvePath:orbital-reference-path["']/u.test(vectorSource) && /data-remotion-paths-layer=["']evolvePath:flow-path["']/u.test(vectorSource), "vector explainer must use evolvePath for science and generic primary paths");
  assert(/data-remotion-paths-layer=["']evolvePath:cause-path["']/u.test(vectorSource) && /data-remotion-paths-layer=["']evolvePath:contrast-bridge["']/u.test(vectorSource) && /data-remotion-paths-layer=["']evolvePath:relation-path["']/u.test(vectorSource), "vector explainer must use measured path geometry across generic variants");
  assert(/data-remotion-paths-layer=["']getPointAtLength:satellite-turn-marker["']/u.test(vectorSource), "vector explainer must place a progress marker on measured science paths");
  assert(!/data-vector-layer=["']monthly-turn-path["'][\s\S]{0,320}strokeDasharray=["']720["']/u.test(vectorSource), "vector monthly-turn path must not use guessed 720 dash length");
  assert(!/data-vector-layer=["']flow-path["'][\s\S]{0,320}strokeDasharray=["']720["']/u.test(vectorSource), "generic vector flow path must not use guessed 720 dash length");
  assert(!/data-vector-layer=["']relation-path["'][\s\S]{0,320}strokeDasharray=["']720["']/u.test(vectorSource), "generic vector relation path must not use guessed 720 dash length");
  assert(/const useDataMetric = scene\.layoutPrimitive\?\.id === ["']data-metric["']/u.test(video) && /const useComparison = scene\.layoutPrimitive\?\.id === ["']comparison-table["']/u.test(video), "renderer must compute explicit data metric and comparison priority before data/vector modules");
  assert(/const useSpatialExplainer = !useDataMetric && !useComparison && !useImageEvidence && sceneHasSpatialRenderer/u.test(video) && /const useDataMap = !useSpatialExplainer && !useDataMetric/u.test(video) && /const useScienceVector = !useSpatialExplainer && !useComparison/u.test(video) && /const useKineticText = !useSpatialExplainer && !useDataMetric && !useComparison/u.test(video), "spatial/data/vector visual modules must preserve explicit data/comparison priority and skip generic overlay");
  assert(/function DataMapScene/u.test(video) && /data-data-map-contract=["']A1DataMapShot\/v1["']/u.test(video), "renderer must implement A1DataMapShot/v1");
  assert(/function dataMapSemanticLabels/u.test(video) && /A1DataMapSemanticLabels\/v1/u.test(video), "data-map renderer must derive visible labels from semantic article context");
  assert(/data-data-map-semantic-label-contract=\{semanticLabels\.contract\}/u.test(video), "data-map renderer must expose the semantic label contract");
  assert(/校准参照/u.test(video) && /满月稳定/u.test(video) && /月面路径/u.test(video) && /每月锁定同一目标/u.test(video), "NASA data-map renderer must use article-semantic Chinese labels instead of generic English template labels");
  assert(/from ["']@remotion\/paths["']/u.test(video) && /evolvePath/u.test(video) && /interpolatePath/u.test(video) && /getLength/u.test(video) && /getPointAtLength/u.test(video), "data-map renderer must import official @remotion/paths geometry utilities");
  assert(/remotionPathsGeometryContract\s*=\s*["']A1RemotionPathsGeometry\/v1["']/u.test(video) && /data-remotion-paths-contract=\{remotionPathsGeometryContract\}/u.test(video) && /data-remotion-paths-source=["']@remotion\/paths["']/u.test(video), "data-map renderer must expose A1RemotionPathsGeometry/v1 markers");
  assert(/function evolvedPathStyle/u.test(video) && /function pathPointAtProgress/u.test(video) && /function interpolatedPathAt/u.test(video), "renderer must wrap Remotion path geometry with deterministic fallbacks");
  assert(/data-remotion-paths-layer=["']interpolatePath["']/u.test(video) && /data-nasa-path-morph-layer=["']interpolated-reference-to-scan["']/u.test(video), "data-map renderer must use interpolatePath for the NASA path morph layer");
  assert(/data-remotion-paths-layer=["']evolvePath:draw-moon-path["']/u.test(video) && /data-remotion-paths-layer=["']evolvePath:target-scan-strip["']/u.test(video) && /data-remotion-paths-layer=["']evolvePath:timeline-lock["']/u.test(video), "data-map renderer must use evolvePath for moon, scan, and timeline drawing");
  assert(/data-remotion-paths-layer=["']getPointAtLength:reference-marker["']/u.test(video) && /data-remotion-paths-layer=["']getPointAtLength:scan-sweep["']/u.test(video) && /data-remotion-paths-layer=["']getPointAtLength:timeline-tick["']/u.test(video), "data-map renderer must use getPointAtLength for markers, scan sweep, and timeline ticks");
  assert(!/data-nasa-path-morph-layer=["']source-reference-path["'][\s\S]{0,260}strokeDasharray=["']760["']/u.test(dataMapSource), "data-map source reference path must not use guessed 760 dash length");
  assert(!/data-nasa-path-morph-layer=["']target-scan-strip["'][\s\S]{0,260}strokeDasharray=["']640["']/u.test(dataMapSource), "data-map scan strip must not use guessed 640 dash length");
  assert(!/data-data-map-layer=["']draw-moon-path["'][\s\S]{0,360}strokeDasharray=["']760["']/u.test(dataMapSource), "data-map moon path must not use guessed 760 dash length");
  assert(/function sceneHasDataMap/u.test(video) && /else if \(useDataMap\) sceneNode = <DataMapScene/u.test(video), "data-map scenes must route to the dedicated DataMapScene");
  assert(video.indexOf("else if (useDataMap) sceneNode = <DataMapScene") > 0 && video.indexOf("else if (useKineticText) sceneNode = <KineticTextScene") > video.indexOf("else if (useDataMap) sceneNode = <DataMapScene"), "data-map route must be evaluated before kinetic text route");
  assert(/data-data-map-layer=["']draw-moon-path["']/u.test(video) && /data-data-map-layer=["']scan-sweep["']/u.test(video) && /data-data-map-layer=["']drift-correction["']/u.test(video) && /data-data-map-layer=["']timeline-lock["']/u.test(video), "data-map renderer must include moon path, scan, drift correction, and timeline layers");
  assert(/data-data-map-layer=["']measurement-frame["']/u.test(video) && /data-data-map-layer=["']scan-window["']/u.test(video) && /data-data-map-layer=["']actor-labels["']/u.test(video), "data-map renderer must include framed measurement space, scan window, and actor labels");
  assert(/data-data-map-layer=["']path-label["']/u.test(video) && /data-data-map-layer=["']drift-readout["']/u.test(video) && /const cameraDrift = Math\.max/u.test(video), "data-map renderer must include path/drift readouts and camera drift motion");
  assert(/data-data-map-layer=["']proof-slab["']/u.test(video) && /data-data-map-layer=["']compression-rail["']/u.test(video) && /data-data-map-layer=["']claim-relay["']/u.test(video), "data-map renderer must make measurement compression and claim relay first-class visual layers");
  assert(/data-remotion-skill-technique-layer=["']comparison-lock["']/u.test(video) && /data-remotion-skill-technique-layer=["']timeline-tick-stagger["']/u.test(video), "data-map renderer must visibly consume comparison-lock and timeline-tick-stagger skill techniques");
  assert(/data-data-map-actor=["']instrument["']/u.test(video) && /data-data-map-actor=["']moon["']/u.test(video) && /data-data-map-actor=["']calibration-scan["']/u.test(video), "data-map renderer must include instrument, moon, and scan actors");
  assert(/typography\s*=\s*\{[\s\S]*PingFang SC[\s\S]*Hiragino Sans GB[\s\S]*sans-serif/u.test(video), "renderer must define a CJK sans-first typography stack");
  assert(/fontFamily:\s*typography\.sans/u.test(video), "renderer root must apply the shared typography stack");
  assert(!/Songti|STSong|Noto Serif|Georgia|Times New Roman|(?<!sans-)serif/u.test(video), "renderer must not use serif CJK fonts for default storyboard stills");
  assert(/dangerouslySetInnerHTML/u.test(video) && /entityAssets/u.test(video), "role renderer must use verified entity SVG assets from props");
  assert(/function svgMarkupForAsset/u.test(video) && /cropViewBox/u.test(video), "role renderer must honor visualContract.cropViewBox for official icon crops");
  assert(/data-motion-bridge/u.test(video) && /motionSystem/u.test(schema), "renderer must expose relation-driven motion bridge from props");
  assert(/function relationBridge\(scene:\s*A1Scene,\s*frameNode\?:\s*HtmlVideoFrameNode\)/u.test(video), "renderer relationBridge must accept IR frame node");
  assert(/frameNode\?\.motionBridgeIn\s*\|\|\s*scene\.motionSystem\?\.motionBridge/u.test(video), "renderer current shot bridge must prefer incoming IR bridge");
  assert(/data-motion-bridge-in/u.test(video) && /data-transition-effect-in/u.test(video) && /data-transition-effect-out/u.test(video), "renderer must expose incoming/outgoing IR bridge/effect markers");
  assert(/layoutPrimitiveContract\s*=\s*["']A1LayoutPrimitive\/v1["']/u.test(video), "renderer must declare A1LayoutPrimitive/v1");
  assert(/data-layout-primitive-contract/u.test(video) && /data-layout-primitive-id/u.test(video), "renderer scenes must expose layout primitive markers");
  assert(/layoutPrimitive\(scene,\s*["']role-grid["']\)/u.test(video) && /layoutPrimitive\(scene,\s*["']method-flow["']\)/u.test(video), "renderer must select shared role/method layout primitives");
  assert(/primitive\.remotionGridTemplateColumns/u.test(video), "role/method renderer grids must come from layout primitive props");
  assert(/primitive\.rowColumns\?\.remotion/u.test(video), "role renderer must keep fixed icon/name/task columns through layout primitive props");
  assert(/width:\s*64,\s*\n\s*height:\s*44/u.test(video), "role renderer must use a shared 64x44 optical icon surface");
  assert(/assetType === ["']wordmark["']/u.test(video) && /width:\s*54/u.test(video), "role renderer must size wordmarks separately inside the fixed surface");
  assert(/data-role-name=["']true["']/u.test(video) && /data-role-task=["']true["']/u.test(video), "role renderer must expose role-name and role-task markers");
  assert(!/<strong[^>]*style=\{\{ color:\s*colors\.accent/u.test(video), "role names must use near-white text, not lime accent for every row");
  assert(/data-layout-role=["']method-flow["']/u.test(video), "method renderer must expose method-flow layout marker");
  assert(/data-method-spine=["']true["']/u.test(video) && /data-method-row=["']true["']/u.test(video), "method renderer must expose spine and row geometry markers");
  assert(/primitive\.dotSizePx/u.test(video) && /primitive\.dotHaloPx/u.test(video), "method renderer must use primitive dot markers on a fine timeline spine");
  assert(/Img,\s*interpolate[\s\S]*staticFile/u.test(video), "image renderer must use Remotion Img/staticFile for real assets");
  assert(/firstRealAsset/u.test(video) && /remotionAssetSrc/u.test(video), "image renderer must resolve real assets from scene props");
  assert(/data-real-asset=\{realAsset\s*\?/u.test(video) && /data-real-asset-frame=["']true["']/u.test(video) && /data-motion-actor=["']asset["']/u.test(video), "image renderer must expose real-asset and asset actor markers");
  assert(/data-real-asset-image=["']true["']/u.test(video), "image renderer must render a marked real asset image");
  assert(/data-image-evidence-contract=["']A1ImageEvidenceShot\/v2["']/u.test(video), "image renderer must expose A1ImageEvidenceShot/v2");
  assert(/data-image-evidence-layer-contract=["']A1EvidenceLayerStack\/v1["']/u.test(video), "image renderer must expose A1EvidenceLayerStack/v1");
  assert(/data-image-evidence-frame=["']true["']/u.test(video) && /data-image-evidence-vector-layers=["']true["']/u.test(video), "image renderer must own evidence frame/vector layers");
  assert(/data-image-evidence-layer=["']scan["']/u.test(video) && /data-image-evidence-layer=["']annotation-path["']/u.test(video) && /data-image-evidence-layer=["']focus-box["']/u.test(video), "image evidence renderer must include scan, annotation, and focus layers");
  assert(/data-image-evidence-layer=["']mask-reveal["']/u.test(video) && /data-image-evidence-layer=["']grain["']/u.test(video) && /data-image-evidence-layer=["']focal-reticle["']/u.test(video), "image evidence renderer must include v2 mask, grain, and focal reticle layers");
  assert(/data-image-evidence-layer=["']edge-ruler["']/u.test(video) && /data-image-evidence-layer=["']evidence-callout["']/u.test(video) && /data-image-evidence-callout=["']documentary-line["']/u.test(video), "image evidence renderer must include edge ruler and documentary evidence callout layers");
  assert(!/data-image-evidence-layer=["']scan-readout["']/u.test(video) && !/FOCAL \{String\(focalX\)/u.test(video), "image evidence renderer must not export internal focal/readout HUD chrome");
  assert(/data-image-evidence-source=["']true["']/u.test(video) && /function assetSourceLabel/u.test(video), "image evidence renderer must preserve a visible source label");
  assert(/clipPath:\s*`inset\(/u.test(video) && /articleFilmCueProgressMap\(runtimeShot/u.test(video), "image evidence renderer must drive mask and layers from motion cues");
  assert(/data-image-evidence-composition=["']documentary-proof-frame["']/u.test(video) && /data-image-evidence-source-treatment=["']quiet-provenance["']/u.test(video), "image evidence renderer must export documentary proof-frame composition and quiet provenance source treatment");
  assert(/const maskOpacity = Math\.max/u.test(video) && /const reticleOpacity = Math\.max/u.test(video) && /const sourceOpacity = Math\.max/u.test(video) && /const calloutOpacity = Math\.max/u.test(video), "image evidence renderer must compute frame-driven mask, reticle, source, and callout opacity");
  assert(/function focalRenderPlanForAsset/u.test(video) && /A1ImageFocalPlan\/v1/u.test(video), "image renderer must consume A1ImageFocalPlan/v1 for export");
  assert(/function motionTemplateRenderPlanForScene/u.test(video) && /data-motion-template-selected-id=\{motionTemplateRenderPlan\.selectedTemplateId\}/u.test(video), "image renderer must consume selected motion template params for export");
  assert(/data-motion-template-render-contract=\{motionTemplateRenderPlan\.contract\}/u.test(video) && /data-motion-template-source-strategy=\{motionTemplateRenderPlan\.sourceStrategy\}/u.test(video), "image renderer must expose motion template binding markers in Remotion DOM");
  assert(/motionTemplateRenderPlan\.zoomBias/u.test(video) && /motionTemplateRenderPlan\.pushBias/u.test(video), "image renderer must convert selected RVE template into deterministic zoom/push parameters");
  assert(/data-focal-contract=\{focalRenderPlan\.contract\}/u.test(video) && /data-focal-x=\{String\(Math\.round\(focalRenderPlan\.focalX\)\)\}/u.test(video), "image renderer must expose focal-plan markers in Remotion still DOM");
  assert(/data-crop-window-x=\{String\(focalRenderPlan\.cropWindow\.x\)\}/u.test(video) && /data-crop-window-width=\{String\(focalRenderPlan\.cropWindow\.width\)\}/u.test(video), "image renderer must expose focal crop window markers in Remotion still DOM");
  assert(/objectFit:\s*focalRenderPlan\.fit/u.test(video) && /const imageTranslateX = focalRenderPlan\.translateX/u.test(video) && /translate\(\$\{imageTranslateX\.toFixed\(3\)\}%/u.test(video), "image renderer must convert focal point into deterministic transform, not rely on centered crops");
  assert(/function EditorialImageScene/u.test(video) && /data-editorial-image-contract=["']A1EditorialImageShot\/v1["']/u.test(video), "renderer must implement a dedicated EditorialImageShot instead of routing abstract visuals to vectors");
  assert(/data-editorial-image-surface-contract=["']A1EditorialImageSurface\/v1["']/u.test(video) && /data-editorial-image-asset-slot=["']generated-or-sourced-bitmap-main-visual["']/u.test(video), "editorial image renderer must expose generated/sourced bitmap surface slot");
  assert(/data-editorial-image-non-evidence=["']true["']/u.test(video) && /data-editorial-image-svg-role=["']mask-and-annotation-only["']/u.test(video), "editorial image renderer must mark non-evidence and keep SVG as mask/annotation");
  assert(/function firstEditorialAsset/u.test(video) && /data-editorial-image-layer=["']generated-main-visual["']/u.test(video) && /data-editorial-image-non-evidence-asset=["']true["']/u.test(video), "editorial image renderer must render the generated/sourced main visual asset as non-evidence");
  assert(/data-editorial-image-layer=["']concept-bitmap-slot["']/u.test(video) && /data-editorial-image-layer=["']metaphor-subject["']/u.test(video) && /data-editorial-image-layer=["']svg-mask-annotation["']/u.test(video), "editorial image renderer must include concept plate, metaphor subject, and mask annotation layers");
  assert(/const useEditorialImage/u.test(video) && /<EditorialImageScene scene=\{scene\}/u.test(video), "SceneRenderer must route editorial-image treatments to the dedicated renderer");
  assert(/function QuoteScene/u.test(video) && /data-layout-role=["']quote-air["']/u.test(video), "renderer must implement quote-air primitive scene");
  assert(/function ClosingScene/u.test(video) && /data-layout-role=["']closing-hold["']/u.test(video), "renderer must implement closing-hold primitive scene");
  assert(/data-quote-claim-contract=["']A1QuoteClaimShot\/v1["']/u.test(video) && /data-quote-claim-cue-interpreter=["']A1RemotionMotionCueInterpreter\/v1["']/u.test(video), "quote renderer must expose A1QuoteClaimShot/v1");
  assert(/data-quote-claim-layer=["']claim-lock["']/u.test(video) && /data-quote-claim-layer=["']highlight-sweep["']/u.test(video) && /data-quote-claim-layer=["']subtitle-carry["']/u.test(video) && /data-quote-claim-layer=["']claim-vector-path["']/u.test(video), "quote claim renderer must include claim lock, highlight, subtitle, and vector path layers");
  assert(/data-quote-claim-layer=["']claim-lock-slab["']/u.test(video) && /data-quote-claim-layer=["']received-data-rail["']/u.test(video) && /data-quote-claim-layer=["']verdict-bracket["']/u.test(video), "quote claim renderer must include cinematic data rail, claim slab, and verdict bracket layers");
  assert(/data-remotion-paths-contract=\{remotionPathsGeometryContract\}/u.test(quoteSource) && /data-remotion-paths-source=["']@remotion\/paths["']/u.test(quoteSource), "quote claim renderer must expose Remotion paths geometry markers");
  assert(/data-remotion-paths-layer=["']evolvePath:claim-vector-path["']/u.test(quoteSource) && /data-remotion-paths-layer=["']getPointAtLength:claim-vector-marker["']/u.test(quoteSource), "quote claim renderer must use measured path draw and progress marker");
  assert(!/data-quote-claim-layer=["']claim-vector-path["'][\s\S]{0,260}strokeDasharray=["']760["']/u.test(quoteSource), "quote claim vector path must not use guessed 760 dash length");
  assert(/data-resolve-shot-contract=["']A1ResolveShot\/v1["']/u.test(video) && /data-resolve-shot-cue-interpreter=["']A1RemotionMotionCueInterpreter\/v1["']/u.test(video), "closing renderer must expose A1ResolveShot/v1");
  assert(/data-resolve-shot-layer=["']resolve-hold["']/u.test(video) && /data-resolve-shot-layer=["']resolve-thread["']/u.test(video) && /data-resolve-shot-layer=["']supporting-memory["']/u.test(video) && /data-resolve-shot-layer=["']fade-out["']/u.test(video), "resolve renderer must include hold, thread, memory, and fade layers");
  assert(/const useQuoteClaim/u.test(video) && /const useResolve/u.test(video) && /useQuoteClaim \|\| useResolve \? null/u.test(video), "quote/resolve scenes must route to dedicated cue-driven modules and skip generic overlay");
  assert(/function DataMetricScene/u.test(video) && /data-layout-role=["']data-metric["']/u.test(video), "renderer must implement data-metric primitive scene");
  assert(/function ComparisonScene/u.test(video) && /data-layout-role=["']comparison-table["']/u.test(video), "renderer must implement comparison-table primitive scene");
  assert(!/borderLeft:\s*`6px solid/u.test(video), "method renderer must not use old thick left-border rows");
  assert(!/background:\s*["']rgba\(255,255,255,0\.045\)["']/u.test(video), "method renderer must not use old card-like row backgrounds");
  assert(!/Math\.random|Date\.now|gsap\.|from\s+["']gsap["']|animation(Name|:)|@keyframes/u.test(`${schema}\n${video}\n${rootFile}`), "renderer must not use random, GSAP calls/imports, or CSS animations");
  assert(!/storyRoleLabel|分配角色|\|\|\s*["']观点["']|\|\|\s*["']方法["']/u.test(video), "renderer must not hard-code director/stage role labels as visible text");
  assert(!/\[\s*["']Codex["']\s*,\s*["']后台编排["']\s*\]/u.test(video), "role renderer must not hard-code sample role rows");
  assert(/Math\.min\(1\.14,\s*focalRenderPlan\.renderZoom \+ motionTemplateRenderPlan\.zoomBias/u.test(video), "template-driven image zoom must stay bounded and deterministic");

  const propsPath = path.join(artifactDir, "sample-props.json");
  const propsRun = run("node", ["scripts/create-remotion-sample-props.mjs", propsPath]);
  assert(propsRun.ok, `sample props generation failed: ${propsRun.output}`);
  const props = fsSync.existsSync(propsPath) ? JSON.parse(await fs.readFile(propsPath, "utf8")) : {};
  assert(props.beatGraph?.contract === "A1BeatGraph/v1", "sample props missing beatGraph");
  assert(props.timelineSpec?.contract === "A1TimelineSpec/v1", "sample props missing timelineSpec");
  assert(props.articleFilmTimelineRuntime?.contract === "A1ArticleFilmTimelineRuntime/v1", "sample props missing ArticleFilmTimelineRuntime");
  assert(props.articleFilmTimelineRuntime?.gsapContract === "paused-gsap-timeline-registerable", "sample runtime missing paused GSAP timeline contract");
  assert(props.articleFilmTimelineRuntime?.remotionContract === "frame-progress-interpreter", "sample runtime missing Remotion frame interpreter contract");
  assert(props.articleFilmTimelineRuntime?.shots?.length === props.scenes?.length, "sample runtime shots must align with scenes");
  assert(props.articleFilmTimelineRuntime?.transitionBriefContract === "A1TransitionBrief/v1" && props.articleFilmTimelineRuntime?.transitionBriefCount === props.scenes?.length - 1, `sample runtime must connect adjacent shots with transition briefs: ${JSON.stringify(props.articleFilmTimelineRuntime?.transitionBriefs)}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.actorAnchorMap?.contract === "A1ShotActorAnchorMap/v1" && Number(shot.actorAnchorMap?.anchorCount || 0) >= 4), `sample runtime shots must carry actor anchor maps: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots)}`);
  assert(props.articleFilmTimelineRuntime?.shots?.slice(0, -1).every((shot) => shot.transitionBrief?.contract === "A1TransitionBrief/v1" && shot.transitionBrief?.sourceActor && shot.transitionBrief?.targetActor && shot.transitionBrief?.sourceAnchor?.contract === "A1TransitionActorAnchor/v1" && shot.transitionBrief?.targetAnchor?.contract === "A1TransitionActorAnchor/v1" && shot.transitionBrief?.sourceAnchor?.anchorMapContract === "A1ShotActorAnchorMap/v1" && shot.transitionBrief?.targetAnchor?.anchorMapContract === "A1ShotActorAnchorMap/v1" && shot.transitionBrief?.actorHandoff?.contract === "A1ActorHandoffTransition/v1" && shot.transitionBrief?.actorHandoff?.valid === true && shot.transitionBrief?.actorHandoff?.distance > 0 && shot.transitionBrief?.actorHandoff?.path && shot.transitionBrief?.cueChain?.contract === "A1TransitionCueChain/v1" && shot.transitionBrief?.cueChain?.sourceCueId && shot.transitionBrief?.cueChain?.targetCueId && Array.isArray(shot.transitionBrief?.sourceCueIds) && shot.transitionBrief.sourceCueIds.length >= 1 && Array.isArray(shot.transitionBrief?.targetCueIds) && shot.transitionBrief.targetCueIds.length >= 1 && shot.transitionBrief?.maskStrategy && shot.transitionBrief?.pathStrategy && shot.transitionBrief?.cameraStrategy), `sample runtime shots must carry actor handoff transition briefs with actor-map anchors and cue chains: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.transitionBrief))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.displayText?.contract === "A1FilmShotDisplayText/v1" && shot.displayText?.headline), `sample runtime shots must carry display text: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots)}`);
  assert(props.scenes?.every((scene) => scene.shotPhraseActorMap?.contract === "A1ShotPhraseActorMap/v1" && scene.shotPhraseActorMap?.timingContract === "A1PhraseActorTimingWindow/v1" && scene.shotPhraseActorMap?.timingWindows?.length === scene.shotPhraseActorMap?.tokens?.length), `sample scenes must carry phrase actor timing maps: ${JSON.stringify(props.scenes?.map((scene) => scene.shotPhraseActorMap))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.phraseActorMap?.contract === "A1ShotPhraseActorMap/v1" && shot.phraseActorMap?.timingContract === "A1PhraseActorTimingWindow/v1" && shot.phraseActorMap?.timingWindows?.length >= 1), `sample runtime shots must carry phrase actor maps: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.phraseActorMap))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.phraseActorMap?.timingWindows?.every((window) => window.startFrame >= shot.startFrame && window.endFrame <= shot.endFrame && window.endFrame > window.startFrame && window.actor)), `runtime phrase actor timing windows must be frame-bounded inside each shot: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => ({ id: shot.id, startFrame: shot.startFrame, endFrame: shot.endFrame, windows: shot.phraseActorMap?.timingWindows })) )}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.displayText?.emphasisPlan?.contract === "A1KineticTextEmphasisPlan/v1" && Array.isArray(shot.displayText.emphasisPlan.tokens) && shot.displayText.emphasisPlan.tokens.length >= 1), `sample runtime shots must carry kinetic emphasis plans: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.displayText?.emphasisPlan))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.some((shot) => shot.displayText?.emphasisPlan?.tokens?.some((token) => Number(token.weight || 0) >= 2.35 && token.emphasisLevel !== "support")), `at least one runtime shot should have non-uniform weighted keyword emphasis: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.displayText?.emphasisPlan))}`);
  assert(props.scenes?.every((scene) => scene.filmDisplayText?.contract === "A1FilmShotDisplayText/v1" && scene.filmDisplayText?.headline), `sample scenes must carry film display text: ${JSON.stringify(props.scenes)}`);
  assert(props.articleFilmTimelineRuntime?.shots?.slice(1).every((shot) => !shot.displayText?.titleRepeatsOpener && !/[a-z][A-Z]|[A-Za-z][\u3400-\u9fff]|[\u3400-\u9fff][A-Za-z]/u.test(shot.displayText?.headline || "")), `runtime display titles must not repeat opener or glue words: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.displayText))}`);
  assert(props.articleFilmTimelineRuntime?.totalFrames === props.durationInFrames, `sample runtime totalFrames should match render duration: ${JSON.stringify(props.articleFilmTimelineRuntime)}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.startFrame >= 0 && shot.endFrame > shot.startFrame && shot.phases?.length >= 5), "sample runtime shots must expose frame ranges and phases");
  assert(props.articleFilmTimelineRuntime?.motionCueCount >= props.scenes?.length * 2, `sample runtime must expose per-shot motion cues: ${JSON.stringify(props.articleFilmTimelineRuntime)}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => Array.isArray(shot.motionCues) && shot.motionCues.length >= 2 && shot.motionCues.every((cue) => cue.id && cue.startFrame >= shot.startFrame && cue.endFrame <= shot.endFrame && cue.endFrame > cue.startFrame)), "sample runtime cues must be frame-bounded inside each shot");
  assert(props.scenes?.every((scene) => scene.skillPackPlan?.contract === "A1ShotSkillPackPlan/v1" && scene.skillPackPlan?.referenceSource === "iart-ai/motion-skills" && Array.isArray(scene.skillPackPlan?.motionTechniques) && scene.skillPackPlan.motionTechniques.length >= 2), `sample scenes must carry safe skill-pack plans into Remotion props: ${JSON.stringify(props.scenes?.map((scene) => scene.skillPackPlan))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.every((shot) => shot.skillPackPlan?.contract === "A1ShotSkillPackPlan/v1" && shot.skillPackPlan?.referenceSource === "iart-ai/motion-skills" && Array.isArray(shot.skillPackPlan?.motionTechniques) && shot.skillPackPlan.motionTechniques.length >= 2), `sample runtime shots must carry safe skill-pack plans into Remotion runtime: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.skillPackPlan))}`);
  assert(props.articleFilmTimelineRuntime?.shots?.some((shot) => shot.motionCues?.some((cue) => cue.id.includes("asset-mask-in") || cue.id.includes("annotation-draw"))), "sample runtime must include image/evidence cue grammar");
  assert(props.articleFilmTimelineRuntime?.shots?.some((shot) => shot.motionCues?.some((cue) => cue.id.includes("timeline-lock") || cue.id.includes("sentence-enter"))), "sample runtime must include method/timeline cue grammar");
  assert(props.articleFilmTimelineRuntime?.labels?.length >= props.scenes?.length * 5, "sample runtime must expose phase seek labels");
  assert(props.globalMotionMotif?.contract === "A1GlobalMotionMotif/v1", "sample props missing globalMotionMotif");
  assert(props.globalMotionMotif?.sceneCount === props.scenes?.length, `globalMotionMotif scene count mismatch: ${JSON.stringify(props.globalMotionMotif)}`);
  assert(props.globalMotionMotif?.transitionFamily?.length === Math.max(0, props.scenes?.length - 1), `globalMotionMotif must connect every adjacent scene: ${JSON.stringify(props.globalMotionMotif?.transitionFamily)}`);
  assert(props.globalMotionMotif?.sceneMotifMarks?.every((mark, index) => mark.sceneId === props.scenes[index]?.id), `globalMotionMotif marks must align with scenes: ${JSON.stringify(props.globalMotionMotif?.sceneMotifMarks)}`);
  assert(props.globalMotionMotif?.motifId === "tool-role-thread", `mixed sample should keep tool-role-thread motif: ${JSON.stringify(props.globalMotionMotif)}`);
  assert(props.globalMotionMotif?.rejectIf?.includes("isolatedSentenceCard") && props.globalMotionMotif?.rejectIf?.includes("randomTransition"), "globalMotionMotif must reject isolated/random animation");
  assert(props.contentGraph?.contract === "A1HtmlVideoContentGraph/v1", "sample props must carry A1HtmlVideoContentGraph/v1 for Remotion adapter");
  assert(props.htmlVideoIr?.contract === "A1HtmlVideoIR/v1", "sample props must carry top-level A1HtmlVideoIR/v1");
  assert(JSON.stringify(props.contentGraph?.htmlVideoIr || {}) === JSON.stringify(props.htmlVideoIr || {}), "sample props htmlVideoIr must match contentGraph.htmlVideoIr");
  assert(props.htmlVideoIr?.sourceMaterial?.sourceOfTruth === "project.json", "Remotion IR source of truth must stay project.json");
  assert(props.htmlVideoIr?.engineAdapters?.currentExecutable === "hyperframes", "IR should still mark HyperFrames as current html-video executable adapter");
  assert(props.htmlVideoIr?.reviewSurface === "frontend-stage", "IR review surface must stay frontend-stage");
  assert(props.htmlVideoIr?.frameNodes?.length === props.scenes?.length, `IR frame node count must match Remotion scenes: ${JSON.stringify(props.htmlVideoIr)}`);
  assert(props.htmlVideoIr?.frameNodes?.every((frame, index) => frame.index === index && frame.id === props.scenes[index]?.id), `IR frame nodes must be stable and scene-aligned: ${JSON.stringify(props.htmlVideoIr?.frameNodes)}`);
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => frame.templateCandidateId && frame.inputSlots?.includes("title") && frame.inputSlots?.includes("sourceTrace")), "IR frame nodes must carry template candidate and input slots");
  const imageFrameNode = props.htmlVideoIr?.frameNodes?.find((frame) => frame.templateLayoutRole === "image-focus");
  assert(imageFrameNode?.inputSlots?.includes("asset") && imageFrameNode?.assetSlot?.contract === "A1HtmlVideoAssetSlot/v1", `IR image frame must carry adopted asset slot: ${JSON.stringify(imageFrameNode)}`);
  assert(imageFrameNode?.imageFocalSlot?.contract === "A1HtmlVideoImageFocalSlot/v1", `IR image frame must carry focal slot: ${JSON.stringify(imageFrameNode)}`);
  assert(imageFrameNode?.motionTemplateSlot?.contract === "A1HtmlVideoMotionTemplateSlot/v1", `IR image frame must carry selected motion template slot: ${JSON.stringify(imageFrameNode)}`);
  assert(props.skillRouter?.contract === "A1StoryboardSkillRouter/v1", "sample props missing top-level skill router");
  assert(props.scenes?.every((scene) => scene.skillRoute?.contract === "A1StoryboardSceneSkillRoute/v1" && scene.skillRoute?.skillId), "sample scenes must carry skillRoute");
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => frame.skillRoute?.contract === "A1StoryboardSceneSkillRoute/v1" && frame.skillRoute?.skillId), "IR frame nodes must carry skillRoute");
  assert(props.htmlVideoIr?.frameNodes?.every((frame, index) => frame.skillRoute?.skillId === props.scenes[index]?.skillRoute?.skillId), "IR frame skill routes must align with scenes");
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => frame.skillRoute?.sourceProject === "remotion-dev/template-prompt-to-motion-graphics-saas"), "IR skill routes must preserve Remotion skill-detection source");
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => Array.isArray(frame.skillRoute?.manifestCandidates) && frame.skillRoute.manifestCandidates.length), "IR skill routes need manifest candidates");
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => frame.relationIn && frame.motionBridgeIn && frame.transitionEffectIn), "IR frame nodes must carry incoming relation bridge/effect for Remotion");
  assert(props.htmlVideoIr?.frameNodes?.every((frame) => frame.relationOut && frame.motionBridgeOut && frame.transitionEffectOut), "IR frame nodes must carry outgoing relation bridge/effect for Remotion");
  const roleFrame = props.htmlVideoIr?.frameNodes?.find((frame) => frame.relationIn === "roles");
  assert(roleFrame?.motionBridgeIn === "role-reveal" && roleFrame?.transitionEffectIn === "role-reveal", `role IR frame must preserve incoming role-reveal: ${JSON.stringify(roleFrame)}`);
  const methodFrame = props.htmlVideoIr?.frameNodes?.find((frame) => frame.relationIn === "method");
  assert(methodFrame?.motionBridgeIn === "step-forward" && methodFrame?.transitionEffectIn === "step-forward", `method IR frame must preserve incoming step-forward: ${JSON.stringify(methodFrame)}`);
  const evidenceFrame = props.htmlVideoIr?.frameNodes?.find((frame) => frame.relationIn === "evidence");
  assert(evidenceFrame?.motionBridgeIn === "proof-lock" && evidenceFrame?.transitionEffectIn === "proof-lock", `evidence IR frame must preserve incoming proof-lock: ${JSON.stringify(evidenceFrame)}`);
  const openingRuntimeShot = props.articleFilmTimelineRuntime?.shots?.find((shot) => shot.index === 0 || shot.id === props.scenes?.[0]?.id);
  assert(openingRuntimeShot?.motionCues?.some((cue) => cue.id.includes("split-lines")) && openingRuntimeShot?.motionCues?.some((cue) => cue.id.includes("word-stagger")) && openingRuntimeShot?.motionCues?.some((cue) => cue.id.includes("subtitle-carry")), `opening runtime shot must carry dedicated KineticText cues: ${JSON.stringify(openingRuntimeShot)}`);
  const openingEmphasis = openingRuntimeShot?.displayText?.emphasisPlan;
  const openingTokens = openingEmphasis?.tokens || [];
  assert(openingEmphasis?.chunking === "cjk-semantic-phrase" && Number(openingEmphasis?.laneCount || 0) >= 3, `opening kinetic emphasis must use CJK phrase lanes: ${JSON.stringify(openingEmphasis)}`);
  assert(openingTokens.some((token) => /[\u3400-\u9fff]{2,}/u.test(token.token || "")), `opening kinetic emphasis must keep multi-character Chinese phrases, not split every character: ${JSON.stringify(openingTokens)}`);
  assert(new Set(openingTokens.map((token) => token.lane).filter(Boolean)).size >= 3, `opening kinetic emphasis must distribute phrases across lanes: ${JSON.stringify(openingTokens)}`);
  assert(props.htmlVideoIr?.frameNodes?.slice(1).every((frame) => frame.previousId), "IR frames after first need previousId");
  assert(props.htmlVideoIr?.frameNodes?.slice(0, -1).every((frame) => frame.nextId), "IR frames before last need nextId");
  for (const name of ["Codex", "Kimi", "DeepSeek"]) {
    const asset = (props.entityAssets || []).find((item) => item.canonicalName === name);
    assert(asset?.iconSvg && asset?.fallback === false, `sample props missing verified ${name} SVG asset`);
  }
  assert((props.scenes || []).some((scene) => scene.type === "image"), "sample props must include image scene");
  const imageScene = (props.scenes || []).find((scene) => scene.type === "image");
  const imageRuntimeShot = props.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === imageScene?.id);
  assert(imageRuntimeShot?.motionCues?.some((cue) => cue.id.includes("asset-mask-in")) && imageRuntimeShot?.motionCues?.some((cue) => cue.id.includes("ken-burns-focal")) && imageRuntimeShot?.motionCues?.some((cue) => cue.id.includes("annotation-draw")), `image runtime shot must carry dedicated ImageEvidenceShot cues: ${JSON.stringify(imageRuntimeShot)}`);
  assert(imageScene?.assets?.[0]?.url === "a1-sample-real-media.svg", `sample image scene must point to renderer public real-media asset: ${JSON.stringify(imageScene?.assets)}`);
  assert(imageScene?.assets?.[0]?.imageFocalPlan?.contract === "A1ImageFocalPlan/v1", `sample image scene must carry focal plan: ${JSON.stringify(imageScene?.assets?.[0])}`);
  assert(imageScene?.assets?.[0]?.imageFocalPlan?.objectPosition?.x === 68 && imageScene?.assets?.[0]?.imageFocalPlan?.objectPosition?.y === 36, `sample image focal point must stay non-centered for export audit: ${JSON.stringify(imageScene?.assets?.[0]?.imageFocalPlan)}`);
  assert(imageScene?.assets?.[0]?.imageFocalPlan?.cropMode === "focal-cover", `sample image focal cover plan must survive render props: ${JSON.stringify(imageScene?.assets?.[0]?.imageFocalPlan)}`);
  assert(Number(imageScene?.assets?.[0]?.imageFocalPlan?.cropWindow?.width || 0) > 0, `sample image focal crop window must survive render props: ${JSON.stringify(imageScene?.assets?.[0]?.imageFocalPlan)}`);
  assert((imageScene?.beat?.actorPlan || []).some((actor) => actor.role === "asset" || actor.id === "asset-1"), `image scene must include an asset actor plan: ${JSON.stringify(imageScene?.beat?.actorPlan)}`);
  const roleScene = (props.scenes || []).find((scene) => scene.beat?.storyRole === "roles");
  assert(roleScene, "sample props must include role scene");
  assert(roleScene?.motionSystem?.contentRelation === "roles" && roleScene?.motionSystem?.motionBridge === "role-reveal", `role scene must carry relation-driven role-reveal bridge: ${JSON.stringify(roleScene?.motionSystem)}`);
  assert(Array.isArray(roleScene?.roleRows) && roleScene.roleRows.length >= 3, "role scene must expose structured roleRows for renderer");
  assert((roleScene?.beat?.actorPlan || []).filter((actor) => actor.role === "role-name").length >= 3, "role scene actorPlan must include role-name actors from roleRows");
  assert(roleScene?.layoutPrimitive?.contract === LAYOUT_PRIMITIVE_CONTRACT && roleScene?.layoutPrimitive?.id === "role-grid", `role scene must carry role-grid layout primitive: ${JSON.stringify(roleScene?.layoutPrimitive)}`);
  assert(roleScene?.layoutPrimitive?.rowColumns?.remotion === LAYOUT_PRIMITIVES["role-grid"].rowColumns.remotion, "role scene layout primitive must carry Remotion row columns");
  const methodScene = (props.scenes || []).find((scene) => scene.beat?.storyRole === "method" || scene.beat?.storyRole === "workflow");
  assert(methodScene, "sample props must include method/workflow scene");
  assert(methodScene?.motionSystem?.contentRelation === "method" && methodScene?.motionSystem?.motionBridge === "step-forward", `method scene must carry relation-driven step-forward bridge: ${JSON.stringify(methodScene?.motionSystem)}`);
  assert(Array.isArray(methodScene?.listItems) && methodScene.listItems.length >= 3, `method scene must expose listItems for method-flow renderer: ${JSON.stringify(methodScene)}`);
  assert(methodScene?.layoutPrimitive?.contract === LAYOUT_PRIMITIVE_CONTRACT && methodScene?.layoutPrimitive?.id === "method-flow", `method scene must carry method-flow layout primitive: ${JSON.stringify(methodScene?.layoutPrimitive)}`);
  assert(methodScene?.layoutPrimitive?.remotionGridTemplateColumns === LAYOUT_PRIMITIVES["method-flow"].remotionGridTemplateColumns, "method scene layout primitive must carry Remotion grid columns");
  for (const [primitiveId, label] of [
    ["quote-air", "quote"],
    ["data-metric", "data metric"],
    ["comparison-table", "comparison"],
    ["closing-hold", "closing"],
  ]) {
    assert((props.scenes || []).some((scene) => scene.layoutPrimitive?.id === primitiveId), `sample props must include ${label} primitive`);
  }
  const metricScene = (props.scenes || []).find((scene) => scene.layoutPrimitive?.id === "data-metric");
  assert(metricScene?.dataValue === "9 项", `data-metric scene must preserve real dataValue instead of rendering an empty metric: ${JSON.stringify(metricScene)}`);
  const comparisonScene = (props.scenes || []).find((scene) => scene.layoutPrimitive?.id === "comparison-table");
  assert(comparisonScene?.templateId === "compare-split", `comparison scene must keep compare-split template instead of list fallback: ${JSON.stringify(comparisonScene)}`);
  assert(comparisonScene?.titleLines?.join("").includes("调模板") && comparisonScene?.titleLines?.join("").includes("契约"), `comparison title must preserve both sides: ${JSON.stringify(comparisonScene?.titleLines)}`);
  assert(comparisonScene?.listItems?.includes("临时调参") && comparisonScene?.listItems?.includes("全局契约"), `comparison scene must preserve user-provided sides: ${JSON.stringify(comparisonScene)}`);
  assert(!JSON.stringify(comparisonScene || {}).includes("之前") && !JSON.stringify(comparisonScene || {}).includes("之后"), "comparison scene must not rely on before/after placeholder labels");

  const genericRoleProps = toStoryboardRenderProps({
    title: "通用角色分工验证",
    projectKind: "document",
    sourceText: "GitHub 负责素材来源，OpenAI 负责生成判断，Claude 负责复核结构。",
    scenes: [
      {
        id: "generic-roles",
        type: "word-sequence",
        headline: "工具角色分工",
        body: "GitHub 负责素材来源，OpenAI 负责生成判断，Claude 负责复核结构。",
        director: { intent: "roles" },
        duration: 4,
      },
    ],
  });
  const genericRoleScene = genericRoleProps.scenes.find((scene) => scene.beat?.storyRole === "roles");
  assert(genericRoleScene?.roleRows?.map((row) => row.name).join("/") === "GitHub/OpenAI/Claude", "roleRows must work for non-sample entities");

  const scienceVectorProps = toStoryboardRenderProps({
    title: "科学矢量解释验证",
    projectKind: "document",
    fps: 30,
    sourceText: "地球持续变化，月球反射更稳定，Landsat 用它做校准参照。",
    scenes: [
      {
        id: "science-vector",
        type: "point",
        headline: "为什么看月球",
        body: "地球持续变化，月球反射更稳定，Landsat 用它做校准参照。",
        narrative: { storyRole: "diagnosis" },
        duration: 4,
      },
    ],
  });
  const scienceVectorShot = scienceVectorProps.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === "science-vector");
  assert(scienceVectorShot?.motionCues?.some((cue) => cue.id.includes("stage-earth-moon")) && scienceVectorShot?.motionCues?.some((cue) => cue.id.includes("draw-reference-path")) && scienceVectorShot?.motionCues?.some((cue) => cue.id.includes("camera-drift")), `science vector scene must carry dedicated vector cues: ${JSON.stringify(scienceVectorShot)}`);

  const spatialRenderStackProps = toStoryboardRenderProps({
    title: "空间渲染栈验证",
    projectKind: "document",
    fps: 30,
    sourceText: "解释卫星轨道、城市热力地图和地理变化时，需要空间深度、轨道路径和相机运动。",
    scenes: [
      {
        id: "spatial-render-stack",
        type: "point",
        headline: "空间轨迹",
        body: "解释卫星轨道、城市热力地图和地理变化时，需要空间深度、轨道路径和相机运动。",
        narrative: { storyRole: "diagnosis" },
        duration: 4,
      },
    ],
  });
  const spatialRenderStackScene = spatialRenderStackProps.scenes?.find((scene) => scene.id === "spatial-render-stack");
  assert(spatialRenderStackScene?.visualAssetStrategy?.assetBrief?.renderStackPlan?.primaryRenderer === "webgl-three", `spatial render stack scene must preserve webgl-three renderer: ${JSON.stringify(spatialRenderStackScene?.visualAssetStrategy?.assetBrief?.renderStackPlan)}`);

  const dataMapProps = toStoryboardRenderProps({
    title: "数据地图镜头验证",
    projectKind: "document",
    fps: 30,
    sourceText: "转向月面，连续扫描，检查传感器漂移，再校正长期数据。",
    scenes: [
      {
        id: "data-map-calibration",
        type: "sequence",
        headline: "校准流程",
        body: "转向月面，连续扫描，检查传感器漂移，再校正长期数据。",
        listItems: ["转向月面", "连续扫描", "检查传感器漂移", "校正长期数据"],
        narrative: { storyRole: "method" },
        duration: 5,
      },
    ],
  });
  const dataMapShot = dataMapProps.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === "data-map-calibration");
  assert(dataMapShot?.motionCues?.some((cue) => cue.id.includes("instrument-enter")) && dataMapShot?.motionCues?.some((cue) => cue.id.includes("scan-sweep")) && dataMapShot?.motionCues?.some((cue) => cue.id.includes("drift-correction")) && dataMapShot?.motionCues?.some((cue) => cue.id.includes("timeline-lock")), `data-map scene must carry dedicated calibration cues: ${JSON.stringify(dataMapShot)}`);

  const quoteResolveProps = toStoryboardRenderProps({
    title: "观点与收束镜头验证",
    projectKind: "document",
    fps: 30,
    sourceText: "可靠的科学影像需要稳定参照。最后，可靠来自持续校准。",
    scenes: [
      {
        id: "quote-claim",
        type: "quote",
        headline: "可靠的科学影像需要稳定参照",
        body: "清晰画面背后，是能被反复校准的参照系统。",
        narrative: { storyRole: "quote" },
        duration: 4,
      },
      {
        id: "resolve-close",
        type: "closing",
        headline: "可靠来自校准",
        body: "从拍摄到多年对比，参照一直在场。",
        narrative: { storyRole: "closing" },
        duration: 4,
      },
    ],
  });
  const quoteShot = quoteResolveProps.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === "quote-claim");
  const resolveShot = quoteResolveProps.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === "resolve-close");
  assert(quoteShot?.motionCues?.some((cue) => cue.id.includes("claim-lock")) && quoteShot?.motionCues?.some((cue) => cue.id.includes("highlight-sweep")) && quoteShot?.motionCues?.some((cue) => cue.id.includes("subtitle-carry")), `quote scene must carry dedicated QuoteClaimShot cues: ${JSON.stringify(quoteShot)}`);
  assert(resolveShot?.motionCues?.some((cue) => cue.id.includes("resolve-hold")) && resolveShot?.motionCues?.some((cue) => cue.id.includes("fade-out")), `resolve scene must carry dedicated ResolveShot cues: ${JSON.stringify(resolveShot)}`);

  let install = { ok: true, output: "" };
  if (!fsSync.existsSync(path.join(rendererDir, "node_modules", "remotion"))) {
    install = run("npm", ["install"], { cwd: rendererDir, timeout: 240000 });
    assert(install.ok, `remotion renderer npm install failed: ${install.output.slice(0, 1600)}`);
  }

  const stillFrames = [
    ["opening", "12"],
    ["roles", String(props.scenes.find((scene) => scene.beat?.storyRole === "roles")?.frameStart + 72 || 120)],
    ["method", String(props.scenes.find((scene) => scene.beat?.storyRole === "method" || scene.beat?.storyRole === "workflow")?.frameStart + 72 || 90)],
    ["image", String(props.scenes.find((scene) => scene.type === "image")?.frameStart + 72 || 150)],
    ["quote", String(props.scenes.find((scene) => scene.layoutPrimitive?.id === "quote-air")?.frameStart + 72 || 180)],
    ["metric", String(props.scenes.find((scene) => scene.layoutPrimitive?.id === "data-metric")?.frameStart + 72 || 210)],
    ["comparison", String(props.scenes.find((scene) => scene.layoutPrimitive?.id === "comparison-table")?.frameStart + 72 || 240)],
    ["closing", String(props.scenes.find((scene) => scene.layoutPrimitive?.id === "closing-hold")?.frameStart + 72 || 270)],
  ];
  const stills = [];
  for (const [name, frame] of stillFrames) {
    const out = path.join(artifactDir, `${name}.png`);
    const result = run("npx", [
      "remotion",
      "still",
      "src/index.ts",
      "A1Video",
      "--props",
      propsPath,
      "--output",
      out,
      "--frame",
      frame,
    ], { cwd: rendererDir, timeout: 240000 });
    assert(result.ok, `remotion still ${name} failed: ${result.output.slice(0, 1600)}`);
    assert(fsSync.existsSync(out), `remotion still ${name} output missing: ${out}`);
    stills.push(out);
  }

  const scienceVectorPropsPath = path.join(artifactDir, "science-vector-props.json");
  const scienceVectorStillPath = path.join(artifactDir, "science-vector.png");
  await fs.writeFile(scienceVectorPropsPath, JSON.stringify(scienceVectorProps, null, 2));
  const scienceVectorStill = run("npx", [
    "remotion",
    "still",
    "src/index.ts",
    "A1Video",
    "--props",
    scienceVectorPropsPath,
    "--output",
    scienceVectorStillPath,
    "--frame",
    "72",
  ], { cwd: rendererDir, timeout: 240000 });
  assert(scienceVectorStill.ok, `remotion still science-vector failed: ${scienceVectorStill.output.slice(0, 1600)}`);
  assert(fsSync.existsSync(scienceVectorStillPath), `remotion still science-vector output missing: ${scienceVectorStillPath}`);
  stills.push(scienceVectorStillPath);

  const dataMapPropsPath = path.join(artifactDir, "data-map-props.json");
  const dataMapStillPath = path.join(artifactDir, "data-map.png");
  await fs.writeFile(dataMapPropsPath, JSON.stringify(dataMapProps, null, 2));
  const dataMapStill = run("npx", [
    "remotion",
    "still",
    "src/index.ts",
    "A1Video",
    "--props",
    dataMapPropsPath,
    "--output",
    dataMapStillPath,
    "--frame",
    "86",
  ], { cwd: rendererDir, timeout: 240000 });
  assert(dataMapStill.ok, `remotion still data-map failed: ${dataMapStill.output.slice(0, 1600)}`);
  assert(fsSync.existsSync(dataMapStillPath), `remotion still data-map output missing: ${dataMapStillPath}`);
  stills.push(dataMapStillPath);

  const quoteResolvePropsPath = path.join(artifactDir, "quote-resolve-props.json");
  await fs.writeFile(quoteResolvePropsPath, JSON.stringify(quoteResolveProps, null, 2));
  for (const [name, frame] of [["quote-claim", "66"], ["resolve-close", String((quoteResolveProps.scenes.find((scene) => scene.id === "resolve-close")?.frameStart || 0) + 72)]]) {
    const out = path.join(artifactDir, `${name}.png`);
    const result = run("npx", [
      "remotion",
      "still",
      "src/index.ts",
      "A1Video",
      "--props",
      quoteResolvePropsPath,
      "--output",
      out,
      "--frame",
      frame,
    ], { cwd: rendererDir, timeout: 240000 });
    assert(result.ok, `remotion still ${name} failed: ${result.output.slice(0, 1600)}`);
    assert(fsSync.existsSync(out), `remotion still ${name} output missing: ${out}`);
    stills.push(out);
  }

  await fs.writeFile(reportPath, JSON.stringify({
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    propsPath,
    stills,
    install: { ok: install.ok, output: install.output.slice(0, 2000) },
    failures,
  }, null, 2));

  if (failures.length) {
    console.error(`Remotion renderer audit failed.\nReport: ${reportPath}\n${failures.join("\n")}`);
    process.exit(1);
  }

  console.log(`Remotion renderer audit passed.
Props: ${propsPath}
Stills:
${stills.join("\n")}
Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
