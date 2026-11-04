import crypto from "node:crypto";
import {bindNarrationToDomText} from "../../apps/studio-next/src/lib/a1-screen-narration-text-binder-v1.mjs";

const hashText = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export async function captureTextRangeEvidence(page, {text, rootSelector = "#editor", observedAtMs = 0, rangeToken = null}) {
  const snapshot = await page.evaluate(({needle, selector}) => {
    const root = document.querySelector(selector);
    if (!root || !needle) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent?.indexOf(needle) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const normalize = (rect) => ({x: rect.x / innerWidth, y: rect.y / innerHeight, width: rect.width / innerWidth, height: rect.height / innerHeight});
      const lineRects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map(normalize);
      const unionRect = normalize(range.getBoundingClientRect());
      const selection = getSelection();
      const selectedText = selection?.toString() || "";
      const parent = node.parentElement;
      const style = parent ? getComputedStyle(parent) : null;
      const background = style?.backgroundColor || "";
      const sourceHighlight = Boolean(parent?.closest("mark,[data-highlight],[aria-selected='true'],.selected,.highlight"));
      const visibleArea = lineRects.reduce((sum, rect) => {
        const left = Math.max(0, rect.x), top = Math.max(0, rect.y), right = Math.min(1, rect.x + rect.width), bottom = Math.min(1, rect.y + rect.height);
        return sum + Math.max(0, right - left) * Math.max(0, bottom - top);
      }, 0);
      const totalArea = lineRects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
      return {
        matchedText: range.toString(),
        nodeText: node.textContent || "",
        startOffset: index,
        endOffset: index + needle.length,
        lineRects,
        unionRect,
        viewport: {width: innerWidth, height: innerHeight, scrollX, scrollY},
        viewportVisibilityRatio: totalArea > 0 ? visibleArea / totalArea : 0,
        nativeSelection: {text: selectedText, containsExactText: selectedText === needle, rangeCount: selection?.rangeCount || 0},
        sourceHighlight: {detected: sourceHighlight, backgroundColor: background || null},
      };
    }
    return null;
  }, {needle: text, selector: rootSelector});
  if (!snapshot) throw new Error(`text-range-evidence-missing:${rootSelector}:${text.slice(0, 40)}`);
  const sourceTextSha256 = hashText(text);
  const matchedTextSha256 = hashText(snapshot.matchedText);
  return {
    contract: "A1TextRangeEvidence/v1",
    status: snapshot.matchedText === text && snapshot.lineRects.length ? "PASS" : "FAIL",
    exactMatch: snapshot.matchedText === text,
    sourceTextSha256,
    matchedTextSha256,
    rangeToken: rangeToken || hashText(`${text}:${snapshot.startOffset}:${snapshot.endOffset}`).slice(0, 24),
    observedAtMs,
    ...snapshot,
  };
}

export async function captureNarrationBoundTextRangeEvidence(page,{narrationText,rootSelector="#editor",observedAtMs=0,rangeToken=null}){
  const candidates=await page.evaluate((selector)=>{const root=document.querySelector(selector);if(!root)return[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const result=[];let index=0;while(walker.nextNode()){const text=(walker.currentNode.textContent||"").replace(/\s+/gu," ").trim();if(!text)continue;result.push({text,token:`${selector}:text-${index}`});index+=1;}return result;},rootSelector),binding=bindNarrationToDomText({narrationText,domTextCandidates:candidates});
  if(binding.status!=="PASS")throw new Error(`narration-text-binding:${binding.failures.join(",")}`);
  const evidence=await captureTextRangeEvidence(page,{text:binding.binding.matchedText,rootSelector,observedAtMs,rangeToken});return{...evidence,narrationBinding:binding};
}
