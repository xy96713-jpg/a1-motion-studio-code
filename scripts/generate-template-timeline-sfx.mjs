import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "generated", "studio-next-template-timeline", "sfx");
const rendererOutDir = path.join(root, "remotion-renderer", "public", "generated", "studio-next-template-timeline", "sfx");
const sampleRate = 48000;

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function writeWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(Math.round(clamp(samples[index]) * 32767), 44 + index * 2);
  }
  return buffer;
}

function synth({ durationSec, sample }) {
  const total = Math.max(1, Math.round(durationSec * sampleRate));
  return Array.from({ length: total }, (_, index) => sample(index / sampleRate, index, total));
}

function proofHit() {
  return synth({
    durationSec: 0.34,
    sample: (time, index, total) => {
      const decay = Math.exp(-time * 12);
      const click = Math.sin(2 * Math.PI * 1320 * time) * decay;
      const body = Math.sin(2 * Math.PI * 176 * time) * Math.exp(-time * 8);
      const tail = Math.sin(2 * Math.PI * 660 * time) * Math.max(0, 1 - index / total) ** 4;
      return (click * 0.42 + body * 0.38 + tail * 0.18) * 0.62;
    },
  });
}

function transitionWhoosh() {
  return synth({
    durationSec: 0.58,
    sample: (time, index, total) => {
      const progress = index / total;
      const sweepFreq = 240 + progress * 1680;
      const envelope = Math.sin(Math.PI * progress) ** 0.8;
      const sweep = Math.sin(2 * Math.PI * sweepFreq * time);
      const air = Math.sin(2 * Math.PI * (sweepFreq * 0.5) * time + progress * 18);
      return (sweep * 0.28 + air * 0.24) * envelope * 0.42;
    },
  });
}

function lowRumble() {
  return synth({
    durationSec: 3.4,
    sample: (time) => {
      const slow = Math.sin(2 * Math.PI * 42 * time);
      const pressure = Math.sin(2 * Math.PI * 67 * time + Math.sin(time * 1.7) * 0.7);
      const pulse = 0.62 + Math.sin(2 * Math.PI * 0.72 * time) * 0.18;
      return (slow * 0.46 + pressure * 0.26) * pulse * 0.18;
    },
  });
}

const assets = [
  ["proof-hit.wav", proofHit()],
  ["transition-whoosh.wav", transitionWhoosh()],
  ["low-rumble.wav", lowRumble()],
];

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(rendererOutDir, { recursive: true });
for (const [filename, samples] of assets) {
  const wav = writeWav(samples);
  await fs.writeFile(path.join(outDir, filename), wav);
  await fs.writeFile(path.join(rendererOutDir, filename), wav);
}

const manifest = {
  contract: "A1TemplateTimelineSfx/v1",
  mode: "sfx-only-no-music-no-voice",
  generatedAt: new Date().toISOString(),
  assets: assets.map(([filename]) => ({
    filename,
    path: path.join(outDir, filename),
    rendererPath: path.join(rendererOutDir, filename),
    publicPath: `generated/studio-next-template-timeline/sfx/${filename}`,
  })),
};

await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(path.join(rendererOutDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
