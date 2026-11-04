#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {compileMatureScreenCameraGrammar} from "../apps/studio-next/src/lib/a1-mature-screen-camera-grammar-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicFixtureRoot = path.join(rendererRoot, "public/proof-only/mature-screen-camera-fixtures");
const outputRoot = path.join(root, "work/mature-screen-camera-system-v1/blind-fixtures");
const visibleArtifact = path.join(root, "work/mature-screen-camera-system-v1/mature-screen-camera-three-layout-review.mp4");
const ffmpeg = "/Users/a1/.local/bin/ffmpeg";
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = requireFromRenderer("@remotion/renderer");
fs.mkdirSync(publicFixtureRoot, {recursive: true});
fs.mkdirSync(outputRoot, {recursive: true});
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd: root, stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-4000)}`)));
});
const lines = (x, y, widths, gap = 18) => widths.map((width, index) => `<rect x="${x}" y="${y + index * gap}" width="${width}" height="7" rx="3.5" fill="#718078" opacity="${index % 3 === 0 ? .72 : .42}"/>`).join("");
const shell = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#edf1ee"/><rect x="18" y="16" width="924" height="44" rx="10" fill="#f9fbf9" stroke="#cbd5cf"/><circle cx="40" cy="38" r="7" fill="#d67555"/><circle cx="62" cy="38" r="7" fill="#e0b45c"/><circle cx="84" cy="38" r="7" fill="#5e9f76"/><text x="112" y="44" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#22302a">${title}</text>${body}</svg>`;
const fixtures = [
  {
    id: "dense-editorial-workbench", genre: "dense text editing and review", durationMs: 5800,
    svg: shell("Editorial review workspace", `<rect x="30" y="78" width="650" height="438" rx="12" fill="#fff" stroke="#ccd5d0"/><text x="58" y="118" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#1c2a24">Draft analysis and revision</text>${lines(58,148,[560,590,520,575,545,600,490,570,555,610,535,580,500,590,550,605,460,585],19)}<rect x="704" y="78" width="226" height="438" rx="12" fill="#f8fbf9" stroke="#c5d2cb"/><text x="724" y="112" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#b85d43">Review findings</text>${lines(724,138,[170,158,180,150,174,165,178,144,170,160,176,154],22)}`),
    cameraTrack: [{atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},{atMs:900,x:.5,y:.5,scale:1,easingToNext:"cinematic-in",beatId:"editor-result"},{atMs:1320,x:.5,y:.55,scale:1.24,easingToNext:"hold",beatId:"editor-result"},{atMs:5800,x:.5,y:.55,scale:1.24,easingToNext:"hold",beatId:"editor-result"}],
    attentionTrack: [{beat:"editor-result",startMs:1200,endMs:2100,region:{x:.2,y:.32,width:.6,height:.42},treatment:"SOURCE_BOUND_SOFT_FOCUS"}],
  },
  {
    id: "analytics-dashboard", genre: "data dashboard with edge panels", durationMs: 7000,
    svg: shell("Analytics operations dashboard", `<rect x="28" y="78" width="590" height="210" rx="12" fill="#fff" stroke="#cbd5cf"/><path d="M60 245 L130 198 L205 220 L286 142 L362 174 L448 112 L575 156" fill="none" stroke="#2b8065" stroke-width="5"/><g fill="#2b8065">${[60,130,205,286,362,448,575].map((x,i)=>`<circle cx="${x}" cy="${[245,198,220,142,174,112,156][i]}" r="7"/>`).join("")}</g><rect x="28" y="310" width="590" height="206" rx="12" fill="#fff" stroke="#cbd5cf"/>${[0,1,2,3].map((i)=>`<rect x="${60+i*135}" y="${470-i*28}" width="82" height="${120+i*28}" rx="7" fill="${i===3?'#d67555':'#6aa88e'}" opacity="${.55+i*.1}"/>`).join("")}<rect x="644" y="78" width="288" height="438" rx="12" fill="#f9fbf9" stroke="#bfcfc6"/><text x="666" y="112" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#b85d43">Anomaly detail</text>${lines(666,140,[225,210,238,194,220,230,206,236,215,228,198,224,212,232],22)}`),
    cameraTrack: [{atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},{atMs:700,x:.5,y:.5,scale:1,easingToNext:"cinematic-in",beatId:"filter-action"},{atMs:1040,x:.28,y:.42,scale:1.16,easingToNext:"hold",beatId:"filter-action"},{atMs:3240,x:.28,y:.42,scale:1.16,easingToNext:"glide",beatId:"insight-result"},{atMs:3620,x:.86,y:.48,scale:1.28,easingToNext:"hold",beatId:"insight-result"},{atMs:7000,x:.86,y:.48,scale:1.28,easingToNext:"hold",beatId:"insight-result"}],
    attentionTrack: [{beat:"insight-result",startMs:3500,endMs:4400,region:{x:.73,y:.28,width:.25,height:.42},treatment:"SOURCE_BOUND_SOFT_FOCUS"}],
  },
  {
    id: "form-driven-admin", genre: "form and workflow administration", durationMs: 6200,
    svg: shell("Workflow administration", `<rect x="88" y="88" width="784" height="398" rx="14" fill="#fff" stroke="#c7d2cc"/><text x="122" y="128" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#1f2d27">Create processing rule</text>${[0,1,2,3].map((i)=>`<text x="122" y="${174+i*68}" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#53625b">Field ${i+1}</text><rect x="122" y="${186+i*68}" width="716" height="34" rx="7" fill="#f6f8f6" stroke="#cbd5cf"/>`).join("")}<rect x="604" y="438" width="106" height="36" rx="8" fill="#e7ece9"/><rect x="724" y="438" width="114" height="36" rx="8" fill="#2b8065"/><text x="756" y="462" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">SUBMIT</text>`),
    cameraTrack: [{atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},{atMs:1000,x:.5,y:.5,scale:1,easingToNext:"cinematic-in",beatId:"submit-result"},{atMs:1420,x:.5,y:.88,scale:1.3,easingToNext:"hold",beatId:"submit-result"},{atMs:6200,x:.5,y:.88,scale:1.3,easingToNext:"hold",beatId:"submit-result"}],
    attentionTrack: [{beat:"submit-result",startMs:1300,endMs:2200,region:{x:.28,y:.75,width:.44,height:.23},treatment:"SOURCE_BOUND_SOFT_FOCUS"}],
  },
];

for (const fixture of fixtures) await sharp(Buffer.from(fixture.svg)).png().toFile(path.join(publicFixtureRoot, `${fixture.id}.png`));
const jobs = fixtures.map((fixture) => {
  const compiled = compileMatureScreenCameraGrammar({durationMs: fixture.durationMs, cameraTrack: fixture.cameraTrack, attentionTrack: fixture.attentionTrack});
  if (compiled.status !== "PASS") throw new Error(`blind-fixture-compile:${fixture.id}:${compiled.failures.join(",")}`);
  const scene = {shotId: fixture.id, timelineStartMs: 0, timelineEndMs: fixture.durationMs, durationMs: fixture.durationMs, sourceActionId: fixture.id, sourceVideoUri: "", sourceSegments: [{kind:"still",outputStartMs:0,outputEndMs:fixture.durationMs,sourceStillUri:`proof-only/mature-screen-camera-fixtures/${fixture.id}.png`,evidenceRole:"SYNTHETIC_BLIND_LAYOUT_FIXTURE"}], screenDirection:{contract:"A1ScreenActionDirection/v1",grammar:`MATURE_SCREEN_CAMERA_GRAMMAR_V1:${compiled.decisions.map((item)=>item.grammar).join("+")}`,cameraModel:"C4_BEZIER_EVENT_FOCUS_HOLD_V1",cameraPath:"CINEMATIC_EASE_IN_OUT_RESTORE",motionBlurPolicy:"TEMPORAL_CAMERA_ONLY",temporalMotionBlur:{shutterAngle:100,samples:6},cameraTrack:compiled.cameraTrack,attentionTrack:fixture.attentionTrack,cursorPolicy:"NONE"},pointerTrack:null,cameraTrack:compiled.cameraTrack,editCoverage:{mode:"SYNTHETIC_BLIND_LAYOUT_FIXTURE",fullSourceActionShown:true}};
  const props = {contract:"A1ContinuousScreenEvidenceReel/v2",width:960,height:540,fps:60,audioUri:"generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav",scenes:[scene],showReviewLabels:true,boundaryTransitionFrames:0};
  const propsPath = path.join(outputRoot, `${fixture.id}-props.json`); const outputPath = path.join(outputRoot, `${fixture.id}-960x540.mp4`); fs.writeFileSync(propsPath, `${JSON.stringify(props,null,2)}\n`);
  return {...fixture, compiled, props, propsPath, outputPath};
});
const startedAt = Date.now(); const serveUrl = await bundle({entryPoint:path.join(rendererRoot,"src/screen-camera-diagnostic-entry.tsx"),publicDir:path.join(rendererRoot,"public"),rootDir:rendererRoot,enableCaching:true}); const browser=await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"});
try {for(const [index,job] of jobs.entries()){console.error(`rendering blind fixture ${index+1}/${jobs.length}: ${job.id}`);const composition=await selectComposition({serveUrl,id:"A1ScreenCameraDiagnosticV1",inputProps:job.props,puppeteerInstance:browser,logLevel:"warn"});await renderMedia({serveUrl,composition,inputProps:job.props,outputLocation:job.outputPath,codec:"h264",pixelFormat:"yuv420p",crf:16,imageFormat:"jpeg",jpegQuality:92,concurrency:1,muted:true,hardwareAcceleration:"disable",overwrite:true,puppeteerInstance:browser,logLevel:"warn"});}} finally {await browser.close({silent:true});}
const concatPath=path.join(outputRoot,"concat.txt");fs.writeFileSync(concatPath,jobs.map((job)=>`file '${job.outputPath.replaceAll("'","'\\''")}'`).join("\n")+"\n");await run(ffmpeg,["-y","-f","concat","-safe","0","-i",concatPath,"-c","copy",visibleArtifact]);
const report={contract:"A1MatureScreenCameraBlindFixtures/v1",status:"PASS",fixtures:jobs.map((job)=>({id:job.id,genre:job.genre,status:"PASS",sourcePath:path.join(publicFixtureRoot,`${job.id}.png`),sourceSha256:sha256File(path.join(publicFixtureRoot,`${job.id}.png`)),outputPath:job.outputPath,outputSha256:sha256File(job.outputPath),decisions:job.compiled.decisions,audits:job.compiled.audits,summary:job.compiled.summary})),visibleArtifact,visibleArtifactSha256:sha256File(visibleArtifact),elapsedMs:Date.now()-startedAt,boundary:{syntheticFixtures:true,proofOnly:true,currentAuthorityMutated:false,productionAdmission:false},generatedAt:new Date().toISOString()};fs.writeFileSync(path.join(outputRoot,"report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({status:report.status,elapsedMs:report.elapsedMs,visibleArtifact,fixtures:report.fixtures.map(({id,genre,summary})=>({id,genre,summary}))},null,2));
