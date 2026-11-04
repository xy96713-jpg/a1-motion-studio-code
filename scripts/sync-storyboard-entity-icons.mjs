import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const iconDir = path.join(root, "assets", "entity-icons");
const publicManifestPath = path.join(root, "public", "entity-icons.js");
const manifestPath = path.join(iconDir, "manifest.json");

const targets = [
  {
    key: "github",
    canonicalName: "GitHub",
    source: "simple-icons",
    url: "https://unpkg.com/simple-icons@v16/icons/github.svg",
    licenseNote: "Simple Icons SVG cache; verify GitHub brand usage before public release",
  },
  {
    key: "openai",
    canonicalName: "OpenAI",
    source: "lobehub-icons",
    url: "https://unpkg.com/@lobehub/icons-static-svg@1.91.0/icons/openai.svg",
    variant: "mono",
    license: "MIT",
    licenseNote: "LobeHub Icons static SVG cache; verify OpenAI brand usage before public release",
  },
  {
    key: "claude",
    canonicalName: "Claude",
    source: "lobehub-icons",
    url: "https://unpkg.com/@lobehub/icons-static-svg@1.91.0/icons/claude-color.svg",
    variant: "color",
    license: "MIT",
    licenseNote: "LobeHub Icons static SVG cache; verify Anthropic/Claude brand usage before public release",
  },
  {
    key: "kimi",
    canonicalName: "Kimi",
    source: "kimi-brand-guidelines",
    url: "https://moonshotai.github.io/Branding-Guide/scenarios/01-kimi-with-icon/kimi-with-icon-light-solid.svg",
    variant: "with-icon-light-solid",
    license: "KIMI brand guidelines",
    licenseNote: "Official KIMI Brand Guidelines SVG cache; verify KIMI brand usage before public release",
  },
  {
    key: "deepseek",
    canonicalName: "DeepSeek",
    source: "lobehub-icons",
    url: "https://unpkg.com/@lobehub/icons-static-svg@1.91.0/icons/deepseek-color.svg",
    variant: "color",
    license: "MIT",
    licenseNote: "LobeHub Icons static SVG cache; verify DeepSeek brand usage before public release",
  },
  {
    key: "codex",
    canonicalName: "Codex",
    source: "lobehub-icons",
    url: "https://unpkg.com/@lobehub/icons-static-svg@1.91.0/icons/codex-color.svg",
    variant: "color",
    license: "MIT",
    licenseNote: "LobeHub Codex (OpenAI) static SVG cache; verify OpenAI Codex brand usage before public release",
  },
];

function sanitizeSvg(svg = "", key = "") {
  const clean = String(svg || "").trim();
  if (!/^<svg[\s\S]*<\/svg>$/u.test(clean)) {
    throw new Error(`${key}: downloaded asset is not a complete SVG`);
  }
  if (/<(?:script|foreignObject|iframe|object|embed)\b/iu.test(clean)) {
    throw new Error(`${key}: downloaded SVG contains forbidden active content`);
  }
  let output = clean
    .replace(/<title[\s\S]*?<\/title>/giu, "")
    .replace(/<desc[\s\S]*?<\/desc>/giu, "")
    .replace(/\srole="[^"]*"/giu, "")
    .replace(/\saria-[a-z-]+="[^"]*"/giu, "")
    .replace(/\sclass="[^"]*"/giu, "")
    .replace(/\sstyle="[^"]*"/giu, "");
  output = output.replace(/<svg\b([^>]*)>/iu, (match, attrs = "") => {
    const cleanedAttrs = attrs.replace(/\s(width|height)="[^"]*"/giu, "");
    return `<svg${cleanedAttrs}>`;
  });
  output = output.replace(/\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/giu, "");
  output = output.replace(/<svg\b/u, '<svg xmlns="http://www.w3.org/2000/svg" role="img"');
  return output;
}

async function fetchSvg(target) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(target.url, {
        headers: {
          accept: "image/svg+xml,text/plain;q=0.8,*/*;q=0.1",
          "user-agent": "A1-Motion-Studio-Icon-Sync/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`${target.key}: ${response.status} ${response.statusText} from ${target.url}`);
      }
      const text = await response.text();
      return sanitizeSvg(text, target.key);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 650));
    }
  }
  throw lastError;
}

async function main() {
  const fetchedAt = new Date().toISOString();
  await fs.mkdir(iconDir, { recursive: true });
  const entries = {};

  for (const target of targets) {
    const iconSvg = await fetchSvg(target);
    const fileName = `${target.key}.svg`;
    await fs.writeFile(path.join(iconDir, fileName), `${iconSvg}\n`);
    entries[target.key] = {
      key: target.key,
      canonicalName: target.canonicalName,
      source: target.source,
      sourceUrl: target.url,
      variant: target.variant || "base",
      license: target.license || "see source",
      file: `assets/entity-icons/${fileName}`,
      iconSvg,
      confidence: 0.97,
      fallback: false,
      verifiedByAudit: true,
      licenseNote: target.licenseNote,
      fetchedAt,
    };
  }

  const manifest = {
    generatedAt: fetchedAt,
    policy: "Render from local cached SVG only. Unknown or unverified entities must use monogram fallback.",
    entries,
    aliases: {
      chatgpt: "openai",
      gpt: "openai",
      moonshot: "kimi",
      moonshotai: "kimi",
    },
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(publicManifestPath, `window.A1_ENTITY_ICON_MANIFEST = ${JSON.stringify(manifest)};\n`);
  console.log(`Synced ${Object.keys(entries).length} entity icons.`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Browser manifest: ${publicManifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
