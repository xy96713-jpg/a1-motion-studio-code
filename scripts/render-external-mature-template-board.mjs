import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, ".codex-artifacts", "external-mature-template-index", "external-mature-template-index.json");
const report = JSON.parse(await fs.readFile(indexPath, "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "external-mature-template-board", stamp);
await fs.mkdir(artifactDir, { recursive: true });

const taskTitles = {
  kinetic_text_lead: "开场 / 章节标题",
  kinetic_text_claim: "观点 / 引用强调",
  real_evidence_image: "真实图片 / 证据",
  generated_editorial_poster: "抽象概念 / 主题海报",
  comparison_split: "对比 / 前后关系",
  data_timeline: "数据 / 时间线",
  resolve_ending: "结尾 / 收束",
  transition_system: "镜头转场 / 承接",
};

const sourceLabels = {
  remocn: "Remocn",
  rve: "RVE Templates",
  bits: "Remotion Bits",
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]);

const candidatesById = new Map(report.rankedCandidates.map((candidate) => [candidate.id, candidate]));
const firstWaveCards = Object.entries(report.firstWave).map(([task, ids]) => ({
  task,
  title: taskTitles[task] || task,
  a1ShotTemplate: report.tasks[task]?.a1ShotTemplate || "",
  requiredTraits: report.tasks[task]?.requiredTraits || [],
  candidates: ids.map((id) => candidatesById.get(id)).filter(Boolean),
}));

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 External Mature Template Board</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080806;
      --panel: #12130f;
      --panel-2: #181a14;
      --line: rgba(241, 244, 232, .14);
      --line-strong: rgba(215, 255, 77, .42);
      --text: #f4f5ec;
      --muted: rgba(244, 245, 236, .66);
      --faint: rgba(244, 245, 236, .42);
      --accent: #d7ff4d;
      --warn: #f5bc57;
      --good: #8cf6bf;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
    }
    main {
      width: 1800px;
      padding: 44px;
      background:
        radial-gradient(circle at 74px 110px, rgba(215,255,77,.13), transparent 340px),
        linear-gradient(180deg, rgba(255,255,255,.04), transparent 420px),
        var(--bg);
    }
    header {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 44px;
      align-items: end;
      padding-bottom: 30px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 26px;
    }
    h1 {
      margin: 0;
      font-size: 58px;
      line-height: .92;
      letter-spacing: 0;
      max-width: 1040px;
    }
    header p {
      margin: 0;
      color: var(--muted);
      font-size: 20px;
      line-height: 1.42;
    }
    .sources {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 28px;
    }
    .source {
      border: 1px solid var(--line);
      background: rgba(18,19,15,.74);
      padding: 16px 18px;
      min-height: 116px;
    }
    .source strong {
      display: block;
      font-size: 18px;
      margin-bottom: 8px;
    }
    .source span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.42;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
    }
    article {
      min-height: 440px;
      background: linear-gradient(180deg, rgba(255,255,255,.035), transparent), var(--panel);
      border: 1px solid var(--line);
      padding: 20px;
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 18px;
    }
    .task-head {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 14px;
    }
    .kicker {
      color: var(--accent);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h2 {
      margin: 6px 0 0;
      font-size: 30px;
      line-height: 1.02;
      letter-spacing: 0;
    }
    .a1 {
      color: var(--muted);
      font: 700 13px ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: right;
      max-width: 240px;
    }
    .traits {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .traits span {
      border: 1px solid rgba(215,255,77,.24);
      color: rgba(215,255,77,.9);
      padding: 5px 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .candidates {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-content: start;
    }
    .candidate {
      background: var(--panel-2);
      border: 1px solid var(--line);
      padding: 14px;
      min-height: 132px;
      display: grid;
      gap: 8px;
    }
    .candidate-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    .candidate h3 {
      margin: 0;
      font-size: 18px;
      line-height: 1.08;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }
    .badge {
      flex: 0 0 auto;
      padding: 4px 7px;
      border: 1px solid var(--line-strong);
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .candidate p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.36;
    }
    code {
      color: var(--faint);
      font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    .risk {
      color: var(--warn);
    }
    .score {
      color: var(--good);
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="kicker">External Mature Sources Only</div>
        <h1>文章动画成熟模板候选板</h1>
      </div>
      <p>这张板只展示联网拉取的成熟项目候选，不包含当前项目自制黑绿线框模板。下一步应从这里挑第一批模板做 A1 adapter 和实际样片。</p>
    </header>
    <section class="sources">
      ${Object.entries(report.sources).map(([id, source]) => `
        <div class="source">
          <strong>${escapeHtml(sourceLabels[id] || id)} · ${escapeHtml(source.repo)}</strong>
          <span>${escapeHtml(source.stars)} stars · ${escapeHtml(source.license)} · ${escapeHtml(source.integrationMode)}</span>
          <span>${escapeHtml(source.homepage || "")}</span>
        </div>
      `).join("")}
    </section>
    <section class="grid">
      ${firstWaveCards.map((card) => `
        <article>
          <div class="task-head">
            <div>
              <div class="kicker">${escapeHtml(card.task)}</div>
              <h2>${escapeHtml(card.title)}</h2>
            </div>
            <div class="a1">A1 route<br>${escapeHtml(card.a1ShotTemplate)}</div>
          </div>
          <div class="traits">
            ${card.requiredTraits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join("")}
          </div>
          <div class="candidates">
            ${card.candidates.map((candidate) => `
              <div class="candidate">
                <div class="candidate-top">
                  <h3>${escapeHtml(candidate.name || candidate.id)}</h3>
                  <span class="badge">${escapeHtml(sourceLabels[candidate.sourceId] || candidate.sourceId)}</span>
                </div>
                <p>${escapeHtml(candidate.recommendedUse)}</p>
                <code>${escapeHtml(candidate.sourceRepo)}/${escapeHtml(candidate.sourcePath)}</code>
                <code class="risk">${escapeHtml(candidate.risk)}</code>
                <code class="score">priority ${escapeHtml(String(candidate.priorityScore))}</code>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </section>
  </main>
</body>
</html>`;

const htmlPath = path.join(artifactDir, "external-mature-template-board.html");
await fs.writeFile(htmlPath, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 2600 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
const pngPath = path.join(artifactDir, "external-mature-template-board.png");
await page.locator("main").screenshot({ path: pngPath });
await browser.close();

const boardReport = {
  contract: "A1ExternalMatureTemplateBoard/v1",
  generatedAt: new Date().toISOString(),
  sourceIndexPath: indexPath,
  htmlPath,
  pngPath,
  firstWaveCount: Object.values(report.firstWave).flat().length,
};
const reportPath = path.join(artifactDir, "report.json");
await fs.writeFile(reportPath, JSON.stringify(boardReport, null, 2));

console.log("External mature template board rendered.");
console.log(`HTML: ${htmlPath}`);
console.log(`PNG: ${pngPath}`);
console.log(`Report: ${reportPath}`);
