import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "external", "rve-remotion-templates", "README.md");
const templateDir = path.join(root, "external", "rve-remotion-templates", "templates");
const outputTsxPath = path.join(root, "remotion-renderer", "src", "RveOfficialTemplates.tsx");
const outputJsonPath = path.join(root, "public", "template-confirmations", "rve-official-template-registry.json");

const readme = await fs.readFile(readmePath, "utf8");
const categoryBlocks = [...readme.matchAll(/### ([^\n]+) \((\d+)\)\n([\s\S]*?)(?=\n### |\n## |$)/gu)];

const slugToPascal = (slug) => slug
  .split("-")
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join("");

const durationForSlug = (slug) => {
  if (slug === "image-carousel" || slug === "credits-roll") return 180;
  if (slug === "ken-burns" || slug === "parallax-pan") return 120;
  return 90;
};

const templates = [];
for (const block of categoryBlocks) {
  const category = block[1].trim();
  const rows = [...block[3].matchAll(/^\| ([^|]+) \| `([^`]+)` \| ([^|]+) \|$/gmu)];
  for (const row of rows) {
    const title = row[1].trim();
    const file = row[2].trim();
    const description = row[3].trim();
    if (title === "Template" || file === "File") continue;
    const slug = file.replace(/\.tsx$/u, "");
    const sourcePath = path.join(templateDir, file);
    await fs.access(sourcePath);
    const componentName = `Rve${slugToPascal(slug)}`;
    templates.push({
      slug,
      title,
      category,
      description,
      file,
      componentName,
      compositionId: `RVE${slugToPascal(slug)}`,
      durationInFrames: durationForSlug(slug),
      width: 960,
      height: 540,
      fps: 30,
      sourcePath: `external/rve-remotion-templates/templates/${file}`,
      originalDemo: `https://www.reactvideoeditor.com/remotion-templates/${slug}`,
      mp4: `generated/rve-official-effect-preview/${slug}.mp4`,
      status: "official-source-rendered-not-adapted",
    });
  }
}

if (templates.length !== 81) {
  throw new Error(`Expected 81 RVE templates from README, got ${templates.length}`);
}

const imports = templates
  .map((template) => `import ${template.componentName} from "../../external/rve-remotion-templates/templates/${template.slug}";`)
  .join("\n");

const registryEntries = templates.map((template) => `  {
    slug: ${JSON.stringify(template.slug)},
    title: ${JSON.stringify(template.title)},
    category: ${JSON.stringify(template.category)},
    description: ${JSON.stringify(template.description)},
    file: ${JSON.stringify(template.file)},
    compositionId: ${JSON.stringify(template.compositionId)},
    durationInFrames: ${template.durationInFrames},
    width: ${template.width},
    height: ${template.height},
    fps: ${template.fps},
    sourcePath: ${JSON.stringify(template.sourcePath)},
    originalDemo: ${JSON.stringify(template.originalDemo)},
    mp4: ${JSON.stringify(template.mp4)},
    status: ${JSON.stringify(template.status)},
    component: ${template.componentName},
  }`).join(",\n");

const tsx = `import type { ComponentType } from "react";
${imports}

export type RveOfficialTemplate = {
  slug: string;
  title: string;
  category: string;
  description: string;
  file: string;
  compositionId: string;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  sourcePath: string;
  originalDemo: string;
  mp4: string;
  status: "official-source-rendered-not-adapted";
  component: ComponentType;
};

export const rveOfficialTemplates: RveOfficialTemplate[] = [
${registryEntries}
];
`;

const categories = categoryBlocks.map((block) => block[1].trim());
await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
await fs.writeFile(outputTsxPath, tsx);
await fs.writeFile(outputJsonPath, `${JSON.stringify({
  contract: "A1RveOfficialTemplateRegistry/v1",
  generatedAt: "2026-07-07",
  sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
  sourceReadme: "external/rve-remotion-templates/README.md",
  categories,
  templates: templates.map(({ componentName, ...template }) => template),
}, null, 2)}\n`);

console.log(JSON.stringify({
  contract: "A1RveOfficialTemplateRegistryBuild/v1",
  templates: templates.length,
  categories: categories.length,
  outputTsxPath,
  outputJsonPath,
}, null, 2));
