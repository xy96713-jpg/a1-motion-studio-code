#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const candidatesRoot=path.join(root,"work/cap-native-production-v2/candidates");
const now=new Date().toISOString();
const results=[];
for(const shotId of ["ED-04","ED-05","ED-06"]){
  const file=path.join(candidatesRoot,shotId,"receipt.json");
  if(!fs.existsSync(file)) continue;
  const previous=JSON.parse(fs.readFileSync(file,"utf8"));
  const previousReceiptSha256=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const desktopFallbackObserved=shotId==="ED-05";
  const body={...previous,status:"SUPERSEDED_BY_HEADLESS_PAGE_CAPTURE",productionAdmission:false,userVisualApproval:"NOT_APPROVED",failures:[...(previous.failures||[]),...(desktopFallbackObserved?["ACTUAL_PIXELS_CONTAINED_CODEX_DESKTOP_FALLBACK"]:[])],supersession:{contract:"A1VisibleCaptureSupersession/v1",reason:"VISIBLE_WINDOW_CAPTURE_INTERFERES_WITH_USER_WORK_AND_SCREEN_CAPTUREKIT_CAN_FALL_BACK_TO_DESKTOP",replacement:"HEADLESS_PLAYWRIGHT_PAGE_VIEWPORT_CAPTURE",desktopFallbackObserved,previousReceiptSha256,supersededAt:now}};
  delete body.receiptSha256;
  const receipt={...body,receiptSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
  fs.writeFileSync(file,`${JSON.stringify(receipt,null,2)}\n`);
  results.push({shotId,status:receipt.status,desktopFallbackObserved,receiptSha256:receipt.receiptSha256});
}
console.log(JSON.stringify({contract:"A1VisibleCaptureSupersessionBatch/v1",status:"PASS",results},null,2));
