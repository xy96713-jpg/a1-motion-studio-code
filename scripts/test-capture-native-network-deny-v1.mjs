import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import {chromium} from "playwright";
import {createBrowserNativeNetworkDenyV1} from "../apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs";

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const [leasePath, leaseSHA] = process.argv.slice(2);
assert.ok(leasePath && /^[a-f0-9]{64}$/u.test(leaseSHA || ""), "CENTRAL_RESERVATION_REQUIRED");
const bytes = fs.readFileSync(leasePath), lease = JSON.parse(bytes);
assert.equal(sha(bytes), leaseSHA);
assert.equal(lease.status, "ACTIVE");
assert.equal(lease.executionAuthorized, true);
assert.equal(lease.providers, false);
assert.ok(Date.now() >= Date.parse(lease.reservationStartUTC) && Date.now() < Date.parse(lease.reservationEndUTC));
const root = process.cwd(), output = path.resolve(root, lease.outputDirectory);
assert.ok(output.startsWith(path.join(root, "work/module-development-launch-v1/integration/")));
fs.mkdirSync(output, {recursive: true});
const source = "apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs";
assert.equal(sha(fs.readFileSync(source)), lease.adapterSHA);
const started = Date.now(), connections = [], results = [];
let browser, deny, port, calibrated = false, failure;
const sockets = new Set();
const detector = net.createServer(socket => {
  sockets.add(socket);
  connections.push(calibrated ? "UNEXPECTED" : "CALIBRATION");
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
  socket.destroy();
});
const timer = setTimeout(() => {void browser?.close();}, 90000);
try {
  await new Promise((resolve, reject) => {detector.once("error", reject);detector.listen(0, "127.0.0.1", resolve);});
  port = detector.address().port;
  await new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => socket.end());socket.once("close", resolve);socket.once("error", reject);
  });
  assert.equal(connections.length, 1);calibrated = true;
  deny = await createBrowserNativeNetworkDenyV1();
  browser = await chromium.launch({headless: true, timeout: 30000,
    args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", ...deny.launchArgs]});
  const context = await browser.newContext({serviceWorkers: "block"});
  // The real browser fulfills a document without native networking.
  await context.route("https://source.fixture.invalid/", route => route.fulfill({status: 200,
    contentType: "text/html", body: "<!doctype html><h1 id='proof'>BROKER FULFILL FIXTURE</h1>"}));
  const page = await context.newPage();
  await page.goto("https://source.fixture.invalid/");
  assert.equal(await page.locator("#proof").textContent(), "BROKER FULFILL FIXTURE");
  results.push({case: "route-fulfilled-document", status: "PASS"});
  // No application route guards these navigations: they deliberately reach Chromium's native transport.
  for (const protocol of ["http", "https"]) {
    const before = deny.proof().deniedConnections;
    let errorCode;
    try { await page.goto(`${protocol}://127.0.0.1:${port}/native`, {timeout: 8000}); }
    catch (error) {errorCode = /net::(ERR_[A-Z_]+)/u.exec(error.message)?.[1];}
    assert.ok(errorCode, "NATIVE_PROXY_DENIAL_NOT_OBSERVED");
    assert.ok(deny.proof().deniedConnections > before, "DENY_SOCKET_NOT_REACHED");
    assert.equal(connections.filter(x => x === "UNEXPECTED").length, 0);
    results.push({case: `${protocol}-literal-loopback-native-navigation`, status: "DENIED_AT_FIXED_SOCKET", errorCode});
  }
  const beforeClosed = deny.proof().deniedConnections;
  await deny.close();
  // With its only proxy unavailable, Chromium must fail rather than fall back to DIRECT.
  let fallbackError;
  try {await page.goto(`http://127.0.0.1:${port}/after-close`, {timeout: 8000});}
  catch (error) {fallbackError = /net::(ERR_[A-Z_]+)/u.exec(error.message)?.[1];}
  assert.equal(fallbackError, "ERR_PROXY_CONNECTION_FAILED");
  assert.equal(connections.filter(x => x === "UNEXPECTED").length, 0);
  assert.equal(deny.proof().deniedConnections, beforeClosed);
  results.push({case: "fixed-socket-closed-no-direct-fallback", status: "DENIED", errorCode: fallbackError});
} catch (error) {failure = {name: error.name, message: error.message};}
finally {
  clearTimeout(timer);
  await browser?.close();await deny?.close();
  for (const socket of sockets) socket.destroy();
  if (detector.listening) await new Promise(resolve => detector.close(resolve));
  const receipt = {contract: "A1CaptureNativeNetworkDenyFixture/v1", status: failure ? "FAIL" : "PASS_SUPPORTED_NATIVE_HTTP",
    adapterSHA: lease.adapterSHA, elapsedMs: Date.now() - started, actualBrowserLaunches: browser ? 1 : 0,
    calibratedConnections: connections.filter(x => x === "CALIBRATION").length,
    unexpectedConnections: connections.filter(x => x === "UNEXPECTED").length, results,
    nativeNetworkEnforcement: deny?.proof(), browserClosed: true, externalNetworkCalls: 0, providerCalls: 0,
    encoded: false, articleReplay: false, runtimeCoverageGranted: false, failure};
  fs.writeFileSync(path.join(output, "runtime-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));process.exitCode = failure ? 1 : 0;
}
