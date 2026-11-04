#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildCanonicalWebProviderPolicy, buildCanonicalWebStyleBundle, styleCharterText} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const args = process.argv.slice(2);
const argValue = (name, fallback = null) => {
  const inline = args.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const id = argValue("--id");
const url = argValue("--url");
if (!id || !url) throw new Error("canonical-web-conversation-id-and-url-required");
if (!/^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[a-z0-9-]+$/iu.test(url)) throw new Error("canonical-web-conversation-url-invalid");

const workspace = readProjectWorkspace(appRoot);
const styleBundle = buildCanonicalWebStyleBundle(workspace);
const charter = styleCharterText(styleBundle);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const config = {
  contract: "A1CanonicalWebGenerationConversation/v1",
  version: 1,
  status: "READY",
  fixed: true,
  provider: "chatgpt-web-conversation",
  providerMode: "chrome-browser-automation",
  browser: "chrome",
  id,
  url,
  styleBundleSha256: styleBundle.sha256,
  styleContract: styleBundle.contract,
  styleCharterSha256: sha256(charter),
  styleCharter: charter,
  providerPolicy: buildCanonicalWebProviderPolicy({id, url}),
  policy: {
    maxConcurrentJobs: 1,
    maxConcurrentBatches: 1,
    maxConcurrentMessagesPerConversation: 1,
    maxImagesPerMessage: 1,
    oneShotPerMessage: true,
    oneBatchPerMessage: false,
    separateImagesRequired: true,
    collageForbidden: true,
    allOrNothingImport: false,
    partialReturnAllowed: true,
    returnedImageMustBeImportedBeforeNextBatch: true,
    actualPixelAuditRequired: true,
    primaryProvider: "chatgpt-web-conversation",
    fallbackProvider: "codex-imagegen",
    fallbackRequiresExplicitFlag: true,
    recommendationBlockedUntilAuditPass: true,
  },
  createdAt: new Date().toISOString(),
};
const artifactPath = path.join(artifactDir, "canonical-web-generation-v1", "conversation.json");
const publicPath = path.join(publicDir, "canonical-web-generation-v1", "conversation.json");
fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
fs.mkdirSync(path.dirname(publicPath), {recursive: true});
fs.writeFileSync(artifactPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
fs.writeFileSync(publicPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: config.status, id, url, styleBundleSha256: config.styleBundleSha256, styleCharterSha256: config.styleCharterSha256, artifactPath, publicPath, noImageGen: true}, null, 2));
