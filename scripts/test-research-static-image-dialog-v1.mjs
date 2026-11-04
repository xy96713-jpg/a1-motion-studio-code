import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {validateWorkbenchStaticUIPhaseDataV1} from "../work/hupo-69-shot-reconstruction-v1/current-static-candidate-index-integration-v1/run-owned-workbench-static-ui-once-v1.mjs";

const require = createRequire(path.resolve("apps/studio-next/package.json")), ts = require("typescript");
const React = require("react"), {renderToStaticMarkup} = require("react-dom/server");
const filename = path.resolve("apps/studio-next/src/app/system-line-visual-workbench/ResearchStaticImageDialog.tsx");
const source = fs.readFileSync(filename, "utf8"), exports = {};
const compiled = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}});
const sheet = Object.fromEntries(["Sheet", "SheetClose", "SheetContent", "SheetDescription", "SheetTitle"].map((name) => [name, name]));
vm.runInNewContext(compiled.outputText, {exports, require: (name) => name === "@/components/ui/sheet" ? sheet : require(name)}, {filename});
const {ResearchStaticImageButton: Button, ResearchStaticImageDialog: Dialog} = exports;
const checks = [], check = (name, fn) => {fn(); checks.push(name);};
const images = Array.from({length: 13}, (_, i) => ({id: `image-${i}`, role: i < 9 ? "candidate" : "reference",
  title: `P${i + 1} sample ${i < 9 ? "实际候选" : "参考原图"}`, src: `/api/system-line/research-task-media?taskId=t&artifactId=image-${i}`}));
function children(element) {return [element, ...React.Children.toArray(element?.props?.children).flatMap(children)].filter(Boolean);}
const open = (index, onSelect = () => {}, onReturnFocus = () => {}) => Dialog({images, activeId: images[index]?.id ?? null, onSelect, onReturnFocus});
check("thirteen-real-image-buttons-render-with-native-contain-and-artifact-url", () => {
  for (const image of images) {
    const html = renderToStaticMarkup(React.createElement(Button, {image, onOpen() {}}));
    assert(html.includes(`data-a1-static-image-open="${image.id}"`) && html.includes(`aria-label="放大 ${image.title}"`));
    assert(html.includes("h-auto w-full object-contain") && html.includes(`data-a1-static-image="${image.role}"`));
  }
});
check("actual-button-handler-retains-trigger-for-return-focus", () => {
  const trigger = {}, calls = [], button = Button({image: images[0], onOpen: (...args) => calls.push(args)});
  button.props.onClick({currentTarget: trigger}); assert.equal(calls[0][0], images[0].id); assert.equal(calls[0][1], trigger);
});
check("closed-or-unregistered-selection-does-not-mount-dialog", () => {
  for (const activeId of [null, "missing"]) {const result = Dialog({images, activeId, onSelect() {}, onReturnFocus() {}}); assert.equal(result.props.open, false);}
});
check("first-and-last-image-disable-navigation-endpoints", () => {
  for (const [index, label] of [[0, "上一张原图"], [12, "下一张原图"]]) {
    const button = children(open(index)).find((el) => el.type === "button" && el.props["aria-label"] === label); assert.equal(button.props.disabled, true);
  }
});
check("actual-next-and-previous-handlers-change-selected-original", () => {
  const calls = [], tree = children(open(5, (id) => calls.push(id)));
  tree.find((el) => el.type === "button" && el.props["aria-label"] === "下一张原图").props.onClick();
  tree.find((el) => el.type === "button" && el.props["aria-label"] === "上一张原图").props.onClick();
  assert.deepEqual(calls, [images[6].id, images[4].id]);
});
check("escape-and-dialog-close-handlers-clear-selection", () => {
  const calls = [], tree = open(0, (id) => calls.push(id)); tree.props.onOpenChange(false);
  children(tree).find((el) => el.type === "SheetContent").props.onEscapeKeyDown(); assert.deepEqual(calls, [null, null]);
});
check("actual-close-autofocus-callback-returns-to-original-trigger", () => {
  let prevented = false, returned = false; const content = children(open(0, () => {}, () => {returned = true;})).find((el) => el.type === "SheetContent");
  content.props.onCloseAutoFocus({preventDefault() {prevented = true;}}); assert(prevented && returned);
});
check("expanded-candidate-reference-have-complete-title-and-fit-image", () => {
  for (const index of [0, 12]) {const tree = children(open(index));
    assert(tree.some((el) => el.type === "SheetTitle" && el.props.children === images[index].title));
    const img = tree.find((el) => el.type === "img"); assert.equal(img.props.src, images[index].src); assert.equal(img.props.className, "h-full w-full object-contain");
  }
});
const phase = JSON.parse(fs.readFileSync("work/module-development-launch-v1/resource-reservations/phase-activation-writer-current-nine-static-workbench-ui30s-once-v1.json"));
// In-memory predicate fixture only; the real completed phase remains untouched.
Object.assign(phase, {status:"ACTIVE",executionAuthorized:true,reservedSlots:1});
phase.budget.remainingBeforePhaseMs = 30000;
const ready = JSON.parse(fs.readFileSync("work/hupo-69-shot-reconstruction-v1/current-static-candidate-index-integration-v1/READY-WORKBENCH-STATIC-UI-v1.json"));
check("phase-with-sufficient-original-balance-keeps-budget-predicates", () => assert.equal(validateWorkbenchStaticUIPhaseDataV1(phase, ready), true));
check("old14240-balance-rejects30s-phase-before-worker", () => {
  const changed = structuredClone(phase); changed.budget.remainingBeforePhaseMs = 14240;
  assert.throws(() => validateWorkbenchStaticUIPhaseDataV1(changed, ready), /SIGNED_UI_REMAINING_BALANCE_INSUFFICIENT/);
});
const worker = fs.readFileSync("work/hupo-69-shot-reconstruction-v1/current-static-candidate-index-integration-v1/workbench-static-ui-worker-v1.mjs", "utf8");
const framingStart = worker.indexOf("    const priorViewport = page.viewportSize()");
const framing = worker.slice(framingStart, worker.indexOf("    proof.shots.push(checked)", framingStart));
assert(framingStart > 0 && framing.includes("SCREENSHOT_PANEL_CLIPPED_BY_ANCESTOR"));
async function frame({height = 1478, top = 0, ancestorHeight = height + 128, drift = 0, fit = "contain", aspectDelta = 0} = {}) {
  let calls = 0, captured = false; const viewportChanges = [];
  const rect = {x:0,y:top,width:1374,height};
  const layout = {before:rect,after:{...rect,x:drift},clippingAncestors:[{rect:{x:0,y:0,width:1440,height:ancestorHeight}}],
    images:[{rect:{width:650,height:650*1080/1920+aspectDelta},naturalWidth:1920,naturalHeight:1080,objectFit:fit}]};
  const ctx = {assert,path,shot:{id:"P03"},out:"/fixture",checked:{},remaining:(n)=>n,
    page:{viewportSize:()=>({width:1440,height:1000}),setViewportSize:async(v)=>viewportChanges.push(v)},
    group:{boundingBox:async()=>({...rect,y:-478}),evaluate:async()=>++calls===1?undefined:layout,screenshot:async()=>{captured=true;}}};
  await vm.runInNewContext(`(async()=>{${framing}})()`,ctx);
  return {captured,viewportChanges};
}
for (const height of [584,1047,1478]) {
  const result = await frame({height,ancestorHeight:Math.max(1000,height+128)}); assert(result.captured);
  assert.equal(result.viewportChanges[0].height, Math.max(1000,height+128)); assert.equal(result.viewportChanges.at(-1).height,1000);
  checks.push(`ordinary-worker-selected-panel-${height}px-fits-and-restores-viewport`);
}
for (const [name, options, error] of [
  ["clipping-ancestor",{ancestorHeight:1000},"SCREENSHOT_PANEL_CLIPPED_BY_ANCESTOR"],
  ["negative-panel-top",{top:-47},"SCREENSHOT_PANEL_OUTSIDE_VIEWPORT"],
  ["unstable-layout",{drift:1},"SCREENSHOT_LAYOUT_NOT_STABLE"],
  ["cover-crop",{fit:"cover"},"contain"],
  ["distorted-image",{aspectDelta:40},"SCREENSHOT_IMAGE_ASPECT_RATIO_CHANGED"],
  ["unbounded-panel",{height:2500},"SCREENSHOT_PANEL_EXCEEDS_BOUNDED_VIEWPORT"],
]) {await assert.rejects(frame(options),new RegExp(error));checks.push(`ordinary-worker-${name}-rejected-before-screenshot`);}
console.log(JSON.stringify({status:"PASS_REAL_COMPONENT_HANDLERS_SSR_AND_SIGNED_BALANCE_GUARD", checks, count:checks.length,
  browser:0, claims:0, slots:0, actualDOM:0, sheetPrimitivesMockedForElementInspection:true,
  actualRadixKeyboardFocusTrapAndScreenshotPixels:"NOT_MEASURED"},null,2));
