import {spawn} from "node:child_process";
import fs from "node:fs";

const pidFile = process.argv[2];
const mode = process.argv[3] || "idle";
if (!pidFile) throw new Error("bounded-process-group-fixture-pid-file-required");
process.on("SIGTERM", () => {});
const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {stdio: "ignore"});
fs.writeFileSync(pidFile, JSON.stringify({parentPid: process.pid, grandchildPid: grandchild.pid}));
if (mode === "stdout-flood") process.stdout.write(Buffer.alloc(16_384, 120));
setInterval(() => {}, 1_000);
