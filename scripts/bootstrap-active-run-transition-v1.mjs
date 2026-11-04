import path from "node:path";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.join(process.cwd(), "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const result = withProjectLock(appRoot, () => persistProjectState(appRoot, workspace, {commitId: "bootstrap-active-run-transition-v1"}));
console.log(JSON.stringify({status: "PASS", ...result}));
